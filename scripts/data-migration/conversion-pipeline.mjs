import { createNativeDataManifest } from './format.mjs'

export function buildPreparedMigration({ catalog, fabricatorCustomizer, studioEditorLibraries, inventorySha256, reviewRequired = 0, createdAt = new Date().toISOString() }) {
  const availableCharacterIds = new Set(fabricatorCustomizer.domains.customizer.entities.map((character) => character.id))
  const characterReferences = (catalog.domains.roteiros.documents ?? []).flatMap((roteiro) =>
    (roteiro.characterIds ?? []).map((id) => ({ id, resolved: availableCharacterIds.has(id) })))
  const projectCharacterReferences = ['studio', 'editorV6'].flatMap((domainName) =>
    (studioEditorLibraries?.domains[domainName]?.projects ?? []).flatMap((project) =>
      (project.document.elements ?? []).filter((element) => typeof element.characterId === 'string')
        .map((element) => ({ id: element.characterId, domain: domainName, resolved: availableCharacterIds.has(element.characterId) }))))
  const availableVideoIds = new Set((studioEditorLibraries?.domains.libraries.videos ?? []).map((video) => video.item?.id).filter(Boolean))
  const videoReferences = [
    ...(catalog.domains.roteiros.documents ?? []).flatMap((roteiro) => (roteiro.sections ?? [])
      .filter((section) => section.videoAsset?.id).map((section) => ({ id: section.videoAsset.id, domain: 'roteiros', resolved: availableVideoIds.has(section.videoAsset.id) }))),
    ...(studioEditorLibraries?.domains.editorV6.projects ?? []).flatMap((project) => (project.document.media ?? [])
      .filter((media) => media.libraryVideoId).map((media) => ({ id: media.libraryVideoId, domain: 'editorV6', resolved: availableVideoIds.has(media.libraryVideoId) })))
  ]
  const unresolvedCharacterReferences = characterReferences.filter((reference) => !reference.resolved)
  const unresolvedProjectCharacterReferences = projectCharacterReferences.filter((reference) => !reference.resolved)
  const rawSqliteRecordCount = Object.values(catalog.domains).reduce((sum, domain) => sum + domain.catalogRecords.length + domain.preservedUnknown.length, 0)
  const unresolvedCharacterIds = new Set(unresolvedCharacterReferences.map((reference) => reference.id))
  const modules = {
    sqliteSnapshot: { status: 'ready', details: 'snapshot consistente foi fornecido' },
    sqliteCatalog: { status: catalog.unknownTables.length || !catalog.semanticCatalog || rawSqliteRecordCount ? 'blocked' : 'ready', unknownTables: catalog.unknownTables.length, rawRecords: rawSqliteRecordCount },
    fabricator: { status: fabricatorCustomizer.ready ? 'ready' : 'blocked', conflicts: fabricatorCustomizer.conflicts.length },
    customizer: { status: fabricatorCustomizer.ready && unresolvedCharacterReferences.length === 0 && unresolvedProjectCharacterReferences.length === 0 ? 'ready' : 'blocked', conflicts: fabricatorCustomizer.conflicts.length, unresolvedCharacterIds: unresolvedCharacterIds.size, unresolvedReferences: unresolvedCharacterReferences.length + unresolvedProjectCharacterReferences.length },
    studio: { status: studioEditorLibraries?.domains.studio.projects ? 'ready' : 'blocked', projects: studioEditorLibraries?.domains.studio.projects.length ?? 0 },
    editorV6: { status: studioEditorLibraries?.domains.editorV6.projects && !studioEditorLibraries.blocked.some((item) => item.domain === 'editorV6') ? 'ready' : 'blocked', projects: studioEditorLibraries?.domains.editorV6.projects.length ?? 0 },
    libraries: { status: studioEditorLibraries?.domains.libraries.videos && !studioEditorLibraries.blocked.some((item) => item.code.includes('library')) ? 'ready' : 'blocked', videos: studioEditorLibraries?.domains.libraries.videos.length ?? 0 },
    preferences: { status: studioEditorLibraries?.domains.preferences.editorV6Export ? 'ready' : 'blocked' },
    roteiros: { status: catalog.semanticCatalog ? 'ready' : 'blocked', documents: catalog.domains.roteiros.documents?.length ?? 0 },
    baseVideos: { status: catalog.semanticCatalog ? 'ready' : 'blocked', videos: catalog.domains.baseVideos.catalog?.videos.length ?? 0 }
  }
  for (const domainName of ['studio', 'editorV6']) {
    if (unresolvedProjectCharacterReferences.some((reference) => reference.domain === domainName)) modules[domainName].status = 'blocked'
  }
  if (studioEditorLibraries?.blocked.length) {
    for (const name of ['studio', 'editorV6', 'libraries', 'preferences']) {
      if (studioEditorLibraries.blocked.some((item) => item.domain === name || (name === 'libraries' && /library/.test(item.code)) || (name === 'preferences' && /preference/.test(item.code)))) modules[name].status = 'blocked'
    }
  }
  if (reviewRequired) modules.sqliteCatalog.status = 'blocked'

  const domainNames = ['fabricator', 'customizer', 'studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences']
  const domains = Object.fromEntries(domainNames.map((name) => {
    const catalogRecords = catalog.domains[name]?.catalogRecords ?? []
    const preservedUnknown = catalog.domains[name]?.preservedUnknown ?? []
    const adapted = fabricatorCustomizer.domains[name] ?? studioEditorLibraries?.domains[name]
    return [name, { schemaVersion: 1, data: {
      ...(adapted ?? {}),
      catalogRecords: [...catalogRecords, ...(adapted?.catalogRecords ?? [])],
      preservedUnknown: [...preservedUnknown, ...(adapted?.preservedUnknown ?? [])]
    } }]
  }))
  const assetMap = new Map()
  for (const asset of [...catalog.assets, ...fabricatorCustomizer.assets, ...(studioEditorLibraries?.assets ?? [])]) {
    const { bytes, ...entry } = asset
    const previous = assetMap.get(entry.sha256)
    if (previous && !previous.bytes.equals(bytes)) throw new Error(`Colisão SHA-256 entre assets: ${entry.sha256}.`)
    assetMap.set(entry.sha256, { ...entry, bytes })
  }
  const blockers = []
  if (catalog.unknownTables.length) blockers.push({ code: 'unknown-sqlite-tables', count: catalog.unknownTables.length })
  if (rawSqliteRecordCount) blockers.push({ code: 'unmapped-sqlite-records', count: rawSqliteRecordCount })
  if (reviewRequired) blockers.push({ code: 'unclassified-source-files', count: reviewRequired })
  if (fabricatorCustomizer.conflicts.length) blockers.push({ code: 'hybrid-storage-conflicts', count: fabricatorCustomizer.conflicts.length })
  const domainBlockers = fabricatorCustomizer.blocked ?? []
  if (domainBlockers.length) blockers.push(...[...new Set(domainBlockers.map((item) => item.code))].map((code) => ({ code })))
  if (unresolvedCharacterReferences.length) blockers.push({ code: 'unresolved-character-references', distinctIds: unresolvedCharacterIds.size, references: unresolvedCharacterReferences.length })
  if (unresolvedProjectCharacterReferences.length) blockers.push({ code: 'unresolved-project-character-references', count: unresolvedProjectCharacterReferences.length })
  const unresolvedVideoReferences = videoReferences.filter((reference) => !reference.resolved)
  if (unresolvedVideoReferences.length) blockers.push({ code: 'unresolved-video-library-references', count: unresolvedVideoReferences.length })
  if (!catalog.semanticCatalog) blockers.push({ code: 'sqlite-semantic-schema-incomplete' })
  if (studioEditorLibraries?.blocked.length) {
    const counts = new Map()
    for (const item of studioEditorLibraries.blocked) counts.set(item.code, (counts.get(item.code) ?? 0) + 1)
    for (const [code, count] of counts) blockers.push({ code, count })
  }
  const plan = {
    version: 1,
    status: Object.values(modules).every((module) => module.status === 'ready') ? 'ready' : 'blocked',
    modules,
    conflicts: fabricatorCustomizer.conflicts.length,
    unknownTables: catalog.unknownTables,
    blockers
  }
  const projectReferences = projectCharacterReferences.filter((reference) => reference.resolved).map((reference) => ({ from: `${reference.domain}.project`, relation: 'usesCharacter', to: `customizer.character:${reference.id}` }))
  const videoLinks = videoReferences.filter((reference) => reference.resolved).map((reference) => ({ from: `${reference.domain}.document`, relation: 'usesLibraryVideo', to: `libraries.video:${reference.id}` }))
  const manifest = plan.status === 'ready'
    ? createNativeDataManifest({
      domains,
      assets: [...assetMap.values()].map(({ bytes, ...entry }) => entry),
      references: [...fabricatorCustomizer.references, ...projectReferences, ...videoLinks],
      sourceInventorySha256: inventorySha256,
      createdAt
    })
    : null
  return { plan, domains, assets: [...assetMap.values()], manifest }
}
