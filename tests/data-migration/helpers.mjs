import { createHash } from 'node:crypto'
import { NATIVE_DATA_DOMAINS } from '../../scripts/data-migration/format.mjs'

export function emptyDomains() {
  const data = {
    fabricator: { entities: [], files: [], recoveryHistory: [] },
    customizer: { entities: [], files: [], recoveryHistory: [] },
    studio: { projects: [], assets: [], prints: [] },
    roteiros: { documents: [], characterSheets: [] },
    baseVideos: { catalog: { videos: [], drafts: [], categories: [], sequence: { nextNumber: 1 }, media: [] }, recoveryHistory: [] },
    editorV6: { projects: [], assets: [], prints: [] },
    libraries: { videos: [], backgrounds: [], editorAssets: [] },
    preferences: { editorV6Export: { configured: false } }
  }
  return Object.fromEntries(NATIVE_DATA_DOMAINS.map((domainId) => [domainId, { schemaVersion: 1, data: { ...data[domainId], catalogRecords: [], preservedUnknown: [] } }]))
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
