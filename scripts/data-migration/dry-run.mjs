#!/usr/bin/env node
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { assertDisjointRoots, scanLegacyAppData } from './inventory.mjs'
import { snapshotSqlite } from './sqlite-snapshot.mjs'
import { adaptSqliteCatalog } from './sqlite-catalog-adapter.mjs'
import { adaptFabricatorCustomizer } from './fabricator-customizer-adapter.mjs'
import { adaptStudioEditorLibrariesPreferences } from './studio-editor-libraries-adapter.mjs'
import { buildPreparedMigration } from './conversion-pipeline.mjs'

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
const catalog = adaptSqliteCatalog(snapshotResult.snapshotPath)
const domainAdapter = await adaptFabricatorCustomizer({ appDataRoot: source, snapshotPath: snapshotResult.snapshotPath })
const studioEditorLibraries = await adaptStudioEditorLibrariesPreferences({ appDataRoot: source })
const inventorySha256 = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
const prepared = buildPreparedMigration({ catalog, fabricatorCustomizer: domainAdapter, studioEditorLibraries, inventorySha256, reviewRequired: inventory.summary.reviewRequired })
const summary = {
  reportVersion: 1,
  mode: 'dry-run',
  conversionExecuted: false,
  snapshot: { sha256: snapshotResult.sha256, byteLength: snapshotResult.byteLength },
  inventory: { files: inventory.summary.files, bytes: inventory.summary.byteLength, reviewRequired: inventory.summary.reviewRequired },
  unclassifiedFileCounts: Object.fromEntries(Object.entries(inventory.summary.byDomain)
    .filter(([domain]) => domain === 'unclassified' || domain === 'electron-profile')
    .map(([domain, summary]) => [domain, summary.files])),
  modules: prepared.plan.modules,
  counts: {
    fabricatorFiles: domainAdapter.domains.fabricator.files.length,
    fabricatorEntities: domainAdapter.domains.fabricator.entities.length,
    customizerFiles: domainAdapter.domains.customizer.files.length,
    characters: domainAdapter.domains.customizer.entities.length,
    studioProjects: studioEditorLibraries.domains.studio.projects.length,
    editorV6Projects: studioEditorLibraries.domains.editorV6.projects.length,
    videos: studioEditorLibraries.domains.libraries.videos.length,
    backgroundLibraryItems: studioEditorLibraries.domains.libraries.backgrounds.length,
    excludedEditorDiagnosticReports: studioEditorLibraries.counts.excludedDiagnosticReports,
    shadowConflicts: domainAdapter.conflicts.length,
    sqliteUnknownTables: catalog.unknownTables.length,
    contentAssets: prepared.assets.length
  },
  blockers: {
    codes: [...new Set([...domainAdapter.blocked, ...studioEditorLibraries.blocked].map((item) => item.code))],
    unknownSqliteTables: catalog.unknownTables.length,
    plan: prepared.plan.blockers
  },
  planStatus: prepared.plan.status,
  note: 'Aggregate-only private report; no canonical bundle was written. Keep the snapshot and report outside Git.'
}
await mkdir(path.dirname(report), { recursive: true })
await writeFile(report, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`Dry-run finalizado: ${prepared.plan.status}; ${summary.counts.characters} personagens, ${summary.counts.shadowConflicts} conflitos. Nenhum bundle foi escrito.\n`)
