import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

const excludedRootDirectories = new Set(['cache', 'crash-dumps', 'temp', 'tmp', 'logs'])
const knownPrefixes = [
  ['database/catalog.sqlite-wal', 'sqlite-catalog-sidecar'],
  ['database/catalog.sqlite-shm', 'sqlite-catalog-sidecar'],
  ['database/catalog.sqlite', 'sqlite-catalog'],
  ['runtime/profile/fabricator/', 'fabricator'],
  ['runtime/profile/customizer/', 'customizer'],
  ['runtime/profile/studios/Studio Principal/', 'studio'],
  ['runtime/profile/studios/Editor V6/', 'editorV6'],
  ['runtime/profile/studios/Editor Gacha/media-library/', 'libraries.video'],
  ['runtime/profile/studios/Editor Gacha/background-library/', 'libraries.backgrounds'],
  ['runtime/profile/studios/Editor Gacha/', 'studio.videoWorkspace'],
  ['runtime/profile/Local Storage/', 'preferences.localStorage'],
  ['projects/roteiros/', 'roteiros.exports'],
  ['projects/studio/', 'studio.prints'],
  ['libraries/', 'catalog.libraries'],
  ['characters/', 'catalog.characters'],
  ['projects/', 'catalog.projects'],
  ['manifests/', 'catalog.manifests'],
  ['media/objects/', 'media.objects'],
  ['media/thumbnails/', 'derived.thumbnails']
]

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function samePath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

export function classifyLegacyPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  const firstSegment = normalized.split('/')[0]
  if (excludedRootDirectories.has(firstSegment.toLowerCase())) return { domain: 'operational', disposition: 'exclude' }
  if (normalized === 'runtime/profile/Local Storage' || normalized.startsWith('runtime/profile/Local Storage/')) {
    return { domain: 'preferences.localStorage', disposition: 'inspect' }
  }
  for (const [prefix, domain] of knownPrefixes) {
    if (normalized === prefix || normalized.startsWith(prefix)) return { domain, disposition: 'migrate' }
  }
  if (normalized.startsWith('runtime/profile/')) return { domain: 'electron-profile', disposition: 'review' }
  if (normalized.startsWith('database/')) return { domain: 'database', disposition: 'review' }
  return { domain: 'unclassified', disposition: 'review' }
}

export async function scanLegacyAppData(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const rootStat = await lstat(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('A origem precisa ser uma pasta real, sem symlink.')
  const canonicalRoot = await realpath(root)
  if (!samePath(root, canonicalRoot)) throw new Error('A raiz de origem precisa ser canônica.')

  const files = []
  const excluded = []
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const absolutePath = path.join(directory, entry.name)
      const stats = await lstat(absolutePath)
      if (stats.isSymbolicLink()) throw new Error(`Symlink recusado na origem: ${relativePath}.`)
      if (stats.isDirectory()) {
        if (!relativeDirectory && excludedRootDirectories.has(entry.name.toLowerCase())) {
          excluded.push({ relativePath, disposition: 'exclude-operational-directory' })
          continue
        }
        await visit(absolutePath, relativePath)
        continue
      }
      if (!stats.isFile()) throw new Error(`Tipo de arquivo especial recusado: ${relativePath}.`)
      const classification = classifyLegacyPath(relativePath)
      const item = { relativePath, byteLength: stats.size, extension: path.posix.extname(entry.name).toLowerCase(), ...classification }
      if (classification.disposition === 'exclude') excluded.push(item)
      else files.push(item)
    }
  }
  await visit(root)

  const groups = new Map()
  for (const file of files) {
    const group = groups.get(file.domain) ?? { files: 0, byteLength: 0 }
    group.files += 1
    group.byteLength += file.byteLength
    groups.set(file.domain, group)
  }
  return {
    inventoryVersion: 1,
    files,
    excluded,
    summary: {
      files: files.length,
      byteLength: files.reduce((total, file) => total + file.byteLength, 0),
      reviewRequired: files.filter((file) => file.disposition === 'review').length,
      byDomain: Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)))
    }
  }
}

export function createConversionPlan(inventory, implementedStages = []) {
  const requiredStages = [
    'sqlite-catalog', 'fabricator', 'customizer', 'studio', 'roteiros',
    'baseVideos', 'editorV6', 'libraries', 'preferences'
  ]
  const implemented = new Set(implementedStages)
  const missingStages = requiredStages.filter((stage) => !implemented.has(stage))
  const reviewItems = inventory.files.filter((file) => file.disposition === 'review' || file.disposition === 'inspect')
  return {
    planVersion: 1,
    status: missingStages.length || reviewItems.length ? 'blocked' : 'ready',
    missingStages,
    reviewItems: reviewItems.map(({ relativePath, domain, disposition }) => ({ relativePath, domain, disposition })),
    counts: inventory.summary
  }
}

export function assertDisjointRoots(sourceRoot, destinationRoot) {
  const source = path.resolve(sourceRoot)
  const destination = path.resolve(destinationRoot)
  if (samePath(source, destination) || isWithin(source, destination) || isWithin(destination, source)) {
    throw new Error('Origem e destino precisam ser pastas distintas, sem sobreposição.')
  }
}
