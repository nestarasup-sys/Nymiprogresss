import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const domains = () => ({ studio: { projects: [], assets: [], prints: [] }, editorV6: { projects: [], assets: [], prints: [] }, libraries: { videos: [], backgrounds: [], editorAssets: [] }, preferences: { editorV6Export: { configured: false } } })

function addAsset(bytes, mediaType, assets) {
  const digest = sha256(bytes)
  if (!assets.has(digest)) assets.set(digest, { id: `sha256:${digest}`, sha256: digest, byteLength: bytes.length, mediaType, path: `assets/sha256/${digest.slice(0, 2)}/${digest}`, bytes })
  return `sha256:${digest}`
}

function externalize(value, assets) {
  if (typeof value === 'string') {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
    if (!match) {
      if (/^data:/i.test(value)) throw new Error('Data URL inválida ou não suportada em documento de Studio/Editor V6.')
      return value
    }
    const encoded = match[2].replace(/\s/g, '')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error('Data URL base64 inválida em documento de Studio/Editor V6.')
    return { $asset: addAsset(bytes, match[1], assets) }
  }
  if (Array.isArray(value)) return value.map((item) => externalize(item, assets))
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, externalize(item, assets)]))
  return value
}

async function walk(root, relative = '') {
  const result = []
  let entries
  try { entries = await readdir(path.join(root, relative), { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return result; throw error }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    const target = path.join(root, ...rel.split('/'))
    const info = await lstat(target)
    if (info.isSymbolicLink()) throw new Error(`Symlink recusado em arquivo de projeto persistente: ${rel}.`)
    if (info.isDirectory()) result.push(...await walk(root, rel))
    else if (info.isFile()) result.push({ relativePath: rel, bytes: await readFile(target) })
    else throw new Error(`Arquivo especial recusado em arquivo persistente: ${rel}.`)
  }
  return result
}

function requireProjectShape(document, kind) {
  if (!record(document) || document.schemaVersion !== 1 || typeof document.id !== 'string' || !document.id
    || typeof document.title !== 'string' || !Array.isArray(document.assets) || !Array.isArray(document.elements)) {
    throw new Error(`Documento ${kind} incompatível com o schema persistido real v1.`)
  }
  if (kind === 'editorV6' && (!record(document.timeline) || !Array.isArray(document.timeline.tracks))) {
    throw new Error('Timeline do Editor V6 inválida ou ausente.')
  }
}

function mediaType(file) {
  const extension = path.posix.extname(file).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.webm': 'audio/webm' })[extension] ?? 'application/octet-stream'
}

async function projectArea(profile, folder, kind, assets) {
  const root = path.join(profile, 'studios', folder)
  const files = await walk(root)
  const result = { projects: [], assets: [], prints: [], blocked: [], excludedDiagnosticReports: 0 }
  const projectFiles = files.filter((file) => path.posix.basename(file.relativePath) === (kind === 'studio' ? 'studio.json' : 'editorV6.json'))
  const projectIds = new Set()
  for (const file of projectFiles) {
    let doc
    try { doc = JSON.parse(file.bytes.toString('utf8')) }
    catch { result.blocked.push({ code: 'invalid-project-json' }); continue }
    try { requireProjectShape(doc, kind) }
    catch { result.blocked.push({ code: 'project-schema-invalid' }); continue }
    if (projectIds.has(doc.id)) { result.blocked.push({ code: 'duplicate-project-id' }); continue }
    projectIds.add(doc.id)
    const projectDir = path.posix.dirname(file.relativePath)
    const projectAssetFiles = files.filter((candidate) => candidate.relativePath.startsWith(`${projectDir}/assets/`))
    const sidecars = projectAssetFiles.map((candidate) => {
      const id = path.posix.basename(candidate.relativePath, path.posix.extname(candidate.relativePath))
      const ref = addAsset(candidate.bytes, mediaType(candidate.relativePath), assets)
      result.assets.push({ projectId: doc.id, sourceId: id, reference: ref, byteLength: candidate.bytes.length, mediaType: mediaType(candidate.relativePath) })
      return id
    })
    const externalized = externalize(doc, assets)
    const assetIds = new Set(doc.assets.map((asset) => asset?.id).filter(Boolean))
    for (const sidecarId of sidecars) if (assetIds.size && !assetIds.has(sidecarId)) result.blocked.push({ code: 'unlinked-project-sidecar' })
    result.projects.push({ id: doc.id, schemaVersion: 1, title: doc.title, document: externalized })
  }
  for (const file of files) {
    if (/\.report\.json$/i.test(file.relativePath)) { result.excludedDiagnosticReports += 1; continue }
    if (/\/prints\//i.test(`/${file.relativePath}`)) {
      const projectId = path.posix.dirname(file.relativePath).split('/')[0].replace(/^editorV6-/, '')
      result.prints.push({ projectId, reference: addAsset(file.bytes, mediaType(file.relativePath), assets) })
      continue
    }
    if (file.relativePath.startsWith('assets/')) continue
    if (['studio.json', 'editorV6.json'].includes(path.posix.basename(file.relativePath))) continue
    if (path.posix.extname(file.relativePath).toLowerCase() === '.json' && !/\.report\.json$/i.test(file.relativePath)) result.blocked.push({ code: 'unclassified-project-json' })
  }
  return result
}

async function readCatalog(pathname) {
  try { return JSON.parse(await readFile(pathname, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

export async function adaptStudioEditorLibrariesPreferences({ appDataRoot }) {
  const profile = path.join(appDataRoot, 'runtime', 'profile')
  const result = { domains: domains(), assets: new Map(), blocked: [], counts: { excludedDiagnosticReports: 0 } }
  for (const [folder, kind] of [['Studio Principal', 'studio'], ['Editor V6', 'editorV6']]) {
    const adapted = await projectArea(profile, folder, kind, result.assets)
    result.domains[kind] = { projects: adapted.projects, assets: adapted.assets, prints: adapted.prints }
    result.blocked.push(...adapted.blocked.map((blocker) => ({ ...blocker, domain: kind })))
    result.counts.excludedDiagnosticReports += adapted.excludedDiagnosticReports
  }
  const videoRoot = path.join(profile, 'studios', 'Editor Gacha')
  const videoCatalog = await readCatalog(path.join(videoRoot, 'media-library', 'catalog.json'))
  const backgroundCatalog = await readCatalog(path.join(videoRoot, 'background-library', 'catalog.json'))
  if (videoCatalog !== null) {
    if (!record(videoCatalog) || !Array.isArray(videoCatalog.items)) result.blocked.push({ code: 'video-library-schema-invalid' })
    else {
      const files = await walk(path.join(videoRoot, 'media-library'))
      for (const item of videoCatalog.items) {
        if (!record(item) || typeof item.id !== 'string') { result.blocked.push({ code: 'video-library-item-invalid' }); continue }
        const media = files.find((file) => file.relativePath === `videos/${item.id}.mp4`)
        if (!media) { result.blocked.push({ code: 'video-library-media-missing' }); continue }
        result.domains.libraries.videos.push({ item: externalize(item, result.assets), media: addAsset(media.bytes, 'video/mp4', result.assets), byteLength: media.bytes.length })
      }
      if (files.some((file) => file.relativePath.startsWith('videos/') && !videoCatalog.items.some((item) => file.relativePath === `videos/${item.id}.mp4`))) result.blocked.push({ code: 'unreferenced-video-library-media' })
    }
  }
  if (backgroundCatalog !== null) {
    if (!record(backgroundCatalog) || !Array.isArray(backgroundCatalog.items)) result.blocked.push({ code: 'background-library-schema-invalid' })
    else {
      const files = await walk(path.join(videoRoot, 'background-library'))
      for (const item of backgroundCatalog.items) {
        if (!record(item) || typeof item.id !== 'string') { result.blocked.push({ code: 'background-library-item-invalid' }); continue }
        const media = files.find((file) => file.relativePath === `images/${item.id}.png` || file.relativePath === `images/${item.id}.jpg` || file.relativePath === `images/${item.id}.webp`)
        if (!media) { result.blocked.push({ code: 'background-library-media-missing' }); continue }
        result.domains.libraries.backgrounds.push({ item: externalize(item, result.assets), media: addAsset(media.bytes, mediaType(media.relativePath), result.assets), byteLength: media.bytes.length })
      }
    }
  }
  const preferencePath = path.join(profile, 'editor-v6-export-folder.json')
  const preference = await readCatalog(preferencePath)
  if (preference !== null) {
    if (!record(preference) || typeof preference.folder !== 'string') result.blocked.push({ code: 'export-folder-preference-invalid' })
    else result.domains.preferences.editorV6Export = { configured: Boolean(preference.folder), value: null, resetReason: 'machine-local-path-not-portable' }
  }
  result.ready = result.blocked.length === 0
  result.assets = [...result.assets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
  return result
}
