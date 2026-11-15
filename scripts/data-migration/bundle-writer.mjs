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

/** Independently rechecks that a completed backup is a complete, current byte-for-byte copy. */
export async function verifyVerifiedBackup(sourceRoot, backupRoot) {
  assertDisjointRoots(sourceRoot, backupRoot)
  const source = path.resolve(sourceRoot)
  const backup = path.resolve(backupRoot)
  for (const [root, label] of [[source, 'Origem'], [backup, 'Backup']]) {
    const stats = await lstat(root)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${label} precisa ser uma pasta real.`)
  }
  const manifest = JSON.parse(await readFile(path.join(backup, 'backup-manifest.json'), 'utf8'))
  if (manifest.format !== 'nymiprogress.legacy-backup' || manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Manifesto do backup inválido.')
  }
  const expected = new Map()
  for (const entry of manifest.files) {
    const relativePath = assertSafeBundleRelativePath(entry.relativePath)
    if (expected.has(relativePath) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.byteLength)) {
      throw new Error('Manifesto do backup contém entrada repetida ou inválida.')
    }
    expected.set(relativePath, entry)
  }
  const [sourceFiles, backupFiles] = await Promise.all([listFiles(source), listFiles(backup)])
  const backupPayload = backupFiles.filter((file) => file.relativePath !== 'backup-manifest.json')
  const comparePathSet = (files, label) => {
    if (files.length !== expected.size) throw new Error(`${label} tem quantidade de arquivos diferente do manifesto.`)
    for (const file of files) {
      const entry = expected.get(file.relativePath)
      if (!entry || entry.byteLength !== file.byteLength) throw new Error(`${label} difere do manifesto em tamanho/caminho: ${file.relativePath}.`)
    }
  }
  comparePathSet(sourceFiles, 'Origem atual')
  comparePathSet(backupPayload, 'Backup')
  for (const [relativePath, entry] of expected) {
    const sourceBytes = await readFile(path.join(source, ...relativePath.split('/')))
    const backupBytes = await readFile(path.join(backup, ...relativePath.split('/')))
    const sourceHash = hash(sourceBytes)
    if (sourceHash !== entry.sha256 || sourceHash !== hash(backupBytes)) {
      throw new Error(`Hash da origem ou backup difere do manifesto: ${relativePath}.`)
    }
  }
  return {
    verified: true,
    fileCount: expected.size,
    byteLength: [...expected.values()].reduce((sum, item) => sum + item.byteLength, 0),
    manifestSha256: hash(Buffer.from(JSON.stringify(manifest)))
  }
}

/** Verifies an immutable backup against its own manifest when the live application is running. */
export async function verifyBackupArchive(backupRoot) {
  const backup = path.resolve(backupRoot)
  const rootStats = await lstat(backup)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('Backup precisa ser uma pasta real.')
  const manifest = JSON.parse(await readFile(path.join(backup, 'backup-manifest.json'), 'utf8'))
  if (manifest.format !== 'nymiprogress.legacy-backup' || manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Manifesto do backup inválido.')
  const expected = new Map()
  for (const entry of manifest.files) {
    const relativePath = assertSafeBundleRelativePath(entry.relativePath)
    if (expected.has(relativePath) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error('Manifesto do backup contém entrada inválida.')
    expected.set(relativePath, entry)
  }
  const actualFiles = (await listFiles(backup)).filter((file) => file.relativePath !== 'backup-manifest.json')
  if (actualFiles.length !== expected.size) throw new Error('Backup difere do manifesto em quantidade de arquivos.')
  let byteLength = 0
  for (const file of actualFiles) {
    const entry = expected.get(file.relativePath)
    if (!entry || entry.byteLength !== file.byteLength) throw new Error(`Backup difere do manifesto em caminho/tamanho: ${file.relativePath}.`)
    const bytes = await readFile(path.join(backup, ...file.relativePath.split('/')))
    if (hash(bytes) !== entry.sha256) throw new Error(`Hash do backup difere do manifesto: ${file.relativePath}.`)
    byteLength += bytes.length
  }
  return { verified: true, fileCount: expected.size, byteLength, manifestSha256: hash(Buffer.from(JSON.stringify(manifest))) }
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

export async function verifyCanonicalBundle(bundleRoot) {
  const root = path.resolve(bundleRoot)
  const rootStats = await lstat(root)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('Bundle precisa ser uma pasta real.')
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  assertNativeDataManifest(manifest)
  const expected = new Map(manifest.assets.map((asset) => [asset.path, asset]))
  expected.set('manifest.json', null)
  const actual = await listFiles(root)
  if (actual.length !== expected.size) throw new Error('Bundle contém arquivos ausentes ou extras.')
  for (const file of actual) {
    if (!expected.has(file.relativePath)) throw new Error(`Arquivo extra no bundle: ${file.relativePath}.`)
    const bytes = await readFile(path.join(root, ...file.relativePath.split('/')))
    const entry = expected.get(file.relativePath)
    if (entry && (bytes.length !== entry.byteLength || hash(bytes) !== entry.sha256)) throw new Error(`Asset do bundle falhou na verificação: ${file.relativePath}.`)
  }
  return { verified: true, assetCount: manifest.assets.length, fileCount: actual.length, manifestSha256: hash(await readFile(path.join(root, 'manifest.json'))) }
}

export function buildBackupDestination(parent, sourceName) {
  return path.resolve(parent, `${sourceName}-backup-${randomUUID()}`)
}
