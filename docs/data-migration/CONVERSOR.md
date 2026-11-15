# Conversor offline: contrato e estado do scaffold

## Fluxo pretendido

1. Receber explicitamente uma raiz `app-data` e uma pasta de saída local fora do repositório.
2. Inventariar nomes relativos, tamanhos e tipos sem ler conteúdo; bloquear symlinks, arquivos especiais, categorias desconhecidas e preferências ainda sem regra.
3. Com o aplicativo fechado, obter uma cópia de segurança verificável e snapshot consistente do SQLite (incluindo checkpoints/sidecars conforme API SQLite), sem escrever na origem.
4. Executar adaptadores de leitura somente-leitura, reconciliar armazenamento híbrido, criar objetos canônicos, referências e assets hashados.
5. Validar contagens, IDs, referências, hashes e schemas; gravar bundle em staging e publicar atomicamente para um destino inexistente.
6. Entregar relatório local com totais e erros, sem conteúdo de documentos; manter backup intacto para revisão/restauração.

## Implementação presente

- `scripts/data-migration/inspect-legacy.mjs`: inventário de metadados, explicitamente opt-in por `--source`/`--report`; recusa relatório dentro de worktree Git. Não lê payload e não converte.
- `inventory.mjs`: classificação inicial, plano que bloqueia se faltar adaptador ou existir arquivo `review`/`inspect`, validação de raízes distintas.
- `format.mjs`: identificador e versão v1, domínios, validação básica do manifesto e caminhos seguros.
- `bundle-writer.mjs`: dry-run por padrão para bundle canônico; gravação opcional em destino novo com verificação de SHA e staging atômico; backup verificável separado.
- `tests/data-migration`: fixtures sintéticas sem conteúdo privado para regras de classificação, estrutura e falhas de integridade.

## Limites atuais — conversão desabilitada

Não há adaptadores de payload, acesso SQLite, normalização de entidades, resolução de conflito shadow, importação de preferências nem leitor Qt/C++ implementado por esta etapa. O `createConversionPlan` não declara etapas preenchidas por padrão, portanto a saída é bloqueada. Não executar conversão real até implementar/revisar essas etapas e validar com fixtures sintéticas completas. O comando de inventário também não deve ser executado contra app-data de usuário sem uma etapa específica que aprove o local privado do relatório; a tarefa atual não executou inventário da árvore privada com script, apenas a inspeção documental de caminhos no código.

## Interface do CLI de inventário

```powershell
node scripts/data-migration/inspect-legacy.mjs `
  --source 'C:\caminho-local\app-data' `
  --report 'D:\relatorios-privados\inventario.json'
```

O relatório é recusado se estiver dentro de qualquer worktree Git. A saída é deliberadamente só metadados e deve continuar fora de armazenamento público. Nenhuma etapa de conversão é disparada por esse comando.
