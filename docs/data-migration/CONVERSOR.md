# Conversor offline: contrato e estado

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
- `format.mjs`: identificador e versão v1, schemas estruturais por domínio, caminhos seguros e rejeição de linhas opacas/legadas.
- `bundle-writer.mjs`: dry-run por padrão para bundle canônico; gravação opcional em destino novo com verificação de SHA e staging atômico; criação e verificação independente de backup completo por lista de caminhos, tamanhos e SHA-256.
- `sqlite-snapshot.mjs`: SQLite online backup via API nativa exposta por `better-sqlite3`, origem em modo read-only, `integrity_check` antes/depois, destino novo e privado fora de Git. Exige a confirmação explícita de que o aplicativo está fechado.
- `sqlite-catalog-adapter.mjs`: compõe semanticamente Roteiros, seções, TikToks, folhas de personagem, Base de vídeos, categorias e sequência; externaliza mídia inline e bloqueia tabelas/linhas ainda não interpretadas. Índices FTS derivados não são tratados como conteúdo de produto.
- `fabricator-customizer-adapter.mjs`: lê arquivos físicos e sombras `domain_files`; bytes idênticos são reconciliados e divergências preservam as duas alternativas e bloqueiam. Preserva IDs, campos adicionais, assets, slots/poses, guias e o marcador explícito de slot ativo; data URLs tornam-se assets SHA-256.
- `studio-editor-libraries-adapter.mjs`: valida projetos Studio/Editor V6, timeline, sidecars, bibliotecas de vídeo/fundo e preferência de exportação; externaliza mídia e não leva caminhos locais ao formato nativo. Relatórios de exportação são diagnósticos locais, excluídos do payload e mantidos no backup integral.
- `conversion-pipeline.mjs`: cruza personagens e mídias entre domínios; só libera manifesto quando não há conflitos, referências quebradas, linhas opacas ou dados sem classificação.
- `dry-run.mjs`: comando opt-in `--dry-run`, exige raiz, destino do snapshot, relatório e confirmação do app fechado. Recusa saídas dentro de worktrees, destinos existentes, symlinks/junctions e qualquer saída dentro/sobreposta à origem. O relatório contém apenas contagens e códigos agregados; não escreve bundle canônico.
- `tests/data-migration`: fixtures sintéticas sem conteúdo privado para regras de classificação, estrutura e falhas de integridade.

## Estado e limites — conversão real bloqueada

Os adaptadores acima foram exercitados com fixtures sintéticas. O dry-run também foi executado localmente contra uma origem fechada, com snapshot SQLite e relatório agregados guardados fora dos repositórios. A cópia integral de segurança foi verificada independentemente por caminho, tamanho e hash. Esses resultados privados não pertencem a este repositório.

A conversão definitiva permanece bloqueada pelo próprio validador: o inventário contém arquivos sem regra semântica, há assets de projeto Editor V6 sem vínculo com documento e uma referência de personagem em Roteiros sem personagem correspondente. O catálogo ainda possui registros SQLite fora do schema semântico v1. O writer recusa manifesto com `catalogRecords` ou `preservedUnknown` não vazios. Não contornar esses bloqueios com cópia opaca ou descarte de dados. A origem não é modificada. Ainda não existe leitor Qt/C++ de produto nesta etapa.

Exemplo de preparação de dry-run (não executado nesta tarefa):

```powershell
npm run data-migration:dry-run -- `
  --dry-run --application-closed `
  --source-app-data 'C:\caminho-local\app-data' `
  --snapshot-dir 'D:\privado\nymi-snapshot' `
  --report 'D:\privado\nymi-dry-run.json'
```

O snapshot, backup e relatório são dados privados locais e nunca devem ser adicionados ao Git.

## Interface do CLI de inventário

```powershell
node scripts/data-migration/inspect-legacy.mjs `
  --source 'C:\caminho-local\app-data' `
  --report 'D:\relatorios-privados\inventario.json'
```

O relatório é recusado se estiver dentro de qualquer worktree Git. A saída é deliberadamente só metadados e deve continuar fora de armazenamento público. Nenhuma etapa de conversão é disparada por esse comando.
