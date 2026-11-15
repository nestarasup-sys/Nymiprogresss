import { createNativeDataManifest } from './format.mjs'

const ALL_DOMAINS = ['fabricator', 'customizer', 'studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences']
const SELECTED_DOMAINS = ['fabricator', 'customizer', 'baseVideos']

function emptyDomain(name) {
  if (name === 'fabricator' || name === 'customizer') return { entities: [], files: [], catalogRecords: [], preservedUnknown: [] }
  if (name === 'baseVideos') return { catalog: { videos: [], drafts: [], categories: [], sequence: { nextNumber: 1 }, media: [] }, catalogRecords: [], preservedUnknown: [] }
  if (name === 'studio' || name === 'editorV6') return { projects: [], assets: [], prints: [], catalogRecords: [], preservedUnknown: [] }
  if (name === 'roteiros') return { documents: [], characterSheets: [], catalogRecords: [], preservedUnknown: [] }
  if (name === 'libraries') return { videos: [], backgrounds: [], editorAssets: [], catalogRecords: [], preservedUnknown: [] }
  return { editorV6Export: { configured: false }, catalogRecords: [], preservedUnknown: [] }
}

/** Builds the restricted migration envelope without reading or validating excluded modules. */
export function buildSelectedPreparedMigration({ catalog, fabricatorCustomizer, baseVideoMedia, recoveryArchives, inventorySha256, selectedReviewRequired = 0, createdAt = new Date().toISOString() }) {
  const domains = Object.fromEntries(ALL_DOMAINS.map((name) => [name, { schemaVersion: 1, data: emptyDomain(name) }]))
  for (const name of ['fabricator', 'customizer']) {
    domains[name].data = {
      ...emptyDomain(name),
      ...fabricatorCustomizer.domains[name],
      recoveryHistory: [...(fabricatorCustomizer.domains[name].recoveryHistory ?? []), ...(name === 'fabricator' ? recoveryArchives?.fabricator ?? [] : [])],
      catalogRecords: [],
      preservedUnknown: [...(fabricatorCustomizer.domains[name].preservedUnknown ?? [])]
    }
  }
  if (catalog.semanticCatalog && catalog.domains.baseVideos.catalog) domains.baseVideos.data.catalog = catalog.domains.baseVideos.catalog
  if (baseVideoMedia?.media) {
    domains.baseVideos.data.catalog.media = baseVideoMedia.media
    domains.baseVideos.data.catalog.drafts = domains.baseVideos.data.catalog.videos.filter((video) => video.status === 'draft').map((video) => video.id)
  }
  domains.baseVideos.data.recoveryHistory = recoveryArchives?.baseVideos ?? []

  const assetsByHash = new Map()
  for (const asset of [...fabricatorCustomizer.assets, ...(catalog.assets ?? []), ...(baseVideoMedia?.assets ?? []), ...(recoveryArchives?.assets ?? [])]) {
    const { bytes, ...entry } = asset
    const existing = assetsByHash.get(entry.sha256)
    if (existing && !existing.bytes.equals(bytes)) throw new Error(`Colisão SHA-256 entre assets ${entry.sha256}.`)
    assetsByHash.set(entry.sha256, { ...entry, bytes })
  }
  const blockers = []
  if (!catalog.semanticCatalog) blockers.push({ code: 'base-video-sqlite-schema-incomplete' })
  if (selectedReviewRequired) blockers.push({ code: 'unclassified-selected-files', count: selectedReviewRequired })
  if (!fabricatorCustomizer.ready) {
    const counts = new Map()
    for (const item of fabricatorCustomizer.blocked) counts.set(item.code, (counts.get(item.code) ?? 0) + 1)
    for (const [code, count] of counts) blockers.push({ code, count })
  }
  for (const item of baseVideoMedia?.blocked ?? []) blockers.push(item)
  for (const item of recoveryArchives?.blocked ?? []) blockers.push(item)
  const modules = Object.fromEntries(ALL_DOMAINS.map((name) => [name, {
    status: SELECTED_DOMAINS.includes(name) ? 'blocked' : 'excluded',
    ...(name === 'fabricator' ? { entities: fabricatorCustomizer.domains.fabricator.entities.length, files: fabricatorCustomizer.domains.fabricator.files.length } : {}),
    ...(name === 'customizer' ? { characters: fabricatorCustomizer.domains.customizer.entities.length } : {}),
    ...(name === 'baseVideos' ? { videos: catalog.domains.baseVideos.catalog?.videos.length ?? 0, media: baseVideoMedia?.media?.length ?? 0 } : {})
  }]))
  const fabricatorBlocked = !fabricatorCustomizer.ready || selectedReviewRequired > 0 || (recoveryArchives?.blocked ?? []).some((item) => !String(item.archive ?? '').startsWith('legacy-video-import-'))
  const baseVideosBlocked = !catalog.semanticCatalog || selectedReviewRequired > 0 || (baseVideoMedia?.blocked?.length ?? 0) > 0
    || (recoveryArchives?.blocked ?? []).some((item) => String(item.archive ?? '').startsWith('legacy-video-import-'))
  modules.fabricator.status = fabricatorBlocked ? 'blocked' : 'ready'
  modules.customizer.status = fabricatorBlocked ? 'blocked' : 'ready'
  modules.baseVideos.status = baseVideosBlocked ? 'blocked' : 'ready'
  const ready = blockers.length === 0
  const manifest = ready ? createNativeDataManifest({
    domains,
    assets: [...assetsByHash.values()].map(({ bytes, ...entry }) => entry),
    references: fabricatorCustomizer.references,
    sourceInventorySha256: inventorySha256,
    createdAt,
    selectedDomains: SELECTED_DOMAINS
  }) : null
  return { plan: { version: 1, status: ready ? 'ready' : 'blocked', selectedDomains: SELECTED_DOMAINS, modules, conflicts: fabricatorCustomizer.conflicts.length, blockers }, domains, assets: [...assetsByHash.values()], manifest }
}
