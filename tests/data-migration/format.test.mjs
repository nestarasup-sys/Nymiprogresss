import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeDataManifest, assertNativeDataManifest, assertSafeBundleRelativePath } from '../../scripts/data-migration/format.mjs'
import { emptyDomains, sha256 } from './helpers.mjs'

function validManifest() {
  const bytes = Buffer.from('synthetic asset bytes')
  const hash = sha256(bytes)
  return createNativeDataManifest({
    domains: emptyDomains(),
    assets: [{ id: `sha256:${hash}`, sha256: hash, path: `assets/sha256/${hash.slice(0, 2)}/${hash}`, byteLength: bytes.length, mediaType: 'image/png' }],
    references: [{ from: 'customizer:character-demo', relation: 'uses-model', to: 'fabricator:model-demo' }],
    sourceInventorySha256: 'a'.repeat(64),
    createdAt: '2026-11-15T12:00:00.000Z'
  })
}

test('builds and validates the versioned NativeProgress bundle envelope', () => {
  const manifest = validManifest()
  assert.equal(manifest.format, 'nymiprogress.native-data')
  assert.equal(manifest.formatVersion, 1)
  assert.equal(Object.keys(manifest.domains).length, 8)
  assert.equal(assertNativeDataManifest(manifest), manifest)
})

test('rejects unsupported formats, missing domains, invalid asset paths and Editor V7 payloads', () => {
  const unsupportedVersion = validManifest()
  unsupportedVersion.formatVersion = 2
  assert.throws(() => assertNativeDataManifest(unsupportedVersion), /não suportada/)

  const incomplete = validManifest()
  delete incomplete.domains.editorV6
  assert.throws(() => assertNativeDataManifest(incomplete), /exatamente os domínios/)

  const legacyEditor = validManifest()
  legacyEditor.domains.editorV6.data.editorV7 = []
  assert.throws(() => assertNativeDataManifest(legacyEditor), /Editor V7/)

  assert.throws(() => assertSafeBundleRelativePath('../outside.png'), /Caminho relativo/)
  assert.throws(() => assertSafeBundleRelativePath('C:/outside.png'), /Caminho relativo/)
  assert.doesNotThrow(() => assertSafeBundleRelativePath('assets/sha256/ab/file'))
})

test('rejects opaque legacy rows in a supposedly converted native domain', () => {
  const manifest = validManifest()
  manifest.domains.roteiros.data.preservedUnknown.push({ sourceTable: 'legacy_table', values: { payload: 'opaque' } })
  assert.throws(() => assertNativeDataManifest(manifest), /linhas brutas ou dados não classificados/)
})

test('validates the selected migration scope and typed recovery-history records', () => {
  const manifest = validManifest()
  manifest.provenance.selectedDomains = ['fabricator', 'customizer', 'baseVideos']
  manifest.domains.fabricator.data.recoveryHistory.push({
    id: 'recovery:abc123', kind: 'recovery-document', archive: 'fabricator-archive', relativePath: 'pose.json',
    sourceSha256: 'b'.repeat(64), sourceType: 'json', document: { id: 'pose-1', frames: [] }
  })
  assert.equal(assertNativeDataManifest(manifest), manifest)
  manifest.domains.fabricator.data.recoveryHistory[0].sourceSha256 = 'bad'
  assert.throws(() => assertNativeDataManifest(manifest), /Registro de recuperação inválido/)
})

test('rejects widened selected scope and untyped Fabricator resources', () => {
  const widened = validManifest()
  widened.provenance.selectedDomains = ['fabricator', 'customizer', 'baseVideos', 'editorV6']
  assert.throws(() => assertNativeDataManifest(widened), /Escopo de domínios selecionados inválido/)

  const untyped = validManifest()
  untyped.domains.fabricator.data.files.push({ relativePath: 'poses/pose.json', sha256: 'c'.repeat(64), sourceCopies: ['filesystem'] })
  assert.throws(() => assertNativeDataManifest(untyped), /sem documento, asset ou seleção tipada/)
})
