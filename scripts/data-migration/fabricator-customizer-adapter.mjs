import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const DOMAIN_ROOTS = Object.freeze([
  { source: 'fabricator.models', relative: 'fabricator/models', target: 'fabricator' },
  { source: 'fabricator.design-settings', relative: 'fabricator/design-settings', target: 'fabricator' },
  { source: 'fabricator.poses', relative: 'fabricator/poses', target: 'fabricator' },
  { source: 'fabricator.animations', relative: 'fabricator/animations', target: 'fabricator' },
  { source: 'fabricator.wardrobe', relative: 'fabricator/wardrobe', target: 'fabricator' },
  { source: 'fabricator.face-components', relative: 'fabricator/face-components', target: 'fabricator' },
  { source: 'fabricator.expression-presets', relative: 'fabricator/expression-presets', target: 'fabricator' },
  { source: 'fabricator.hair', relative: 'fabricator/hair', target: 'fabricator' },
  { source: 'fabricator.face-sets', relative: 'fabricator/faces', target: 'fabricator' },
  { source: 'customizer.characters', relative: 'customizer/characters', target: 'customizer' }
])

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const safeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200
const emptyDomain = () => ({ entities: [], files: [], preservedUnknown: [] })

function within(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function resolveCatalogObject(appDataRoot, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('Caminho de objeto SQLite inválido.')
  const target = path.resolve(appDataRoot, relativePath)
  if (!within(appDataRoot, target)) throw new Error('Objeto SQLite escapou da raiz de app-data.')
  return target
}

async function readTreeFiles(root, relativeRoot) {
  const base = path.join(root, ...relativeRoot.split('/'))
  const result = []
  async function visit(directory, relativeDirectory = '') {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) }
    catch (error) { if (error.code === 'ENOENT') return; throw error }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const absolutePath = path.join(directory, entry.name)
      const stats = await lstat(absolutePath)
      if (stats.isSymbolicLink()) throw new Error(`Symlink recusado no adaptador: ${relativeRoot}/${relativePath}.`)
      if (stats.isDirectory()) await visit(absolutePath, relativePath)
      else if (stats.isFile()) result.push({ relativePath, bytes: await readFile(absolutePath), source: 'filesystem' })
      else throw new Error(`Arquivo especial recusado no adaptador: ${relativeRoot}/${relativePath}.`)
    }
  }
  await visit(base)
  return result
}

function catalogRows(snapshotPath, sourceDomain) {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true })
  try {
    const state = db.prepare('SELECT state FROM domain_storage_state WHERE domain_id=?').get(sourceDomain)?.state ?? 'legacy'
    const rows = db.prepare('SELECT relative_path, content_text, object_sha256, byte_length, content_sha256 FROM domain_files WHERE domain_id=? ORDER BY relative_path').all(sourceDomain)
    const objectLookup = db.prepare('SELECT relative_path FROM objects WHERE sha256=?')
    return { state, rows: rows.map((row) => ({ ...row, objectPath: row.object_sha256 ? objectLookup.get(row.object_sha256)?.relative_path : null })) }
  } finally { db.close() }
}

async function materializeCatalogRows(appDataRoot, rows) {
  const result = []
  for (const row of rows) {
    let bytes
    if (row.content_text !== null) bytes = Buffer.from(row.content_text, 'utf8')
    else {
      if (!row.objectPath) throw new Error(`Objeto SQLite ausente para ${row.relative_path}.`)
      bytes = await readFile(resolveCatalogObject(appDataRoot, row.objectPath))
    }
    if (bytes.length !== row.byte_length || hash(bytes) !== row.content_sha256) throw new Error(`Hash/tamanho inválido em domain_files:${row.relative_path}.`)
    result.push({ relativePath: row.relative_path, bytes, source: 'sqlite-domain-files' })
  }
  return result
}

function extractEmbeddedAssets(value, assets) {
  if (typeof value === 'string') {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
    if (!match) {
      if (/^data:image\//i.test(value)) throw new Error('Data URL de imagem inválida ou não suportada.')
      return value
    }
    const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
    if (!bytes.length || bytes.toString('base64') !== match[2].replace(/\s/g, '')) throw new Error('Data URL base64 inválida encontrada no JSON legado.')
    return { $asset: addAsset(bytes, match[1], assets) }
  }
  if (Array.isArray(value)) return value.map((item) => extractEmbeddedAssets(item, assets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extractEmbeddedAssets(item, assets)]))
  return value
}

function addAsset(bytes, mediaType, assets) {
  const digest = hash(bytes)
  if (!assets.has(digest)) assets.set(digest, {
    id: `sha256:${digest}`, sha256: digest, byteLength: bytes.length, mediaType,
    path: `assets/sha256/${digest.slice(0, 2)}/${digest}`, bytes
  })
  return `sha256:${digest}`
}

