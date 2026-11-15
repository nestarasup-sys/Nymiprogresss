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
  if (table === 'assets' || table === 'asset_objects' || table === 'domain_image_refs') return domainForLegacyId(row.domain_id) ?? 'libraries'
  if (table === 'domain_files') return domainForLegacyId(row.domain_id) ?? 'preferences'
  if (table === 'objects') return 'libraries'
  if (table === 'entity_references') return domainForLegacyId(row.source_domain) ?? domainForLegacyId(row.target_domain) ?? 'preferences'
  return null
}

const DERIVED_SQLITE_TABLES = new Set(['asset_search', 'asset_search_config', 'asset_search_content', 'asset_search_data', 'asset_search_docsize', 'asset_search_idx'])
const SEMANTIC_TABLES = new Set([
  'roteiros', 'roteiro_tiktoks', 'roteiro_sections', 'roteiro_export_logs',
  'roteiro_character_sheets', 'roteiro_import_origins', 'base_video_details',
  'base_video_categories', 'base_video_category_assignments', 'base_video_sequence'
])

function semanticSqliteDomains(db, assets, domains) {
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name))
  const requiredColumns = {
    roteiros: ['id', 'character_ids_json'], roteiro_tiktoks: ['id', 'roteiro_id', 'position'],
    roteiro_sections: ['section_id', 'roteiro_id', 'section_kind', 'blocks_json'],
    base_video_details: ['video_id', 'video_number'], base_video_categories: ['category_id', 'name'],
    base_video_category_assignments: ['video_id', 'category_id'], base_video_sequence: ['sequence_id', 'next_number']
  }
  for (const [table, required] of Object.entries(requiredColumns)) {
    if (!existing.has(table)) continue
    const columns = new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name))
    if (required.some((column) => !columns.has(column))) return false
  }
  const all = (table) => existing.has(table) ? db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all().map((row) => portableRow(row, assets)) : []
  const roteiroRows = all('roteiros')
  const tiktoks = all('roteiro_tiktoks')
  const sections = all('roteiro_sections')
  const byRoteiro = new Map(roteiroRows.map((row) => [row.id, { ...row, characterIds: JSON.parse(row.character_ids_json), tiktoks: [], sections: [], exportHistory: [], importOrigin: null }]))
  const tiktokById = new Map(tiktoks.map((row) => [row.id, { ...row, sections: [] }]))
  for (const section of sections) {
    section.videoAsset = section.video_asset_json === null ? null : JSON.parse(section.video_asset_json)
    section.blocks = JSON.parse(section.blocks_json)
    delete section.video_asset_json
    delete section.blocks_json
    const parent = byRoteiro.get(section.roteiro_id)
    if (!parent) throw new Error('Seção de Roteiros sem roteiro correspondente.')
    if (section.section_kind === 'tiktok') {
      const tiktok = tiktokById.get(section.section_id)
      if (!tiktok || tiktok.roteiro_id !== section.roteiro_id) throw new Error('Seção TikTok sem entidade correspondente.')
      tiktok.sections.push(section)
    } else parent.sections.push(section)
  }
  for (const tiktok of tiktokById.values()) {
    const parent = byRoteiro.get(tiktok.roteiro_id)
    if (!parent) throw new Error('TikTok sem roteiro correspondente.')
    parent.tiktoks.push(tiktok)
  }
  for (const row of all('roteiro_export_logs')) byRoteiro.get(row.roteiro_id)?.exportHistory.push(row)
  for (const row of all('roteiro_import_origins')) {
    const parent = byRoteiro.get(row.roteiro_id)
    if (parent) {
      row.createdCharacterIds = JSON.parse(row.created_character_ids_json)
      if (row.source_document_json) row.sourceDocument = portableValue(JSON.parse(row.source_document_json), assets)
      delete row.created_character_ids_json
      delete row.source_document_json
      parent.importOrigin = row
    }
  }
  for (const roteiro of byRoteiro.values()) {
    roteiro.tiktoks.sort((a, b) => a.position - b.position)
    roteiro.sections.sort((a, b) => a.section_kind.localeCompare(b.section_kind) || a.section_id.localeCompare(b.section_id))
    domains.roteiros.documents.push(roteiro)
  }
  const videos = all('base_video_details').map((video) => ({ ...video, categories: [] }))
  const videoById = new Map(videos.map((video) => [video.video_id, video]))
  const categoryById = new Map(all('base_video_categories').map((category) => [category.category_id, { ...category, videoIds: [] }]))
  for (const assignment of all('base_video_category_assignments')) {
    const video = videoById.get(assignment.video_id)
    const category = categoryById.get(assignment.category_id)
    if (!video || !category) throw new Error('Atribuição de categoria de vídeo sem alvo correspondente.')
    video.categories.push(category.category_id)
    category.videoIds.push(video.video_id)
  }
  domains.baseVideos.catalog = {
    videos,
    categories: [...categoryById.values()],
    sequence: all('base_video_sequence')[0] ?? null
  }
  domains.roteiros.characterSheets = all('roteiro_character_sheets').map((row) => ({
    ...row, relationships: JSON.parse(row.relationships_json)
  }))
  return true
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
    for (const domain of Object.values(domains)) {
      domain.documents ??= []
      domain.catalog ??= null
    }
    const semanticCatalog = semanticSqliteDomains(db, assets, domains)
    for (const table of tables) {
      if (DERIVED_SQLITE_TABLES.has(table)) continue
      const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all()
      if (semanticCatalog && SEMANTIC_TABLES.has(table)) continue
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
      semanticCatalog,
      ready: unknownTables.length === 0
    }
  } finally { db.close() }
}
