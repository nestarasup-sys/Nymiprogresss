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
import { verifyBackupArchive, verifyCanonicalBundle, writeCanonicalBundle } from './bundle-writer.mjs'

const required = ['--application-closed', '--backup-app-data', '--snapshot-dir', '--bundle-dir', '--report']
const values = new Map()
for (let index = 0; index < process.argv.length - 2; index += 1) {
  const key = process.argv[index + 2]
  if (!required.includes(key) || values.has(key)) throw new Error(`Argumento inválido ou repetido: ${key}`)
  if (key === '--application-closed') values.set(key, true)
  else {
    const value = process.argv[index + 3]
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${key}.`)
    values.set(key, value)
    index += 1
  }
}
for (const key of required) if (!values.has(key)) throw new Error(`Argumento obrigatório ausente: ${key}.`)
if (values.get('--application-closed') !== true) throw new Error('Confirme que a origem da migração está fechada.')

const appDataRoot = path.resolve(values.get('--backup-app-data'))
const snapshotDir = path.resolve(values.get('--snapshot-dir'))
const bundleDir = path.resolve(values.get('--bundle-dir'))
const reportPath = path.resolve(values.get('--report'))

async function exists(target) { try { await lstat(target); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
async function assertPrivateOutput(target) {
  if (await exists(target)) throw new Error(`Destino existente recusado, sem sobrescrever: ${target}`)
  let current = path.dirname(target)
  while (true) {
    if (await exists(current)) {
      const stats = await lstat(current)
      if (stats.isSymbolicLink() || current !== await realpath(current)) throw new Error('Saída privada ligada a symlink recusada.')
    }
    if (await exists(path.join(current, '.git'))) throw new Error('Saída privada dentro de worktree Git recusada.')
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

if (appDataRoot !== await realpath(appDataRoot)) throw new Error('Raiz do backup precisa ser canônica.')
assertDisjointRoots(appDataRoot, snapshotDir)
assertDisjointRoots(appDataRoot, bundleDir)
assertDisjointRoots(snapshotDir, bundleDir)
assertDisjointRoots(snapshotDir, reportPath)
assertDisjointRoots(bundleDir, reportPath)
await Promise.all([snapshotDir, bundleDir, reportPath].map(assertPrivateOutput))

const backup = await verifyBackupArchive(appDataRoot)
const inventory = await scanLegacyAppData(appDataRoot)
const snapshot = await snapshotSqlite({ sourcePath: path.join(appDataRoot, 'database', 'catalog.sqlite'), destinationPath: snapshotDir, applicationClosed: true })
const catalog = adaptSqliteCatalog(snapshot.snapshotPath, { selectedScope: true })
const fabricatorCustomizer = await adaptFabricatorCustomizer({ appDataRoot, snapshotPath: snapshot.snapshotPath })
const baseVideoMedia = await adaptBaseVideoMedia({ appDataRoot, snapshotPath: snapshot.snapshotPath, catalog })
const recoveryArchives = await adaptSelectedRecoveryArchives({ appDataRoot })
const selectedReviewRequired = inventory.files.filter((item) => ['fabricator', 'customizer', 'libraries.video'].includes(item.domain) && ['review', 'inspect'].includes(item.disposition)).length
const inventorySha256 = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
const prepared = buildSelectedPreparedMigration({ catalog, fabricatorCustomizer, baseVideoMedia, recoveryArchives, inventorySha256, selectedReviewRequired })
if (prepared.plan.status !== 'ready' || !prepared.manifest) throw new Error(`Conversão cancelada: dry-run selecionado contém bloqueios (${prepared.plan.blockers.map((item) => item.code).join(', ') || 'integridade'}).`)
await writeCanonicalBundle({ manifest: prepared.manifest, assets: prepared.assets, destinationRoot: bundleDir, execute: true })
const bundle = await verifyCanonicalBundle(bundleDir)
const summary = {
  format: prepared.manifest.format,
  formatVersion: prepared.manifest.formatVersion,
  selectedDomains: prepared.plan.selectedDomains,
  backup: { fileCount: backup.fileCount, byteLength: backup.byteLength, manifestSha256: backup.manifestSha256 },
  snapshot: { sha256: snapshot.sha256, byteLength: snapshot.byteLength },
  bundle,
  counts: {
    fabricatorFiles: fabricatorCustomizer.domains.fabricator.files.length,
    fabricatorEntities: fabricatorCustomizer.domains.fabricator.entities.length,
    customizerCharacters: fabricatorCustomizer.domains.customizer.entities.length,
    baseVideos: catalog.domains.baseVideos.catalog.videos.length,
    published: catalog.domains.baseVideos.catalog.videos.filter((video) => video.status === 'published').length,
    drafts: catalog.domains.baseVideos.catalog.videos.filter((video) => video.status === 'draft').length,
    media: baseVideoMedia.media.length,
    recoveryHistory: recoveryArchives.audit.convertedFiles,
    excludedRecoverySqlite: recoveryArchives.audit.ignoredOperationalFiles,
    orphanVideoMedia: baseVideoMedia.excluded.unreferencedMediaFiles,
    assets: prepared.assets.length
  },
  audit: {
    pendingFiles: recoveryArchives.audit.convertedFiles + recoveryArchives.audit.ignoredOperationalFiles
      + inventory.excluded.filter((item) => item.domain === 'electron-profile' || item.domain === 'roteiros.recovery').length,
    pendingSelectedRecoveryConverted: recoveryArchives.audit.convertedFiles,
    pendingRecoveryOperationalFilesIgnored: recoveryArchives.audit.ignoredOperationalFiles,
    pendingExcludedByScope: inventory.excluded.filter((item) => item.domain === 'electron-profile' || item.domain === 'roteiros.recovery').length,
    sqliteRowsByTable: catalog.rowCounts,
    sqliteTotalRows: Object.values(catalog.rowCounts).reduce((sum, count) => sum + count, 0),
    sqliteInvestigatedRawRows: ['app_metadata', 'domains', 'domain_directories', 'domain_files', 'domain_storage_state', 'schema_migrations'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    sqliteSelectedDomainMetadata: catalog.scopeRows.selectedDomainMetadata,
    sqliteExcludedDomainMetadata: catalog.scopeRows.allDomainMetadata - catalog.scopeRows.selectedDomainMetadata,
    sqliteSelectedShadowFilesReconciled: catalog.scopeRows.selectedDomainFiles,
    sqliteExcludedDomainFiles: catalog.scopeRows.allDomainFiles - catalog.scopeRows.selectedDomainFiles,
    sqliteSemanticBaseVideoRows: ['base_video_details', 'base_video_categories', 'base_video_category_assignments', 'base_video_sequence'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    sqliteExcludedRoteirosRows: ['roteiros', 'roteiro_tiktoks', 'roteiro_sections', 'roteiro_export_logs', 'roteiro_character_sheets', 'roteiro_import_origins'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    sqliteDerivedSearchRowsIgnored: ['asset_search_config', 'asset_search_data'].reduce((sum, table) => sum + (catalog.rowCounts[table] ?? 0), 0),
    sqliteUnmappedRows: 0,
    unresolvedSelectedFiles: selectedReviewRequired
  },
  sourceInventorySha256: inventorySha256,
  conversion: 'completed'
}
await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`Conversão finalizada e bundle validado: ${bundle.assetCount} assets, ${summary.counts.customizerCharacters} personagens, ${summary.counts.baseVideos} vídeos.\n`)
