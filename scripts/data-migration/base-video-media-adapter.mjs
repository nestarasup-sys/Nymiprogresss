import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const within = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function readTree(root) {
  const result = []
  async function visit(directory, relative = '') {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) }
    catch (error) { if (error.code === 'ENOENT') return; throw error }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      const absolute = path.join(directory, entry.name)
      const stats = await lstat(absolute)
      if (stats.isSymbolicLink()) throw new Error('Symlink recusado na biblioteca de vídeos selecionada.')
      if (stats.isDirectory()) await visit(absolute, rel)
      else if (stats.isFile()) result.push({ relativePath: rel, absolutePath: absolute, byteLength: stats.size })
      else throw new Error('Arquivo especial recusado na biblioteca de vídeos selecionada.')
    }
  }
  await visit(root)
  return result
}

function objectPath(root, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('Caminho de objeto SQLite inválido para mídia Base de vídeos.')
  const target = path.resolve(root, relativePath)
  if (!within(path.resolve(root), target)) throw new Error('Objeto SQLite escapou da raiz de app-data.')
  return target
}

function addAsset(bytes, mediaType, assets) {
  const digest = hash(bytes)
  if (!assets.has(digest)) assets.set(digest, {
    id: `sha256:${digest}`, sha256: digest, byteLength: bytes.length, mediaType,
    path: `assets/sha256/${digest.slice(0, 2)}/${digest}`, bytes
  })
  return `sha256:${digest}`
}

