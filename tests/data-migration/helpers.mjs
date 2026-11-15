import { createHash } from 'node:crypto'
import { NATIVE_DATA_DOMAINS } from '../../scripts/data-migration/format.mjs'

export function emptyDomains() {
  return Object.fromEntries(NATIVE_DATA_DOMAINS.map((domainId) => [domainId, { schemaVersion: 1, data: {} }]))
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
