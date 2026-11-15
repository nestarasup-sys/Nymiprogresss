import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createVerifiedBackup, verifyVerifiedBackup, verifyCanonicalBundle, writeCanonicalBundle } from '../../scripts/data-migration/bundle-writer.mjs'
import { createNativeDataManifest } from '../../scripts/data-migration/format.mjs'
import { emptyDomains, sha256 } from './helpers.mjs'

test('verified backup copies a synthetic source and leaves the source unchanged', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-migration-backup-'))
  const source = path.join(temporary, 'source')
  const backup = path.join(temporary, 'backup')
  try {
    await mkdir(path.join(source, 'domain'), { recursive: true })
    await writeFile(path.join(source, 'domain', 'record.json'), '{"fixture":"synthetic"}')
    const result = await createVerifiedBackup(source, backup)
    assert.equal(result.fileCount, 1)
    assert.equal(await readFile(path.join(source, 'domain', 'record.json'), 'utf8'), '{"fixture":"synthetic"}')
    assert.equal(await readFile(path.join(backup, 'domain', 'record.json'), 'utf8'), '{"fixture":"synthetic"}')
    assert.equal(result.backupManifest.files[0].sha256, sha256(Buffer.from('{"fixture":"synthetic"}')))
    const verified = await verifyVerifiedBackup(source, backup)
    assert.equal(verified.verified, true)
    assert.equal(verified.fileCount, 1)
    await writeFile(path.join(backup, 'domain', 'record.json'), '{"fixture":"tampered"}')
    await assert.rejects(verifyVerifiedBackup(source, backup), /difere|Hash/)
    await assert.rejects(createVerifiedBackup(source, backup), /já existe/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('bundle writer is dry-run by default and writes verified assets only when explicitly enabled', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-migration-bundle-'))
  const destination = path.join(temporary, 'native-data')
  try {
    const bytes = Buffer.from('synthetic image bytes')
    const hash = sha256(bytes)
    const manifest = createNativeDataManifest({
      domains: emptyDomains(),
      assets: [{ id: `sha256:${hash}`, sha256: hash, path: `assets/sha256/${hash.slice(0, 2)}/${hash}`, byteLength: bytes.length, mediaType: 'image/png' }],
      references: [], sourceInventorySha256: 'b'.repeat(64), createdAt: '2026-11-15T12:00:00.000Z'
    })

    const preview = await writeCanonicalBundle({ manifest, assets: [{ sha256: hash, bytes }], destinationRoot: destination })
    assert.equal(preview.written, false)
    await assert.rejects(lstat(destination), { code: 'ENOENT' })

    const written = await writeCanonicalBundle({ manifest, assets: [{ sha256: hash, bytes }], destinationRoot: destination, execute: true })
    assert.equal(written.written, true)
    assert.equal(await readFile(path.join(destination, 'manifest.json'), 'utf8').then((text) => JSON.parse(text).format), 'nymiprogress.native-data')
    assert.deepEqual(await readFile(path.join(destination, ...manifest.assets[0].path.split('/'))), bytes)
    assert.equal((await verifyCanonicalBundle(destination)).verified, true)
    await writeFile(path.join(destination, ...manifest.assets[0].path.split('/')), 'tampered')
    await assert.rejects(verifyCanonicalBundle(destination), /falhou na verificação/)
    await assert.rejects(writeCanonicalBundle({ manifest, assets: [{ sha256: hash, bytes }], destinationRoot: destination, execute: true }), /já existe/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
