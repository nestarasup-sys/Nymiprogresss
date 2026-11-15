import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const domainForLegacyId = (id) => {
  if (typeof id !== 'string') return null
  if (id.startsWith('fabricator.')) return 'fabricator'
  if (id === 'customizer.characters') return 'customizer'
  if (id.startsWith('studio.')) return 'studio'
  if (id.startsWith('video-studio.')) return 'libraries'
  return null
}
const empty = () => ({ catalogRecords: [], preservedUnknown: [] })

function quoteIdentifier(value) { return `"${value.replace(/"/g, '""')}"` }

function blobAsset(bytes, assets) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (!assets.has(digest)) assets.set(digest, {
    id: `sha256:${digest}`, sha256: digest, byteLength: bytes.length, mediaType: 'application/octet-stream',
    path: `assets/sha256/${digest.slice(0, 2)}/${digest}`, bytes
  })
  return { $asset: `sha256:${digest}` }
}

function portableValue(value, assets) {
  if (Buffer.isBuffer(value)) return blobAsset(value, assets)
  if (typeof value === 'string') {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
    if (match) {
      const encoded = match[2].replace(/\s/g, '')
      const bytes = Buffer.from(encoded, 'base64')
      if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error('Data URL inválida em conteúdo SQLite; catalog adapter bloqueado.')
      return { $asset: blobAsset(bytes, assets).$asset, mediaType: match[1] }
    }
    if (/^data:image\//i.test(value)) throw new Error('Data URL de imagem não reconhecida em conteúdo SQLite; catalog adapter bloqueado.')
    if (/^[\[{]/.test(value.trim())) {
      try {
        const parsed = JSON.parse(value)
        const converted = portableValue(parsed, assets)
        if (JSON.stringify(converted) !== JSON.stringify(parsed)) return { $json: converted }
      } catch (error) {
        if (/Data URL/.test(error.message)) throw error
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => portableValue(item, assets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portableValue(item, assets)]))
  return value
}

function portableRow(row, assets) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, portableValue(value, assets)]))
}

function tableDestination(table, row) {
  if (table === 'roteiros' || table.startsWith('roteiro_')) return 'roteiros'
  if (table.startsWith('base_video_')) return 'baseVideos'
  if (table === 'app_metadata' || table === 'schema_migrations' || table === 'domain_migrations' || table === 'migration_runs') return 'preferences'
  if (table === 'domains' || table === 'domain_storage_state' || table === 'domain_directories') return domainForLegacyId(row.domain_id) ?? 'preferences'
  if (table === 'assets' || table === 'asset_objects') return domainForLegacyId(row.domain_id) ?? 'libraries'
  if (table === 'domain_files') return domainForLegacyId(row.domain_id) ?? 'preferences'
  if (table === 'objects') return 'libraries'
  if (table === 'entity_references') return domainForLegacyId(row.source_domain) ?? domainForLegacyId(row.target_domain) ?? 'preferences'
  return null
}

/** Extracts catalog rows from an already-created SQLite snapshot. Every row retains its source table and full original columns. */
export function adaptSqliteCatalog(snapshotPath) {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true })
  const domains = Object.fromEntries(['fabricator', 'customizer', 'studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences'].map((name) => [name, empty()]))
  const assets = new Map()
  const unknownTables = []
  try {
    const version = db.pragma('user_version', { simple: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all()
      let unmapped = 0
      for (const sourceRow of rows) {
        const destination = tableDestination(table, sourceRow)
        const record = { sourceTable: table, values: portableRow(sourceRow, assets) }
        if (destination) domains[destination].catalogRecords.push(record)
        else { domains.preferences.preservedUnknown.push(record); unmapped += 1 }
      }
      if (unmapped || !tableDestination(table, {})) unknownTables.push({ table, rows: unmapped })
    }
    return {
      schemaVersion: version,
      domains,
      assets: [...assets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)),
      unknownTables,
      ready: unknownTables.length === 0
    }
  } finally { db.close() }
}
