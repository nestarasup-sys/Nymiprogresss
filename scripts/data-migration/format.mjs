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

export function assertNativeDataManifest(manifest) {
  if (!isRecord(manifest)) throw new Error('O manifesto precisa ser um objeto JSON.')
  if (manifest.format !== NATIVE_DATA_FORMAT) throw new Error('Formato nativo desconhecido.')
  if (manifest.formatVersion !== NATIVE_DATA_FORMAT_VERSION) {
    throw new Error(`Versão do formato não suportada: ${String(manifest.formatVersion)}.`)
  }
  if (!isRecord(manifest.provenance) || !isRecord(manifest.domains) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.references)) {
    throw new Error('Manifesto incompleto: provenance, domains, assets e references são obrigatórios.')
  }
  const domainNames = Object.keys(manifest.domains).sort()
  const expectedNames = [...NATIVE_DATA_DOMAINS].sort()
  if (JSON.stringify(domainNames) !== JSON.stringify(expectedNames)) {
    throw new Error('O manifesto precisa conter exatamente os domínios nativos versionados.')
  }
  for (const [domainId, domain] of Object.entries(manifest.domains)) {
    if (!isRecord(domain) || domain.schemaVersion !== 1 || !isRecord(domain.data)) {
      throw new Error(`Domínio inválido ou sem schemaVersion 1: ${domainId}.`)
    }
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
  for (const reference of manifest.references) {
    if (!isRecord(reference) || typeof reference.from !== 'string' || !reference.from
      || typeof reference.relation !== 'string' || !reference.relation
      || typeof reference.to !== 'string' || !reference.to) {
      throw new Error('Referência entre entidades inválida.')
    }
  }
  rejectLegacyEditorDomains(manifest.domains)
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

export function createNativeDataManifest({ domains, assets = [], references = [], sourceInventorySha256, createdAt }) {
  const manifest = {
    format: NATIVE_DATA_FORMAT,
    formatVersion: NATIVE_DATA_FORMAT_VERSION,
    createdAt,
    provenance: {
      sourceKind: 'legacy-app-data',
      inventorySha256: sourceInventorySha256
    },
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
