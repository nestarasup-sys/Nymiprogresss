import { createNativeDataManifest } from './format.mjs'

const REMAINING_MODULES = ['studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences']

export function buildPreparedMigration({ catalog, fabricatorCustomizer, inventorySha256, createdAt = new Date().toISOString() }) {
  const modules = {
    sqliteSnapshot: { status: 'ready', details: 'snapshot consistente foi fornecido' },
    sqliteCatalog: { status: catalog.unknownTables.length ? 'blocked' : 'ready', unknownTables: catalog.unknownTables.length },
    fabricator: { status: fabricatorCustomizer.ready ? 'ready' : 'blocked', conflicts: fabricatorCustomizer.conflicts.length },
    customizer: { status: fabricatorCustomizer.ready ? 'ready' : 'blocked', conflicts: fabricatorCustomizer.conflicts.length }
  }
  for (const module of REMAINING_MODULES) modules[module] = { status: 'blocked', reason: 'adaptador semântico completo ainda não implementado' }

  const domainNames = ['fabricator', 'customizer', 'studio', 'roteiros', 'baseVideos', 'editorV6', 'libraries', 'preferences']
  const domains = Object.fromEntries(domainNames.map((name) => {
    const catalogRecords = catalog.domains[name]?.catalogRecords ?? []
    const preservedUnknown = catalog.domains[name]?.preservedUnknown ?? []
    const adapted = fabricatorCustomizer.domains[name]
    return [name, { schemaVersion: 1, data: {
      ...(adapted ?? {}),
      catalogRecords: [...catalogRecords, ...(adapted?.catalogRecords ?? [])],
      preservedUnknown: [...preservedUnknown, ...(adapted?.preservedUnknown ?? [])]
    } }]
  }))
  const assetMap = new Map()
  for (const asset of [...catalog.assets, ...fabricatorCustomizer.assets]) {
    const { bytes, ...entry } = asset
    const previous = assetMap.get(entry.sha256)
    if (previous && !previous.bytes.equals(bytes)) throw new Error(`Colisão SHA-256 entre assets: ${entry.sha256}.`)
    assetMap.set(entry.sha256, { ...entry, bytes })
  }
  const plan = {
    version: 1,
    status: Object.values(modules).every((module) => module.status === 'ready') ? 'ready' : 'blocked',
    modules,
    conflicts: fabricatorCustomizer.conflicts.length,
    unknownTables: catalog.unknownTables
  }
  const manifest = plan.status === 'ready'
    ? createNativeDataManifest({
      domains,
      assets: [...assetMap.values()].map(({ bytes, ...entry }) => entry),
      references: fabricatorCustomizer.references,
      sourceInventorySha256: inventorySha256,
      createdAt
    })
    : null
  return { plan, domains, assets: [...assetMap.values()], manifest }
}