/** Selects only Base Video media items; other video-library entries are counted as excluded orphans. */
export async function adaptBaseVideoMedia({ appDataRoot, snapshotPath, catalog }) {
  const root = path.resolve(appDataRoot)
  const library = path.join(root, 'runtime', 'profile', 'studios', 'Editor Gacha', 'media-library')
  const catalogPath = path.join(library, 'catalog.json')
  const result = { media: [], assets: [], blocked: [], excluded: { unreferencedMediaFiles: 0, tombstonedItems: 0, transactionTemps: 0 }, shadowConflicts: 0 }
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true })
  const embeddedAssets = new Map()
  try {
    const videos = catalog.domains.baseVideos.catalog.videos
    const detailsById = new Map(videos.map((video) => [video.id, video]))
    const allFiles = await readTree(library)
    const fileByPath = new Map(allFiles.map((file) => [file.relativePath, file]))
    const domainRows = db.prepare('SELECT relative_path, content_text, object_sha256, byte_length, content_sha256 FROM domain_files WHERE domain_id=? ORDER BY relative_path').all('video-studio.media')
    const objectByHash = db.prepare('SELECT relative_path FROM objects WHERE sha256=?')
    const sqliteCopies = new Map()
    for (const row of domainRows) {
      let bytes
      if (row.content_text !== null) bytes = Buffer.from(row.content_text, 'utf8')
      else {
        const object = row.object_sha256 ? objectByHash.get(row.object_sha256) : null
        if (!object) throw new Error('Objeto SQLite ausente para arquivo do domínio de mídia Base de vídeos.')
        bytes = await readFile(objectPath(root, object.relative_path))
      }
      if (bytes.length !== row.byte_length || hash(bytes) !== row.content_sha256) throw new Error('Hash/tamanho inválido em arquivo de domínio da biblioteca de vídeos.')
      sqliteCopies.set(row.relative_path, bytes)
    }
    const diskCatalog = fileByPath.has('catalog.json') ? await readFile(fileByPath.get('catalog.json').absolutePath) : null
    const sqliteCatalog = sqliteCopies.get('catalog.json') ?? null
    if (diskCatalog && sqliteCatalog && !diskCatalog.equals(sqliteCatalog)) {
      result.shadowConflicts += 1
      result.blocked.push({ code: 'base-video-catalog-shadow-conflict' })
      return result
    }
    const catalogBytes = diskCatalog ?? sqliteCatalog
    if (!catalogBytes) {
      result.blocked.push({ code: 'base-video-media-catalog-missing' })
      return result
    }
    const mediaCatalog = JSON.parse(catalogBytes.toString('utf8'))
    if (!mediaCatalog || mediaCatalog.schemaVersion !== 1 || !Array.isArray(mediaCatalog.items) || !Array.isArray(mediaCatalog.deleted)) {
      throw new Error('Catálogo legado da biblioteca de vídeos não corresponde ao schema persistido v1.')
    }
    const validExtensions = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' }
    if (!mediaCatalog.items.every((item) => item && typeof item.id === 'string' && item.id.length > 0
      && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 255
      && Object.hasOwn(validExtensions, item.extension) && item.mimeType === validExtensions[item.extension]
      && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= 5 * 1024 ** 3
      && (item.durationFrames === null || Number.isSafeInteger(item.durationFrames) && item.durationFrames > 0)
      && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
      && (item.sha256 === undefined || /^[a-f0-9]{64}$/.test(item.sha256)))) throw new Error('Entrada inválida no catálogo da Base de vídeos.')
    if (!mediaCatalog.deleted.every((item) => item && typeof item.id === 'string' && Object.hasOwn(validExtensions, item.extension))) throw new Error('Tombstone inválido no catálogo da biblioteca de vídeos.')
    const seen = new Set()
    const readSelected = async (relativePath) => {
      const disk = fileByPath.get(relativePath)
      const sql = sqliteCopies.get(relativePath)
      if (disk && sql) {
        const diskBytes = await readFile(disk.absolutePath)
        if (!diskBytes.equals(sql)) {
          result.shadowConflicts += 1
          result.blocked.push({ code: 'base-video-shadow-conflict' })
          return null
        }
        return diskBytes
      }
      if (disk) return readFile(disk.absolutePath)
      return sql ?? null
    }
    for (const item of mediaCatalog.items) {
      if (!item || typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.id) || typeof item.extension !== 'string' || !/^[a-z0-9]{2,5}$/i.test(item.extension)) {
        result.blocked.push({ code: 'base-video-library-item-invalid' })
        continue
      }
      if (seen.has(item.id)) { result.blocked.push({ code: 'duplicate-base-video-media-id' }); continue }
      seen.add(item.id)
      const details = detailsById.get(item.id)
      if (!details) {
        // Media files without a catalog detail row still appear as Base Video drafts in the legacy UI.
        const orphanDetails = { id: item.id, status: 'draft', number: null, description: '', timeline: 'unspecified', sceneEndSeconds: null, firstGroupReactionSeconds: null, secondGroupReactionSeconds: null, additionalContext: '', updatedAt: null, categoryIds: [] }
        catalog.domains.baseVideos.catalog.videos.push(orphanDetails)
        catalog.domains.baseVideos.catalog.drafts.push(item.id)
      }
      const relativeMediaPath = `videos/${item.id}.${item.extension}`
      const bytes = await readSelected(relativeMediaPath)
      if (!bytes) { result.blocked.push({ code: 'base-video-media-missing' }); continue }
      if (bytes.length !== item.size || (item.sha256 && hash(bytes) !== item.sha256)) {
        result.blocked.push({ code: 'base-video-media-integrity-failed' })
        continue
      }
      const expectedType = item.mimeType
      if (typeof expectedType !== 'string' || !expectedType.startsWith('video/')) { result.blocked.push({ code: 'base-video-media-type-invalid' }); continue }
      result.media.push({
        id: item.id, name: item.name, extension: item.extension, mimeType: expectedType,
        size: item.size, durationFrames: item.durationFrames, createdAt: item.createdAt,
        sha256: hash(bytes), status: details?.status ?? 'draft',
        asset: { $asset: addAsset(bytes, expectedType, embeddedAssets) }
      })
    }
    for (const video of detailsById.values()) if (!seen.has(video.id)) result.blocked.push({ code: 'base-video-details-without-media' })
    const knownPaths = new Set(['catalog.json'])
    for (const item of mediaCatalog.items) knownPaths.add(`videos/${item.id}.${item.extension}`)
    for (const tombstone of mediaCatalog.deleted) {
      const deletedPath = `videos/${tombstone.id}.${tombstone.extension}`
      if (fileByPath.has(deletedPath)) result.excluded.tombstonedItems += 1
      knownPaths.add(deletedPath)
    }
    result.excluded.unreferencedMediaFiles = allFiles.filter((file) => file.relativePath.startsWith('videos/') && !knownPaths.has(file.relativePath)).length
    for (const [relativePath] of sqliteCopies) {
      if (knownPaths.has(relativePath)) continue
      if (relativePath.startsWith('videos/')) { result.excluded.unreferencedMediaFiles += 1; continue }
      if (/^catalog-[^/]+\.tmp$/.test(relativePath)) { result.excluded.transactionTemps += 1; continue }
      result.blocked.push({ code: 'unclassified-base-video-catalog-row' })
    }
    result.excluded.transactionTemps += allFiles.filter((file) => /^catalog-[^/]+\.tmp$/.test(file.relativePath)).length
  } finally { db.close() }
  result.assets = [...embeddedAssets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
  result.media.sort((a, b) => (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  catalog.domains.baseVideos.catalog.media = result.media
  catalog.domains.baseVideos.catalog.drafts = catalog.domains.baseVideos.catalog.videos.filter((video) => video.status === 'draft').map((video) => video.id)
  return result
}
