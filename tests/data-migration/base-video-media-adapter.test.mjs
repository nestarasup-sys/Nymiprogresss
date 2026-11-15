import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { adaptBaseVideoMedia } from '../../scripts/data-migration/base-video-media-adapter.mjs'
import { adaptSqliteCatalog } from '../../scripts/data-migration/sqlite-catalog-adapter.mjs'

const Database = createRequire(import.meta.url)('better-sqlite3')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fixture(tamperHash = false, omitDraftFile = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nymi-base-video-media-'))
  const appData = path.join(root, 'app-data')
  const dbPath = path.join(appData, 'database', 'catalog.sqlite')
  const library = path.join(appData, 'runtime', 'profile', 'studios', 'Editor Gacha', 'media-library')
  const videoIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
  const files = videoIds.map((id, index) => Buffer.from(`synthetic video ${index}`))
  const items = videoIds.map((id, index) => ({
    id, name: `Synthetic ${index}`, extension: 'mp4', mimeType: 'video/mp4', size: files[index].length,
    durationFrames: null, createdAt: `2026-01-0${index + 1}T00:00:00.000Z`, sha256: tamperHash && index === 0 ? 'a'.repeat(64) : sha256(files[index])
  }))
  await mkdir(path.join(appData, 'database'), { recursive: true })
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE base_video_details(video_id TEXT PRIMARY KEY, video_number INTEGER, description_text TEXT, timeline TEXT,
      scene_end_seconds REAL, first_group_reaction_seconds REAL, second_group_reaction_seconds REAL,
      additional_context TEXT, updated_at TEXT);
    CREATE TABLE base_video_categories(category_id TEXT PRIMARY KEY, name TEXT, color_hex TEXT, created_at TEXT);
    CREATE TABLE base_video_category_assignments(video_id TEXT, category_id TEXT);
    CREATE TABLE base_video_sequence(sequence_id TEXT PRIMARY KEY, next_number INTEGER);
    CREATE TABLE domain_files(domain_id TEXT, relative_path TEXT, content_text TEXT, object_sha256 TEXT,
      byte_length INTEGER, content_sha256 TEXT, updated_at TEXT);
    CREATE TABLE objects(sha256 TEXT PRIMARY KEY, relative_path TEXT);
  `)
  const insertDetail = db.prepare('INSERT INTO base_video_details VALUES (?,?,?,?,?,?,?,?,?)')
  insertDetail.run(videoIds[0], 7, 'published', 'present', 10, 20, 30, 'synthetic', '2026-01-01T00:00:00.000Z')
  insertDetail.run(videoIds[1], null, 'draft', 'future', null, null, null, '', '2026-01-02T00:00:00.000Z')
  db.prepare('INSERT INTO base_video_categories VALUES (?,?,?,?)').run('category-a', 'Demo', '#abcdef', '2026-01-01T00:00:00.000Z')
  db.prepare('INSERT INTO base_video_category_assignments VALUES (?,?)').run(videoIds[0], 'category-a')
  db.prepare('INSERT INTO base_video_sequence VALUES (?,?)').run('main', 8)
  db.close()
  await mkdir(path.join(library, 'videos'), { recursive: true })
  await writeFile(path.join(library, 'catalog.json'), JSON.stringify({ schemaVersion: 1, items, deleted: [] }))
  await writeFile(path.join(library, 'videos', `${videoIds[0]}.mp4`), files[0])
  if (!omitDraftFile) await writeFile(path.join(library, 'videos', `${videoIds[1]}.mp4`), files[1])
  await writeFile(path.join(library, 'videos', 'orphan.mp4'), 'unreferenced')
  const catalog = adaptSqliteCatalog(dbPath, { selectedScope: true })
  return { root, appData, dbPath, catalog, videoIds }
}

test('converts published and draft Base Video media and excludes unreferenced files', async () => {
  const data = await fixture()
  try {
    const result = await adaptBaseVideoMedia({ appDataRoot: data.appData, snapshotPath: data.dbPath, catalog: data.catalog })
    assert.deepEqual(result.blocked, [])
    assert.equal(result.media.length, 2)
    assert.equal(result.media[0].status, 'published')
    assert.deepEqual(data.catalog.domains.baseVideos.catalog.drafts, [data.videoIds[1]])
    assert.deepEqual(data.catalog.domains.baseVideos.catalog.videos[0].categoryIds, ['category-a'])
    assert.equal(result.excluded.unreferencedMediaFiles, 1)
    assert.equal(result.assets.length, 2)
    assert.ok(result.media.every((media) => media.asset.$asset === `sha256:${media.sha256}`))
  } finally { await rm(data.root, { recursive: true, force: true }) }
})

test('blocks selected videos whose media is missing or whose recorded SHA-256 does not match', async () => {
  const missing = await fixture(false, true)
  try {
    const result = await adaptBaseVideoMedia({ appDataRoot: missing.appData, snapshotPath: missing.dbPath, catalog: missing.catalog })
    assert.ok(result.blocked.some((entry) => entry.code === 'base-video-media-missing'))
  } finally { await rm(missing.root, { recursive: true, force: true }) }

  const tampered = await fixture(true)
  try {
    const result = await adaptBaseVideoMedia({ appDataRoot: tampered.appData, snapshotPath: tampered.dbPath, catalog: tampered.catalog })
    assert.ok(result.blocked.some((entry) => entry.code === 'base-video-media-integrity-failed'))
  } finally { await rm(tampered.root, { recursive: true, force: true }) }
})
