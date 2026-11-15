import path from 'node:path'

export const NATIVE_DATA_FORMAT = 'nymiprogress.native-data'
export const NATIVE_DATA_FORMAT_VERSION = 1

export const NATIVE_DATA_DOMAINS = Object.freeze([
  'fabricator',
  'customizer',
  'studio',
  'roteiros',
  'baseVideos',
  'editorV6',
  'libraries',
  'preferences'
])

const sha256Pattern = /^[a-f0-9]{64}$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const DOMAIN_DATA_SCHEMAS = Object.freeze({
  fabricator: { arrays: ['entities', 'files', 'recoveryHistory', 'catalogRecords', 'preservedUnknown'] },
  customizer: { arrays: ['entities', 'files', 'recoveryHistory', 'catalogRecords', 'preservedUnknown'] },
  studio: { arrays: ['projects', 'assets', 'prints', 'catalogRecords', 'preservedUnknown'] },
  roteiros: { arrays: ['documents', 'characterSheets', 'catalogRecords', 'preservedUnknown'] },
  baseVideos: { arrays: ['recoveryHistory', 'catalogRecords', 'preservedUnknown'], records: ['catalog'] },
  editorV6: { arrays: ['projects', 'assets', 'prints', 'catalogRecords', 'preservedUnknown'] },
  libraries: { arrays: ['videos', 'backgrounds', 'editorAssets', 'catalogRecords', 'preservedUnknown'] },
  preferences: { arrays: ['catalogRecords', 'preservedUnknown'], records: ['editorV6Export'] }
})

