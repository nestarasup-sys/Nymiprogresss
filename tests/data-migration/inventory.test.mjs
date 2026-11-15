import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertDisjointRoots, classifyLegacyPath, createConversionPlan, scanLegacyAppData } from '../../scripts/data-migration/inventory.mjs'

test('classifies persisted domain paths and operational folders without opening file contents', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-migration-inventory-'))
  const source = path.join(temporary, 'app-data')
  try {
    const fixtures = [
      ['database/catalog.sqlite', 'synthetic database bytes'],
      ['runtime/profile/fabricator/models/slot-1/project.json', '{"synthetic":true}'],
      ['runtime/profile/customizer/characters/characters.json', '[]'],
      ['runtime/profile/studios/Editor V6/editorV6-demo/editorV6.json', '{}'],
      ['runtime/profile/Local Storage/leveldb/000003.log', 'synthetic preference bytes'],
      ['projects/roteiros/export/sample.txt', 'synthetic export']
    ]
    for (const [relative, contents] of fixtures) {
      const target = path.join(source, ...relative.split('/'))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
    await mkdir(path.join(source, 'cache', 'electron-session'), { recursive: true })
    await writeFile(path.join(source, 'cache', 'electron-session', 'cache.bin'), 'ephemeral')
    await mkdir(path.join(source, 'unmapped-domain'), { recursive: true })
    await writeFile(path.join(source, 'unmapped-domain', 'unknown.json'), '{"synthetic":true}')

    const inventory = await scanLegacyAppData(source)
    assert.equal(inventory.summary.files, fixtures.length + 1)
    assert.equal(inventory.summary.reviewRequired, 1)
    assert.equal(inventory.excluded.length, 1)
    assert.equal(inventory.files.find((item) => item.relativePath.endsWith('project.json')).domain, 'fabricator')
    assert.equal(inventory.files.find((item) => item.relativePath.endsWith('000003.log')).disposition, 'inspect')
    assert.equal(inventory.files.find((item) => item.relativePath.endsWith('unknown.json')).domain, 'unclassified')
    assert.equal(inventory.files[0].contents, undefined)
    const plan = createConversionPlan(inventory)
    assert.equal(plan.status, 'blocked')
    assert.ok(plan.missingStages.includes('sqlite-catalog'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('classifies every known top-level app-data family and explicitly reviews unknown files', () => {
  assert.deepEqual(classifyLegacyPath('runtime/profile/studios/Studio Principal/studio-1/studio.json'), { domain: 'studio', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('runtime/profile/studios/Editor Gacha/media-library/catalog.json'), { domain: 'libraries.video', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('runtime/profile/studios/Editor Gacha/background-library/catalog.json'), { domain: 'libraries.backgrounds', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('database/catalog.sqlite-wal'), { domain: 'sqlite-catalog-sidecar', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('unexpected/file.bin'), { domain: 'unclassified', disposition: 'review' })
})

test('classifies selected recovery archives and excludes legacy Roteiros backups by scope', () => {
  assert.deepEqual(classifyLegacyPath('backups/hair-dev-before-clear-set/hair/model-1/hair.json'), { domain: 'fabricator.recovery', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('backups/legacy-video-import-set/catalog.json'), { domain: 'baseVideos.recovery', disposition: 'migrate' })
  assert.deepEqual(classifyLegacyPath('backups/remove-legacy-speech-counts-set/catalog.sqlite'), { domain: 'roteiros.recovery', disposition: 'exclude' })
  assert.deepEqual(classifyLegacyPath('runtime/profile/unknown-settings.json'), { domain: 'electron-profile', disposition: 'exclude' })
  assert.deepEqual(classifyLegacyPath('backup-manifest.json'), { domain: 'migration-backup-envelope', disposition: 'exclude' })
})

test('refuses overlapping source and destination roots', () => {
  assert.throws(() => assertDisjointRoots('C:/legacy/app-data', 'C:/legacy/app-data/output'), /sem sobreposição/)
  assert.throws(() => assertDisjointRoots('C:/legacy/app-data', 'C:/legacy/app-data'), /sem sobreposição/)
  assert.doesNotThrow(() => assertDisjointRoots('C:/legacy/app-data', 'C:/NativeProgress/migration-output'))
})
