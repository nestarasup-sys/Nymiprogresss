import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSelectedPreparedMigration } from '../../scripts/data-migration/conversion-pipeline.mjs'

test('emits only Fabricator, Customizer, Base Videos and their declared dependencies', () => {
  const empty = () => ({ entities: [], files: [], recoveryHistory: [], preservedUnknown: [] })
  const catalog = {
    semanticCatalog: true,
    unknownTables: [{ table: 'roteiro_sections', rows: 29 }],
    domains: {
      fabricator: {}, customizer: {}, baseVideos: { catalog: { videos: [], drafts: [], categories: [], sequence: { nextNumber: 1 }, media: [] } },
      roteiros: { documents: [{ id: 'must-not-migrate', body: 'excluded' }] }
    }, assets: []
  }
  const fabricatorCustomizer = {
    ready: true, blocked: [], conflicts: [], references: [], assets: [],
    domains: { fabricator: empty(), customizer: empty() }
  }
  const prepared = buildSelectedPreparedMigration({ catalog, fabricatorCustomizer, baseVideoMedia: { media: [], assets: [], blocked: [] }, recoveryArchives: { fabricator: [], baseVideos: [], assets: [], blocked: [] }, inventorySha256: 'c'.repeat(64) })
  assert.equal(prepared.plan.status, 'ready')
  assert.deepEqual(prepared.plan.selectedDomains, ['fabricator', 'customizer', 'baseVideos'])
  assert.equal(prepared.manifest.provenance.selectedDomains.length, 3)
  assert.deepEqual(prepared.domains.roteiros.data.documents, [])
  assert.deepEqual(prepared.domains.editorV6.data.projects, [])
  assert.deepEqual(prepared.domains.studio.data.projects, [])
  assert.deepEqual(prepared.domains.preferences.data.editorV6Export, { configured: false })
})
