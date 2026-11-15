import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { adaptFabricatorCustomizer } from '../../scripts/data-migration/fabricator-customizer-adapter.mjs'
import { adaptSqliteCatalog } from '../../scripts/data-migration/sqlite-catalog-adapter.mjs'
import { snapshotSqlite } from '../../scripts/data-migration/sqlite-snapshot.mjs'
import { buildPreparedMigration } from '../../scripts/data-migration/conversion-pipeline.mjs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const execFileAsync = promisify(execFile)

async function createCatalog(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const db = new Database(filePath)
  db.exec(`
    PRAGMA user_version=19;
    CREATE TABLE domain_storage_state(domain_id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE domain_files(domain_id TEXT NOT NULL, relative_path TEXT NOT NULL, content_text TEXT, object_sha256 TEXT,
      byte_length INTEGER NOT NULL, content_sha256 TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(domain_id, relative_path));
    CREATE TABLE objects(sha256 TEXT PRIMARY KEY, relative_path TEXT NOT NULL);
    CREATE TABLE custom_extra(payload TEXT);
    CREATE TABLE roteiro_sections(section_id TEXT PRIMARY KEY, roteiro_id TEXT, blocks_json TEXT);
    CREATE TABLE base_video_details(video_id TEXT PRIMARY KEY, video_number INTEGER);
  `)
  return db
}