function parseFile(file, targetDomain, assets) {
  const digest = hash(file.bytes)
  const ext = path.posix.extname(file.relativePath).toLowerCase()
  const record = { relativePath: file.relativePath, sourceCopies: [file.source], sha256: digest }
  if (ext === '.json') {
    try {
      const document = JSON.parse(file.bytes.toString('utf8'))
      record.document = extractEmbeddedAssets(document, assets)
      if (targetDomain === 'customizer' && file.relativePath.toLowerCase() === 'characters.json') {
        if (!Array.isArray(document)) throw new Error('characters.json precisa conter uma lista JSON.')
        for (const character of document) {
          if (!character || typeof character !== 'object' || Array.isArray(character) || !safeId(character.id)) {
            throw new Error('Personagem do Customizador sem ID estável; migração bloqueada.')
          }
          const customization = character.customization ?? {}
          record.entities ??= []
          record.entities.push({ id: character.id, document: extractEmbeddedAssets(character, assets) })
          if (Number.isInteger(customization.modelSlot) && Number.isInteger(customization.poseSlot)) {
            record.references ??= []
            record.references.push({ from: `customizer.character:${character.id}`, relation: 'usesPoseSlot', to: `fabricator.poseSlot:${customization.modelSlot}:${customization.poseSlot}` })
          }
        }
      } else {
        const identity = document && typeof document === 'object' && !Array.isArray(document)
          ? document.id ?? document.slotId ?? document.modelSlot
          : null
        if (identity !== null && identity !== undefined) record.entityId = String(identity)
      }
    } catch (error) {
      record.parseError = error.message
      record.opaqueAsset = addAsset(file.bytes, 'application/json', assets)
    }
  } else {
    record.opaqueAsset = addAsset(file.bytes, 'application/octet-stream', assets)
    record.preservedUnknown = true
  }
  return record
}

/** Reads only Fabricator/Customizer source files and their SQLite shadow copies. It never writes to app-data. */
export async function adaptFabricatorCustomizer({ appDataRoot, snapshotPath }) {
  const root = path.resolve(appDataRoot)
  const profile = path.join(root, 'runtime', 'profile')
  const result = { domains: { fabricator: emptyDomain(), customizer: emptyDomain() }, assets: new Map(), conflicts: [], blocked: [] }
  const refs = []
  const characterIds = new Set()
  for (const mapping of DOMAIN_ROOTS) {
    const [physical, catalog] = await Promise.all([
      readTreeFiles(profile, mapping.relative),
      materializeCatalogRows(root, catalogRows(snapshotPath, mapping.source).rows)
    ])
    const physicalByPath = new Map(physical.map((file) => [file.relativePath, file]))
    const catalogByPath = new Map(catalog.map((file) => [file.relativePath, file]))
    const allPaths = [...new Set([...physicalByPath.keys(), ...catalogByPath.keys()])].sort()
    const target = result.domains[mapping.target]
    for (const relativePath of allPaths) {
      const fsCopy = physicalByPath.get(relativePath)
      const sqlCopy = catalogByPath.get(relativePath)
      if (fsCopy && sqlCopy && !fsCopy.bytes.equals(sqlCopy.bytes)) {
        result.conflicts.push({ domain: mapping.source, relativePath, filesystemSha256: hash(fsCopy.bytes), catalogSha256: hash(sqlCopy.bytes) })
        result.blocked.push({ code: 'shadow-conflict', domain: mapping.source, relativePath })
        // Preserve both alternatives in the output model; do not pick a winner.
        target.files.push(parseFile({ ...fsCopy, relativePath: `conflicts/${mapping.source}/filesystem/${relativePath}` }, mapping.target, result.assets))
        target.files.push(parseFile({ ...sqlCopy, relativePath: `conflicts/${mapping.source}/sqlite/${relativePath}` }, mapping.target, result.assets))
        continue
      }
      const chosen = fsCopy ?? sqlCopy
      const migrated = parseFile(chosen, mapping.target, result.assets)
      if (fsCopy && sqlCopy) migrated.sourceCopies = ['filesystem', 'sqlite-domain-files']
      if (migrated.entities) for (const entity of migrated.entities) {
        if (mapping.target === 'customizer' && characterIds.has(entity.id)) {
          result.blocked.push({ code: 'duplicate-character-id', domain: mapping.source, id: entity.id })
        } else {
          if (mapping.target === 'customizer') characterIds.add(entity.id)
          target.entities.push(entity)
        }
      }
      if (migrated.references) refs.push(...migrated.references)
      if (migrated.preservedUnknown || migrated.parseError) target.preservedUnknown.push({ relativePath, sha256: migrated.sha256, asset: migrated.opaqueAsset ?? null, parseError: migrated.parseError ?? null })
      if (migrated.parseError) result.blocked.push({ code: 'unparsed-json-preserved', domain: mapping.source, relativePath })
      target.files.push(migrated)
    }
  }
  result.references = refs
  const availablePoseSlots = new Set(result.domains.fabricator.files.flatMap((file) => {
    const match = /^model-(\d+)\/slot-(\d+)\/pose\.json$/i.exec(file.relativePath)
    return match ? [`${match[1]}:${match[2]}`] : []
  }))
  for (const reference of refs) {
    const pose = /^fabricator\.poseSlot:(\d+):(\d+)$/.exec(reference.to)
    if (pose && !availablePoseSlots.has(`${pose[1]}:${pose[2]}`)) {
      result.blocked.push({ code: 'unresolved-pose-reference', from: reference.from, target: reference.to })
    }
  }
  result.assets = [...result.assets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
  result.ready = result.blocked.length === 0
  return result
}

export const FABRICATOR_CUSTOMIZER_SOURCE_DOMAINS = DOMAIN_ROOTS.map(({ source }) => source)