function assertDomainData(domainId, data) {
  const schema = DOMAIN_DATA_SCHEMAS[domainId]
  const allowed = new Set([...schema.arrays, ...(schema.records ?? [])])
  const unexpected = Object.keys(data).filter((key) => !allowed.has(key))
  if (unexpected.length) throw new Error(`Campos fora do schema nativo v1 em ${domainId}.`)
  for (const key of schema.arrays) if (!Array.isArray(data[key])) throw new Error(`Schema nativo v1 inválido em ${domainId}.${key}.`)
  for (const key of schema.records ?? []) if (!isRecord(data[key])) throw new Error(`Schema nativo v1 inválido em ${domainId}.${key}.`)
  if (data.catalogRecords.length || data.preservedUnknown.length) throw new Error(`Domínio ${domainId} contém linhas brutas ou dados não classificados; não é conversão semântica válida.`)
  if (['fabricator', 'customizer'].includes(domainId)) {
    const entityIds = new Set()
    for (const entity of data.entities) {
      if (!isRecord(entity) || typeof entity.id !== 'string' || !entity.id || entity.id.length > 200 || entityIds.has(entity.id)
        || (!isRecord(entity.document) && !Array.isArray(entity.document))) throw new Error(`Entidade inválida em ${domainId}.`)
      entityIds.add(entity.id)
    }
    for (const file of data.files) {
      if (!isRecord(file) || typeof file.relativePath !== 'string' || !file.relativePath || file.relativePath.includes('\\')
        || file.relativePath.split('/').some((part) => !part || part === '.' || part === '..') || !sha256Pattern.test(file.sha256)
        || !Array.isArray(file.sourceCopies) || file.sourceCopies.some((source) => !['filesystem', 'sqlite-domain-files'].includes(source))) {
        throw new Error(`Recurso inválido em ${domainId}.`)
      }
      const hasTypedDocument = isRecord(file.document) || Array.isArray(file.document)
      const hasAsset = isRecord(file.asset) && typeof file.asset.$asset === 'string'
      const isSelection = file.kind === 'active-model-selection' && Number.isSafeInteger(file.modelSlot) && file.selected === true
      if (!hasTypedDocument && !hasAsset && !isSelection) throw new Error(`Recurso sem documento, asset ou seleção tipada em ${domainId}.`)
    }
  }
  if (['fabricator', 'customizer', 'baseVideos'].includes(domainId)) {
    for (const entry of data.recoveryHistory ?? []) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.startsWith('recovery:')
        || !['recovery-document', 'recovery-media', 'recovery-state-marker'].includes(entry.kind)
        || typeof entry.archive !== 'string' || typeof entry.relativePath !== 'string'
        || !sha256Pattern.test(entry.sourceSha256)) throw new Error(`Registro de recuperação inválido em ${domainId}.`)
      if (entry.kind === 'recovery-document' && (!isRecord(entry.document) && !Array.isArray(entry.document))) throw new Error(`Documento histórico sem conteúdo tipado em ${domainId}.`)
      if (entry.kind === 'recovery-media' && (!isRecord(entry.asset) || typeof entry.asset.$asset !== 'string')) throw new Error(`Mídia histórica sem asset SHA-256 em ${domainId}.`)
      if (entry.kind === 'recovery-state-marker' && (entry.sourceType !== 'legacy-state-marker' || !['active', 'dismissed'].includes(entry.state))) throw new Error(`Marcador de recuperação inválido em ${domainId}.`)
    }
  }
  if (domainId === 'baseVideos') {
    const catalog = data.catalog
    if (!Array.isArray(catalog.videos) || !Array.isArray(catalog.drafts) || !Array.isArray(catalog.categories) || !Array.isArray(catalog.media)
      || !isRecord(catalog.sequence) || !Number.isSafeInteger(catalog.sequence.nextNumber) || catalog.sequence.nextNumber < 1) {
      throw new Error('Schema nativo v1 inválido em baseVideos.catalog.')
    }
    const videoIds = new Set()
    for (const video of catalog.videos) {
      if (!isRecord(video) || typeof video.id !== 'string' || !video.id || videoIds.has(video.id)
        || !['draft', 'published'].includes(video.status) || !(video.number === null || Number.isSafeInteger(video.number))
        || (video.number !== null && video.number < 1) || !Array.isArray(video.categoryIds) || new Set(video.categoryIds).size !== video.categoryIds.length || typeof video.description !== 'string'
        || !['unspecified', 'past', 'present', 'future'].includes(video.timeline)) throw new Error('Vídeo inválido no schema nativo v1.')
      videoIds.add(video.id)
    }
    const categoryIds = new Set()
    for (const category of catalog.categories) {
      if (!isRecord(category) || typeof category.id !== 'string' || !category.id || categoryIds.has(category.id)
        || typeof category.name !== 'string' || !category.name || !Array.isArray(category.videoIds) || new Set(category.videoIds).size !== category.videoIds.length) throw new Error('Categoria inválida no schema nativo v1.')
      categoryIds.add(category.id)
    }
    for (const video of catalog.videos) {
      if (video.categoryIds.some((id) => !categoryIds.has(id)) || (video.status === 'draft') !== (video.number === null)
        || video.categoryIds.some((categoryId) => !catalog.categories.find((category) => category.id === categoryId).videoIds.includes(video.id))) throw new Error('Estado ou categoria do vídeo inconsistente no schema nativo v1.')
    }
    for (const category of catalog.categories) if (category.videoIds.some((id) => !videoIds.has(id)
      || !catalog.videos.find((video) => video.id === id).categoryIds.includes(category.id))) throw new Error('Categoria referencia vídeo ausente no schema nativo v1.')
    const draftIds = new Set(catalog.drafts)
    if (draftIds.size !== catalog.drafts.length || catalog.drafts.some((id) => !videoIds.has(id) || catalog.videos.find((video) => video.id === id)?.status !== 'draft')) {
      throw new Error('Lista de rascunhos inconsistente no schema nativo v1.')
    }
    const mediaIds = new Set()
    for (const media of catalog.media) {
      if (!isRecord(media) || typeof media.id !== 'string' || !videoIds.has(media.id) || mediaIds.has(media.id)
        || !isRecord(media.asset) || typeof media.asset.$asset !== 'string' || !/^[a-f0-9]{64}$/.test(media.sha256)
        || !Number.isSafeInteger(media.size) || media.size <= 0 || media.sha256 !== media.asset.$asset.replace(/^sha256:/, '')
        || !['draft', 'published'].includes(media.status) || typeof media.name !== 'string' || !media.name
        || typeof media.extension !== 'string' || !/^[a-z0-9]{2,5}$/i.test(media.extension) || typeof media.mimeType !== 'string'
        || !Number.isFinite(Date.parse(media.createdAt)) || media.status !== catalog.videos.find((video) => video.id === media.id).status) throw new Error('Mídia Base de vídeos sem asset ou vídeo correspondente.')
      mediaIds.add(media.id)
    }
    if (mediaIds.size !== videoIds.size) throw new Error('Há vídeo selecionado sem arquivo de mídia no schema nativo v1.')
  }
}

