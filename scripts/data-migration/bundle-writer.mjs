import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { assertDisjointRoots } from './inventory.mjs'
import { assertNativeDataManifest, assertSafeBundleRelativePath } from './format.mjs'

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function listFiles(root, relativeDirectory = '') {
  const result = []
  for (const entry of await readdir(path.join(root, relativeDirectory), { withFileTypes: true })) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const absolutePath = path.join(root, ...relativePath.split('/'))
    const stats = await lstat(absolutePath)
    if (stats.isSymbolicLink()) throw new Error(`Symlink recusado no backup: ${relativePath}.`)
    if (stats.isDirectory()) result.push(...await listFiles(root, relativePath))
    else if (stats.isFile()) result.push({ relativePath, byteLength: stats.size })
    else throw new Error(`Arquivo especial recusado no backup: ${relativePath}.`)
  }
  return result
}

export async function createVerifiedBackup(sourceRoot, backupRoot) {
  assertDisjointRoots(sourceRoot, backupRoot)
  const source = path.resolve(sourceRoot)
  const sourceStats = await lstat(source)
  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) throw new Error('Origem do backup inválida.')
  const destination = path.resolve(backupRoot)
  const parent = path.dirname(destination)
  await mkdir(parent, { recursive: true })
  const stage = await mkdtemp(path.join(parent, `${path.basename(destination)}.partial-`))
  try {
    const sourceFiles = await listFiles(source)
    const manifestFiles = []
    for (const file of sourceFiles) {
      const relativePath = assertSafeBundleRelativePath(file.relativePath)
      const target = path.join(stage, ...relativePath.split('/'))
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(path.join(source, ...relativePath.split('/')), target)
      const bytes = await readFile(target)
      const sourceBytes = await readFile(path.join(source, ...relativePath.split('/')))
      const sourceSha256 = hash(sourceBytes)
      const backupSha256 = hash(bytes)
      if (sourceSha256 !== backupSha256) throw new Error(`A verificação do backup falhou: ${relativePath}.`)
      manifestFiles.push({ relativePath, byteLength: bytes.length, sha256: backupSha256 })
    }
    const backupManifest = { format: 'nymiprogress.legacy-backup', formatVersion: 1, createdAt: new Date().toISOString(), files: manifestFiles }
    await writeFile(path.join(stage, 'backup-manifest.json'), `${JSON.stringify(backupManifest, null, 2)}\n`, { flag: 'wx' })
    try { await lstat(destination); throw new Error('O destino do backup já existe; não será sobrescrito.') }
    catch (reason) { if (reason.code !== 'ENOENT') throw reason }
    await rename(stage, destination)
    return { destination, fileCount: manifestFiles.length, byteLength: manifestFiles.reduce((sum, item) => sum + item.byteLength, 0), backupManifest }
  } catch (reason) {
    await rm(stage, { recursive: true, force: true })
    throw reason
  }
}

export async function writeCanonicalBundle({ manifest, assets = [], destinationRoot, execute = false }) {
  assertNativeDataManifest(manifest)
  if (!execute) return { written: false, assetCount: manifest.assets.length, destinationRoot: path.resolve(destinationRoot) }
  const destination = path.resolve(destinationRoot)
  const parent = path.dirname(destination)
  await mkdir(parent, { recursive: true })
  const stage = await mkdtemp(path.join(parent, `${path.basename(destination)}.partial-`))
  try {
    const supplied = new Map(assets.map((asset) => [asset.sha256, asset.bytes]))
    if (supplied.size !== manifest.assets.length) throw new Error('Os bytes dos assets não correspondem ao índice do manifesto.')
    for (const entry of manifest.assets) {
      const relativePath = assertSafeBundleRelativePath(entry.path)
      const bytes = supplied.get(entry.sha256)
      if (!Buffer.isBuffer(bytes) || bytes.length !== entry.byteLength || hash(bytes) !== entry.sha256) {
        throw new Error(`Hash, tamanho ou bytes inválidos para o asset ${entry.id}.`)
      }
      const target = path.join(stage, ...relativePath.split('/'))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes, { flag: 'wx' })
    }
    await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    try { await lstat(destination); throw new Error('O destino do bundle já existe; não será sobrescrito.') }
    catch (reason) { if (reason.code !== 'ENOENT') throw reason }
    await rename(stage, destination)
    return { written: true, assetCount: manifest.assets.length, destinationRoot: destination }
  } catch (reason) {
    await rm(stage, { recursive: true, force: true })
    throw reason
  }
}

export function buildBackupDestination(parent, sourceName) {
  return path.resolve(parent, `${sourceName}-backup-${randomUUID()}`)
}
