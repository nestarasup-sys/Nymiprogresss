#!/usr/bin/env node
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createConversionPlan, scanLegacyAppData } from './inventory.mjs'

function parseArguments(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!['--source', '--report'].includes(key) || !argv[index + 1] || argv[index + 1].startsWith('--')) {
      throw new Error('Uso: node scripts/data-migration/inspect-legacy.mjs --source <app-data> --report <arquivo-local-fora-de-repositorios>')
    }
    args.set(key, argv[++index])
  }
  if (!args.has('--source') || !args.has('--report')) {
    throw new Error('Informe --source e --report explicitamente. O comando não escolhe uma origem por conta própria.')
  }
  return { source: path.resolve(args.get('--source')), report: path.resolve(args.get('--report')) }
}

async function assertOutsideGitWorktree(reportPath) {
  let current = path.dirname(reportPath)
  while (true) {
    if (await exists(current) && await exists(path.join(current, '.git'))) {
      throw new Error('Relatório local recusado dentro de um worktree Git para evitar publicar metadados privados.')
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

async function exists(value) {
  try { await lstat(value); return true }
  catch (reason) { if (reason.code === 'ENOENT') return false; throw reason }
}

const { source, report } = parseArguments(process.argv.slice(2))
await assertOutsideGitWorktree(report)
const inventory = await scanLegacyAppData(source)
const plan = createConversionPlan(inventory)
const document = {
  reportVersion: 1,
  createdAt: new Date().toISOString(),
  sourceKind: 'legacy-app-data',
  inventory,
  plan,
  note: 'Relatório local. Não contém bytes de mídia nem valores de documentos; mantenha-o fora de repositórios públicos.'
}
await mkdir(path.dirname(report), { recursive: true })
await writeFile(report, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`Inventário local salvo. ${inventory.summary.files} arquivos; plano ${plan.status}. Nenhum dado foi convertido.\n`)