export function assertNativeDataManifest(manifest) {
  if (!isRecord(manifest)) throw new Error('O manifesto precisa ser um objeto JSON.')
  if (manifest.format !== NATIVE_DATA_FORMAT) throw new Error('Formato nativo desconhecido.')
  if (manifest.formatVersion !== NATIVE_DATA_FORMAT_VERSION) {
    throw new Error(`Versão do formato não suportada: ${String(manifest.formatVersion)}.`)
  }
  if (!isRecord(manifest.provenance) || !isRecord(manifest.domains) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.references)) {
    throw new Error('Manifesto incompleto: provenance, domains, assets e references são obrigatórios.')
  }
  if (manifest.provenance.selectedDomains !== undefined) {
    const selected = manifest.provenance.selectedDomains
    const expectedSelection = ['fabricator', 'customizer', 'baseVideos']
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some((name) => !NATIVE_DATA_DOMAINS.includes(name))
      || expectedSelection.some((name) => !selected.includes(name)) || selected.length !== expectedSelection.length) {
      throw new Error('Escopo de domínios selecionados inválido no manifesto.')
    }
  }
  const domainNames = Object.keys(manifest.domains).sort()
  const expectedNames = [...NATIVE_DATA_DOMAINS].sort()
  if (JSON.stringify(domainNames) !== JSON.stringify(expectedNames)) {
    throw new Error('O manifesto precisa conter exatamente os domínios nativos versionados.')
  }
  rejectLegacyEditorDomains(manifest.domains)
  for (const [domainId, domain] of Object.entries(manifest.domains)) {
    if (!isRecord(domain) || domain.schemaVersion !== 1 || !isRecord(domain.data)) {
      throw new Error(`Domínio inválido ou sem schemaVersion 1: ${domainId}.`)
    }
    assertDomainData(domainId, domain.data)
  }

  const assetIds = new Set()
  for (const asset of manifest.assets) {
    if (!isRecord(asset) || !sha256Pattern.test(asset.sha256) || asset.id !== `sha256:${asset.sha256}`
      || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0
      || typeof asset.mediaType !== 'string' || !asset.mediaType.trim()
      || asset.path !== `assets/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}`) {
      throw new Error('Índice de asset inválido ou caminho fora do armazenamento endereçado por conteúdo.')
    }
    if (assetIds.has(asset.id)) throw new Error(`Asset repetido: ${asset.id}.`)
    assetIds.add(asset.id)
  }
  function validateAssetReferences(value) {
    if (Array.isArray(value)) { for (const item of value) validateAssetReferences(item); return }
    if (!isRecord(value)) return
    if (Object.hasOwn(value, '$asset') && (typeof value.$asset !== 'string' || !assetIds.has(value.$asset))) throw new Error('Referência a asset SHA-256 ausente do manifesto.')
    for (const item of Object.values(value)) validateAssetReferences(item)
  }
  validateAssetReferences(manifest.domains)
  for (const reference of manifest.references) {
    if (!isRecord(reference) || typeof reference.from !== 'string' || !reference.from
      || typeof reference.relation !== 'string' || !reference.relation
      || typeof reference.to !== 'string' || !reference.to) {
      throw new Error('Referência entre entidades inválida.')
    }
  }
  return manifest
}

function rejectLegacyEditorDomains(value) {
  if (Array.isArray(value)) {
    for (const item of value) rejectLegacyEditorDomains(item)
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (/editor[-_ ]?v7/i.test(key)) throw new Error('Editor V7 não pertence ao formato de produto; somente Editor V6 é suportado.')
    rejectLegacyEditorDomains(item)
  }
}

export function createNativeDataManifest({ domains, assets = [], references = [], sourceInventorySha256, createdAt, selectedDomains }) {
  const provenance = { sourceKind: 'legacy-app-data', inventorySha256: sourceInventorySha256 }
  if (selectedDomains !== undefined) provenance.selectedDomains = selectedDomains
  const manifest = {
    format: NATIVE_DATA_FORMAT,
    formatVersion: NATIVE_DATA_FORMAT_VERSION,
    createdAt,
    provenance,
    domains,
    assets,
    references
  }
  return assertNativeDataManifest(manifest)
}

export function assertSafeBundleRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)
    || value.includes('\\') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Caminho relativo de bundle inválido.')
  }
  return value
}
