import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { adaptSelectedRecoveryArchives } from '../../scripts/data-migration/recovery-archive-adapter.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

test('converts selected recovery JSON and media, verifies the archive manifest, and ignores excluded archive groups', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-recovery-'))
  const root = path.join(temporary, 'app-data')
  const selected = path.join(root, 'backups', 'hair-dev-before-clear-fixture')
  const excluded = path.join(root, 'backups', 'remove-legacy-speech-counts-fixture')
  try {
    const json = Buffer.from(JSON.stringify({ modelSlot: 1, front: 'sha', unknownFutureField: { keep: true } }))
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const marker = Buffer.from('dismissed')
    const jsonPath = path.join(selected, 'hair', 'model-1', 'hair.json')
    const pngPath = path.join(selected, 'hair', 'model-1', 'front.png')
    await mkdir(path.dirname(jsonPath), { recursive: true })
    await mkdir(excluded, { recursive: true })
    await writeFile(jsonPath, json)
    await writeFile(pngPath, png)
    await writeFile(path.join(selected, 'hair', 'model-1', 'hair-legacy-catalog-state-v1'), marker)
    await writeFile(path.join(selected, 'backup-manifest.json'), JSON.stringify({ files: [
      { path: 'hair/model-1/hair.json', sha256: sha256(json), byteLength: json.length },
      { path: 'hair/model-1/front.png', sha256: sha256(png), byteLength: png.length },
      { path: 'hair/model-1/hair-legacy-catalog-state-v1', sha256: sha256(marker), byteLength: marker.length }
    ] }))
    await writeFile(path.join(excluded, 'unrelated.sqlite'), 'must not inspect')

    const result = await adaptSelectedRecoveryArchives({ appDataRoot: root })
    assert.equal(result.blocked.length, 0)
    assert.equal(result.fabricator.length, 4)
    assert.equal(result.audit.verifiedManifests, 1)
    assert.equal(result.audit.convertedFiles, 4)
    assert.equal(result.fabricator.find((entry) => entry.relativePath.endsWith('hair.json')).document.unknownFutureField.keep, true)
    assert.equal(result.fabricator.find((entry) => entry.kind === 'recovery-media').asset.$asset, `sha256:${sha256(png)}`)
    assert.equal(result.assets.length, 1)
    assert.equal(result.fabricator.find((entry) => entry.kind === 'recovery-state-marker').state, 'dismissed')
    assert.deepEqual(result.baseVideos, [])
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
