#!/usr/bin/env node
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { assertDisjointRoots, scanLegacyAppData } from './inventory.mjs'
import { snapshotSqlite } from './sqlite-snapshot.mjs'
import { adaptSqliteCatalog } from './sqlite-catalog-adapter.mjs'
import { adaptFabricatorCustomizer } from './fabricator-customizer-adapter.mjs'
import { adaptBaseVideoMedia } from './base-video-media-adapter.mjs'
import { adaptSelectedRecoveryArchives } from './recovery-archive-adapter.mjs'
import { buildSelectedPreparedMigration } from './conversion-pipeline.mjs'

const allowed = new Set(['--dry-run', '--application-closed', '--source-app-data', '--snapshot-dir', '--report'])
function argsFrom(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!allowed.has(key) || values.has(key)) throw new Error(`Argumento inválido ou repetido: ${key}`)
    if (key === '--dry-run' || key === '--application-closed') values.set(key, true)
    else {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${key}.`)
      values.set(key, value)
    }
  }
  for (const key of allowed) if (!values.has(key)) throw new Error(`Argumento obrigatório ausente: ${key}`)
  return {
    source: path.resolve(values.get('--source-app-data')),
    snapshot: path.resolve(values.get('--snapshot-dir')),
    report: path.resolve(values.get('--report')),
    applicationClosed: values.get('--application-closed') === true
  }
}

async function exists(target) {
  try { await lstat(target); return true }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function assertOutsideGitWorktree(target) {
  let current = path.dirname(target)
  while (true) {
    if (await exists(path.join(current, '.git'))) throw new Error('Saída local recusada dentro de worktree Git.')
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

async function assertPrivateOutput(target) {
  await assertOutsideGitWorktree(target)
  if (await exists(target)) throw new Error(`Destino já existe e não será sobrescrito: ${target}`)
  let current = path.dirname(target)
  const missing = []
  while (!(await exists(current))) {
    missing.push(current)
    const parent = path.dirname(current)
    if (parent === current) throw new Error('Não foi possível validar pasta de saída.')
    current = parent
  }
  for (const candidate of [current, ...missing.reverse()]) {
    if ((await lstat(candidate)).isSymbolicLink() || !sameCanonical(candidate, await realpath(candidate))) throw new Error('Saída ligada a symlink/junction recusada.')
  }
}

function sameCanonical(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

const { source, snapshot, report, applicationClosed } = argsFrom(process.argv.slice(2))
if (!sameCanonical(path.resolve(source), await realpath(source))) throw new Error('Raiz de app-data precisa ser canônica.')
const sqliteSource = path.join(source, 'database', 'catalog.sqlite')
assertDisjointRoots(source, snapshot)
assertDisjointRoots(source, report)
assertDisjointRoots(snapshot, report)
await assertPrivateOutput(snapshot)
await assertPrivateOutput(report)

const inventory = await scanLegacyAppData(source)
const snapshotResult = await snapshotSqlite({ sourcePath: sqliteSource, destinationPath: snapshot, applicationClosed })
const catalog = adaptSqliteCatalog(snapshotResult.snapshotPath, { selectedScope: true })
const domainAdapter = await adaptFabricatorCustomizer({ appDataRoot: source, snapshotPath: snapshotResult.snapshotPath })
const baseVideoMedia = await adaptBaseVideoMedia({ appDataRoot: source, snapshotPath: snapshotResult.snapshotPath, catalog })
const recoveryArchives = await adaptSelectedRecoveryArchives({ appDataRoot: source })
const inventorySha256 = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
const selectedReviewRequired = inventory.files.filter((item) => ['fabricator', 'customizer', 'libraries.video'].some((domain) => item.domain === domain) && ['review', 'inspect'].includes(item.disposition)).length
const prepared = buildSelectedPreparedMigration({ catalog, fabricatorCustomizer: domainAdapter, baseVideoMedia, recoveryArchives, inventorySha256, selectedReviewRequired })
const byDomain = inventory.summary.byDomain
const summary = {
  reportVersion: 1,
  mode: 'dry-run',
  conversionExecuted: false,
  snapshot: { sha256: snapshotResult.sha256, byteLength: snapshotResult.byteLength },
  scope: { selectedDomains: prepared.plan.selectedDomains, excludedDomains: ['studio', 'roteiros', 'editorV6', 'preferences', 'unrelatedLibraries'] },
  inventory: { files: inventory.summary.files, bytes: inventory.summary.byteLength, reviewRequired: inventory.summary.reviewRequired,
    selectedFiles: ['fabricator', 'customizer', 'libraries.video', 'fabricator.recovery', 'baseVideos.recovery'].reduce((n, domain) => n + (byDomain[domain]?.files ?? 0), 0),
    pendingFilesAudited: ['fabricator.recovery', 'baseVideos.recovery', 'roteiros.recovery'].reduce((n, domain) => n + (byDomain[domain]?.files ?? 0), 0)
      + inventory.excluded.filter((item) => item.domain === 'electron-profile' || item.domain === 'roteiros.recovery').length,
    excludedPendingFiles: inventory.excluded.filter((item) => item.domain === 'electron-profile' || item.domain === 'roteiros.recovery').length,
    auditByDomain: Object.fromEntries(Object.entries(byDomain).map(([domain, item]) => [domain, item.files])) },
  modules: prepared.plan.modules,
  counts: {
    fabricatorFiles: domainAdapter.domains.fabricator.files.length,
    fabricatorEntities: domainAdapter.domains.fabricator.entities.length,
    customizerFiles: domainAdapter.domains.customizer.files.length,
    characters: domainAdapter.domains.customizer.entities.length,
    baseVideos: catalog.domains.baseVideos.catalog.videos.length,
    baseVideoPublished: catalog.domains.baseVideos.catalog.videos.filter((video) => video.status === 'published').length,
    baseVideoDrafts: catalog.domains.baseVideos.catalog.videos.filter((video) => video.status === 'draft').length,
    baseVideoMedia: baseVideoMedia.media.length,
    selectedRecoveryFilesConverted: recoveryArchives.audit.convertedFiles,
    selectedRecoverySqliteOperationalFilesIgnored: recoveryArchives.audit.ignoredOperationalFiles,
    selectedRecoveryManifestsVerified: recoveryArchives.audit.verifiedManifests,
    excludedBaseVideoOrphanMedia: baseVideoMedia.excluded.unreferencedMediaFiles,
    shadowConflicts: domainAdapter.conflicts.length,
    sqliteUnknownTables: catalog.unknownTables.length,
    contentAssets: prepared.assets.length
  },
  sqliteAudit: {
    rowsByTable: catalog.rowCounts,
    totalRows: Object.values(catalog.rowCounts).reduce((sum, count) => sum + count, 0),
    investigatedRawRows: ['app_metadata', 'domains', 'domain_directories', 'domain_files', 'domain_storage_state', 'schema_migrations'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    selectedDomainMetadata: catalog.scopeRows.selectedDomainMetadata,
    excludedDomainMetadata: catalog.scopeRows.allDomainMetadata - catalog.scopeRows.selectedDomainMetadata,
    selectedShadowFilesReconciled: catalog.scopeRows.selectedDomainFiles,
    excludedDomainFiles: catalog.scopeRows.allDomainFiles - catalog.scopeRows.selectedDomainFiles,
    semanticBaseVideoRows: ['base_video_details', 'base_video_categories', 'base_video_category_assignments', 'base_video_sequence'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    excludedRoteirosRows: ['roteiros', 'roteiro_tiktoks', 'roteiro_sections', 'roteiro_export_logs', 'roteiro_character_sheets', 'roteiro_import_origins'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    derivedSearchRowsIgnored: ['asset_search_config', 'asset_search_data'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    unmappedRows: 0
  },
  blockers: {
    codes: [...new Set([...domainAdapter.blocked, ...baseVideoMedia.blocked].map((item) => item.code))],
    unknownSqliteTables: catalog.unknownTables.length,
    plan: prepared.plan.blockers
  },
  planStatus: prepared.plan.status,
  ignoredPendingFiles: { count: inventory.files.filter((item) => item.domain === 'roteiros.recovery' || item.domain === 'electron-profile').length,
    reasons: { 'roteiros.recovery': 'fora do escopo selecionado', 'electron-profile': 'preferências gerais fora do escopo selecionado' } },
  note: 'Relatório privado agregado; nenhum bundle foi escrito nesta etapa dry-run. Manter snapshot e relatório fora do Git.'
}
await mkdir(path.dirname(report), { recursive: true })
await writeFile(report, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`Dry-run finalizado: ${prepared.plan.status}; ${summary.counts.characters} personagens, ${summary.counts.shadowConflicts} conflitos. Nenhum bundle foi escrito.\n`)
