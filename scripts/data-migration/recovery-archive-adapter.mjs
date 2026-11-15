import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const ARCHIVES = [
  { prefix: 'face-expression-geometry-', domain: 'fabricator' },
  { prefix: 'face-expression-geometry-pre-transfer-', domain: 'fabricator' },
  { prefix: 'hair-dev-before-clear-', domain: 'fabricator' },
  { prefix: 'hair-gender-before-', domain: 'fabricator' },
  { prefix: 'preset-effects-before-', domain: 'fabricator' },
  { prefix: 'preset-effects-draft-sync-before-', domain: 'fabricator' },
  { prefix: 'preset-shadows-before-', domain: 'fabricator' },
  { prefix: 'legacy-video-import-', domain: 'baseVideos' }
]
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

function addAsset(bytes, mediaType, assets) {
  const sha256 = hash(bytes)
  if (!assets.has(sha256)) assets.set(sha256, { id: `sha256:${sha256}`, sha256, byteLength: bytes.length, mediaType, path: `assets/sha256/${sha256.slice(0, 2)}/${sha256}`, bytes })
  return { $asset: `sha256:${sha256}` }
}

function extractDataUrls(value, assets) {
  if (typeof value === 'string') {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
    if (!match) {
      if (/^data:/i.test(value)) throw new Error('Data URL desconhecida em arquivo de recuperação selecionado.')
      return value
    }
    const encoded = match[2].replace(/\s/g, '')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error('Data URL inválida em arquivo de recuperação selecionado.')
    return addAsset(bytes, match[1], assets)
  }
  if (Array.isArray(value)) return value.map((item) => extractDataUrls(item, assets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extractDataUrls(item, assets)]))
  return value
}

async function walk(root, relative = '') {
  const output = []
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    const absolute = path.join(root, ...child.split('/'))
    const stats = await lstat(absolute)
    if (stats.isSymbolicLink()) throw new Error(`Symlink em arquivo de recuperação: ${child}.`)
    if (stats.isDirectory()) output.push(...await walk(root, child))
    else if (stats.isFile()) output.push({ relativePath: child, absolutePath: absolute, byteLength: stats.size })
    else throw new Error(`Arquivo especial em recuperação selecionada: ${child}.`)
  }
  return output
}

async function verifyArchiveManifest(archiveRoot) {
  const manifestPath = path.join(archiveRoot, 'backup-manifest.json')
  let manifest
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return { verified: false, entries: 0 }; throw new Error('Manifesto inválido em backup selecionado.') }
  const list = Array.isArray(manifest.files) ? manifest.files : Array.isArray(manifest.entries) ? manifest.entries : null
  if (!list) return { verified: false, entries: 0 }
  for (const entry of list) {
    let relativePath = (entry?.path ?? entry?.relativePath)?.replace(/\\/g, '/')
    if (relativePath?.startsWith('fabricator/')) relativePath = relativePath.slice('fabricator/'.length)
    const digest = typeof entry?.sha256 === 'string' ? entry.sha256.toLowerCase() : ''
    const byteLength = entry?.byteLength ?? entry?.bytes
    if (!entry || typeof relativePath !== 'string' || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)
      || relativePath.split('/').some((part) => !part || part === '.' || part === '..')
      || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new Error('Entrada inválida no manifesto de backup selecionado.')
    }
    let bytes
    try { bytes = await readFile(path.join(archiveRoot, ...relativePath.split('/'))) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      bytes = await readFile(path.join(archiveRoot, 'removed-active-hair-tree', ...relativePath.split('/')))
    }
    if (hash(bytes) !== digest || bytes.length !== byteLength) throw new Error(`Integridade de backup selecionado falhou: ${relativePath}.`)
  }
  return { verified: true, entries: list.length }
}

/** Converts retained selected-domain recovery snapshots to typed, hash-linked archive records. */
export async function adaptSelectedRecoveryArchives({ appDataRoot }) {
  const backupRoot = path.join(path.resolve(appDataRoot), 'backups')
  const result = { fabricator: [], baseVideos: [], assets: [], blocked: [], audit: { convertedFiles: 0, ignoredOperationalFiles: 0, verifiedManifests: 0, manifestFiles: 0 } }
  const assets = new Map()
  let archiveNames = []
  try { archiveNames = await readdir(backupRoot) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const entryName of archiveNames.sort()) {
    const spec = ARCHIVES.find(({ prefix }) => entryName.startsWith(prefix))
    if (!spec) continue
    const archiveRoot = path.join(backupRoot, entryName)
    const stats = await lstat(archiveRoot)
    if (stats.isSymbolicLink() || !stats.isDirectory()) { result.blocked.push({ code: 'selected-recovery-archive-invalid' }); continue }
    try {
      const integrity = await verifyArchiveManifest(archiveRoot)
      if (integrity.verified) { result.audit.verifiedManifests += 1; result.audit.manifestFiles += integrity.entries }
      const files = await walk(archiveRoot)
      for (const file of files) {
        const bytes = await readFile(file.absolutePath)
        const ext = path.extname(file.relativePath).toLowerCase()
        const record = { id: `recovery:${hash(Buffer.from(`${entryName}/${file.relativePath}`)).slice(0, 24)}`, archive: entryName, relativePath: file.relativePath, sourceSha256: hash(bytes) }
        if (ext === '.json') {
          let document
          try { document = JSON.parse(bytes.toString('utf8')) }
          catch { result.blocked.push({ code: 'selected-recovery-json-invalid', archive: entryName }); continue }
          record.kind = 'recovery-document'
          record.document = extractDataUrls(document, assets)
          record.sourceType = 'json'
          result[spec.domain].push(record)
          result.audit.convertedFiles += 1
        } else if (Object.hasOwn(MIME, ext)) {
          record.kind = 'recovery-media'
          record.asset = addAsset(bytes, MIME[ext], assets)
          record.sourceType = ext.slice(1)
          result[spec.domain].push(record)
          result.audit.convertedFiles += 1
        } else if (!ext && ['active', 'dismissed'].includes(bytes.toString('utf8').trim())) {
          record.kind = 'recovery-state-marker'
          record.sourceType = 'legacy-state-marker'
          record.state = bytes.toString('utf8').trim()
          result[spec.domain].push(record)
          result.audit.convertedFiles += 1
        } else if (spec.domain === 'baseVideos' && ['.sqlite', '.sqlite-wal', '.sqlite-shm'].includes(ext)) {
          // The checked import recovery database has zero video-detail/category rows;
          // it is an obsolete transaction snapshot, not an additional user video.
          result.audit.ignoredOperationalFiles += 1
        } else result.blocked.push({ code: 'selected-recovery-file-unclassified', archive: entryName })
      }
    } catch (error) {
      result.blocked.push({ code: 'selected-recovery-archive-integrity-failed', archive: entryName, message: error.message })
    }
  }
  result.assets = [...assets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
  result.fabricator.sort((a, b) => a.archive.localeCompare(b.archive) || a.relativePath.localeCompare(b.relativePath))
  result.baseVideos.sort((a, b) => a.archive.localeCompare(b.archive) || a.relativePath.localeCompare(b.relativePath))
  return result
}