test('creates a read-only SQLite online-backup snapshot, verifies it, and refuses without closed-app assertion', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-sqlite-snapshot-'))
  const source = path.join(temporary, 'source', 'catalog.sqlite')
  const output = path.join(temporary, 'private-snapshot')
  try {
    const db = await createCatalog(source)
    db.prepare('INSERT INTO custom_extra(payload) VALUES (?)').run('synthetic')
    db.close()
    const before = require('node:crypto').createHash('sha256').update(await readFile(source)).digest('hex')
    await assert.rejects(snapshotSqlite({ sourcePath: source, destinationPath: output }), /applicationClosed/)
    const result = await snapshotSqlite({ sourcePath: source, destinationPath: output, applicationClosed: true })
    assert.equal(result.byteLength > 0, true)
    assert.match(result.sha256, /^[a-f0-9]{64}$/)
    const snapshot = new Database(result.snapshotPath, { readonly: true })
    assert.equal(snapshot.prepare('SELECT payload FROM custom_extra').get().payload, 'synthetic')
    snapshot.close()
    const original = new Database(source, { readonly: true })
    try { assert.equal(original.pragma('user_version', { simple: true }), 19) } finally { original.close() }
    assert.equal(require('node:crypto').createHash('sha256').update(await readFile(source)).digest('hex'), before)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('dry-run CLI writes only aggregate report and SQLite snapshot for an explicit synthetic source', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-dry-run-cli-'))
  const source = path.join(temporary, 'synthetic-app-data')
  const snapshot = path.join(temporary, 'private-snapshot')
  const report = path.join(temporary, 'private-report.json')
  try {
    const db = await createCatalog(path.join(source, 'database', 'catalog.sqlite'))
    db.prepare('INSERT INTO custom_extra VALUES (?)').run('synthetic fixture only')
    db.close()
    const cli = path.resolve('scripts/data-migration/dry-run.mjs')
    const { stdout } = await execFileAsync(process.execPath, [cli, '--dry-run', '--application-closed', '--source-app-data', source, '--snapshot-dir', snapshot, '--report', report], { cwd: path.resolve('.') })
    assert.match(stdout, /Nenhum bundle foi escrito/)
    const result = JSON.parse(await readFile(report, 'utf8'))
    assert.equal(result.conversionExecuted, false)
    assert.equal(result.planStatus, 'blocked')
    assert.equal(result.modules.fabricator.status, 'ready')
    assert.equal(result.modules.sqliteCatalog.status, 'blocked')
    assert.ok((await readFile(path.join(snapshot, 'catalog.sqlite'))).length > 0)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('maps catalog tables by module and retains unrecognized rows verbatim in blocked preservation records', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-catalog-adapter-'))
  const filePath = path.join(temporary, 'catalog.sqlite')
  try {
    const db = await createCatalog(filePath)
    db.prepare('INSERT INTO roteiro_sections VALUES (?, ?, ?)').run('sec-1', 'roteiro-1', '[{"id":"block-1"}]')
    db.prepare('INSERT INTO base_video_details VALUES (?, ?)').run('video-7', 7)
    db.prepare('INSERT INTO custom_extra VALUES (?)').run('keep me')
    db.close()
    const adapted = adaptSqliteCatalog(filePath)
    assert.equal(adapted.domains.roteiros.catalogRecords[0].values.section_id, 'sec-1')
    assert.equal(adapted.domains.baseVideos.catalogRecords[0].values.video_id, 'video-7')
    assert.equal(adapted.domains.preferences.preservedUnknown.find((row) => row.sourceTable === 'custom_extra').values.payload, 'keep me')
    assert.equal(adapted.ready, false)
    assert.ok(adapted.unknownTables.some((entry) => entry.table === 'custom_extra'))
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('externalizes embedded image data in SQLite JSON columns and blocks until nonimplemented modules are mapped', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-catalog-data-uri-'))
  const filePath = path.join(temporary, 'catalog.sqlite')
  try {
    const db = await createCatalog(filePath)
    const dataUrl = `data:image/png;base64,${Buffer.from('synthetic image bytes').toString('base64')}`
    db.prepare('INSERT INTO roteiro_sections VALUES (?, ?, ?)').run('section-image', 'roteiro-x', JSON.stringify([{ image: dataUrl }]))
    db.close()
    const catalog = adaptSqliteCatalog(filePath)
    const row = catalog.domains.roteiros.catalogRecords[0].values.blocks_json
    assert.equal(JSON.stringify(row).includes('data:image/png;base64,'), false)
    assert.equal(catalog.assets[0].bytes.toString(), 'synthetic image bytes')
    const domainAdapter = { ready: true, conflicts: [], domains: { fabricator: { entities: [], files: [], preservedUnknown: [] }, customizer: { entities: [], files: [], preservedUnknown: [] } }, assets: [], references: [] }
    const prepared = buildPreparedMigration({ catalog, fabricatorCustomizer: domainAdapter, inventorySha256: 'a'.repeat(64) })
    assert.equal(prepared.plan.status, 'blocked')
    assert.equal(prepared.manifest, null)
    assert.equal(prepared.plan.modules.studio.status, 'blocked')
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('blocks a character reference in a roteiro when its Customizer entity is absent', () => {
  const domains = Object.fromEntries(['fabricator', 'customizer', 'studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences'].map((name) => [name, { catalogRecords: [], preservedUnknown: [], documents: [] }]))
  domains.roteiros.documents.push({ id: 'roteiro-fixture', characterIds: ['character-missing'] })
  const catalog = { domains, assets: [], unknownTables: [] }
  const fabricatorCustomizer = {
    ready: true, conflicts: [], blocked: [], assets: [], references: [],
    domains: { fabricator: { entities: [], files: [], preservedUnknown: [] }, customizer: { entities: [], files: [], preservedUnknown: [] } }
  }
  const prepared = buildPreparedMigration({ catalog, fabricatorCustomizer, inventorySha256: 'c'.repeat(64) })
  assert.equal(prepared.plan.modules.customizer.status, 'blocked')
  assert.ok(prepared.plan.blockers.some((blocker) => blocker.code === 'unresolved-character-references' && blocker.references === 1))
})

test('reconciles byte-identical Fabricator shadows, preserves Customizer IDs/pose links, and retains conflicts without choosing a winner', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-domain-adapter-'))
  const appData = path.join(temporary, 'app-data')
  const dbPath = path.join(appData, 'database', 'catalog.sqlite')
  try {
    const db = await createCatalog(dbPath)
    const poseJson = JSON.stringify({ id: 'pose-id-4', modelSlot: 2, slot: 4, customField: 'preserve' })
    const characterJson = JSON.stringify([
      { id: 'char-stable-1', name: 'Synthetic', customization: { modelSlot: 2, poseSlot: 4, extra: 'keep' } },
      { id: 'char-stable-2', name: 'Orphan reference', customization: { modelSlot: 9, poseSlot: 9 } }
    ])
    const conflictFs = JSON.stringify({ id: 'model-slot-2', revision: 'physical' })
    const conflictSql = JSON.stringify({ id: 'model-slot-2', revision: 'catalog' })
    const insertFile = db.prepare('INSERT INTO domain_files VALUES (?, ?, ?, NULL, ?, ?, ?)')
    const digest = (text) => require('node:crypto').createHash('sha256').update(text).digest('hex')
    insertFile.run('fabricator.poses', 'model-2/slot-4/pose.json', poseJson, Buffer.byteLength(poseJson), digest(poseJson), 'now')
    insertFile.run('fabricator.models', 'slot-2/model.json', conflictSql, Buffer.byteLength(conflictSql), digest(conflictSql), 'now')
    insertFile.run('customizer.characters', 'characters.json', characterJson, Buffer.byteLength(characterJson), digest(characterJson), 'now')
    db.close()
    const physicalPose = path.join(appData, 'runtime', 'profile', 'fabricator', 'poses', 'model-2', 'slot-4', 'pose.json')
    const physicalModel = path.join(appData, 'runtime', 'profile', 'fabricator', 'models', 'slot-2', 'model.json')
    const physicalCharacters = path.join(appData, 'runtime', 'profile', 'customizer', 'characters', 'characters.json')
    for (const target of [physicalPose, physicalModel, physicalCharacters]) await mkdir(path.dirname(target), { recursive: true })
    await writeFile(physicalPose, poseJson)
    await writeFile(physicalModel, conflictFs)
    await writeFile(physicalCharacters, characterJson)
    const adapted = await adaptFabricatorCustomizer({ appDataRoot: appData, snapshotPath: dbPath })
    assert.equal(adapted.domains.customizer.entities[0].id, 'char-stable-1')
    assert.equal(adapted.references[0].to, 'fabricator.poseSlot:2:4')
    const poseEntry = adapted.domains.fabricator.files.find((entry) => entry.relativePath.endsWith('pose.json'))
    assert.deepEqual(poseEntry.sourceCopies, ['filesystem', 'sqlite-domain-files'])
    assert.equal(poseEntry.document.customField, 'preserve')
    assert.equal(adapted.conflicts.length, 1)
    assert.equal(adapted.blocked[0].code, 'shadow-conflict')
    assert.ok(adapted.blocked.some((item) => item.code === 'unresolved-pose-reference'))
    assert.ok(adapted.domains.fabricator.files.some((entry) => entry.relativePath.includes('conflicts/fabricator.models/filesystem')))
    assert.ok(adapted.domains.fabricator.files.some((entry) => entry.relativePath.includes('conflicts/fabricator.models/sqlite')))
    assert.equal((await readFile(physicalModel, 'utf8')), conflictFs)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
