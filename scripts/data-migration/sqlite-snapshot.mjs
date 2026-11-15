import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { assertDisjointRoots } from './inventory.mjs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function exists(filePath) {
  try { await lstat(filePath); return true }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function assertOutsideGitWorktree(target) {
  let current = path.dirname(target)
  while (true) {
    if (await exists(path.join(current, '.git'))) throw new Error('Snapshot recusado dentro de worktree Git; use uma pasta local privada externa.')
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

export async function snapshotSqlite({ sourcePath, destinationPath, applicationClosed = false, busyTimeoutMs = 5000 }) {
  if (applicationClosed !== true) throw new Error('Confirme applicationClosed: true antes de criar o snapshot consistente.')
  const source = path.resolve(sourcePath)
  const destination = path.resolve(destinationPath)
  assertDisjointRoots(source, destination)
  const sourceStat = await lstat(source)
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile() || source !== await realpath(source)) {
    throw new Error('Banco de origem precisa ser arquivo regular canônico, sem symlink.')
  }
  if (await exists(destination)) throw new Error('O destino do snapshot já existe; não será sobrescrito.')
  await assertOutsideGitWorktree(destination)
  const parent = path.dirname(destination)
  await mkdir(parent, { recursive: true })
  const parentStat = await lstat(parent)
  if (parentStat.isSymbolicLink() || parent !== await realpath(parent)) throw new Error('Pasta de saída do snapshot precisa ser canônica.')
  const stage = await mkdtemp(path.join(parent, `${path.basename(destination)}.partial-`))
  const stagedDatabase = path.join(stage, 'catalog.sqlite')
  let database
  try {
    database = new Database(source, { readonly: true, fileMustExist: true, timeout: busyTimeoutMs })
    const integrity = database.pragma('integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error(`Integridade SQLite da origem falhou: ${JSON.stringify(integrity)}.`)
    }
    await database.backup(stagedDatabase)
    database.close()
    database = null
    const verify = new Database(stagedDatabase, { readonly: true, fileMustExist: true })
    try {
      const check = verify.pragma('integrity_check')
      if (check.length !== 1 || check[0].integrity_check !== 'ok') throw new Error('Snapshot SQLite falhou na verificação de integridade.')
      const sourceVersion = new Database(source, { readonly: true, fileMustExist: true, timeout: busyTimeoutMs })
      try {
        const before = sourceVersion.pragma('user_version', { simple: true })
        const after = verify.pragma('user_version', { simple: true })
        if (before !== after) throw new Error('user_version mudou entre origem e snapshot.')
      } finally { sourceVersion.close() }
    } finally { verify.close() }
    const bytes = await (await import('node:fs/promises')).readFile(stagedDatabase)
    await rename(stage, destination)
    return { snapshotPath: path.join(destination, 'catalog.sqlite'), sha256: sha256(bytes), byteLength: bytes.length }
  } catch (error) {
    if (database?.open) database.close()
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}

export function resolveLegacyAppDataRoot(repositoryRoot, { packaged = false, executablePath } = {}) {
  if (!repositoryRoot || typeof repositoryRoot !== 'string') throw new Error('Informe a raiz do repositório legado para resolver o app-data.')
  return path.resolve(packaged ? path.dirname(executablePath ?? '') : repositoryRoot, 'app-data')
}
