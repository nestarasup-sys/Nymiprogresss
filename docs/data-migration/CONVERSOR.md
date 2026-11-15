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
- `sqlite-snapshot.mjs`: SQLite online backup via API nativa exposta por `better-sqlite3`, origem em modo read-only, `integrity_check` antes/depois, destino novo e privado fora de Git. Exige a confirmação explícita de que o aplicativo está fechado.
- `sqlite-catalog-adapter.mjs`: extrai linhas completas de todas as tabelas para seus domínios ou para uma área `preservedUnknown`; tabelas sem classificação bloqueiam o plano. IDs/colunas e relações ficam preservados literalmente.
- `fabricator-customizer-adapter.mjs`: lê os arquivos físicos desses domínios e suas sombras `domain_files`; cópias byte-a-byte iguais são consolidadas com as duas proveniências. Divergências mantêm ambas as versões e bloqueiam o plano. JSON mantém os campos originais; imagens inline são externalizadas para assets SHA-256; IDs de personagem e vínculo modelSlot/poseSlot são extraídos.
- `conversion-pipeline.mjs`: combina os adaptadores no envelope canônico, mas não libera manifesto enquanto módulos, tabelas desconhecidas ou conflitos estiverem bloqueados.
- `dry-run.mjs`: comando opt-in `--dry-run`, exige raiz, destino do snapshot, relatório e confirmação do app fechado. Recusa saídas dentro de worktrees, destinos existentes, symlinks/junctions e qualquer saída dentro/sobreposta à origem. O relatório contém apenas contagens e códigos agregados; não escreve bundle canônico.
- `tests/data-migration`: fixtures sintéticas sem conteúdo privado para regras de classificação, estrutura e falhas de integridade.

## Estado e limites — conversão real desabilitada

Snapshot SQLite e extração raw do catálogo estão implementados; Fabricador/Customizador já têm leitura de arquivos, externalização de imagens e reconciliação shadow, testadas com dados sintéticos. Uma divergência shadow ou JSON não parseável bloqueia o plano sem perder as alternativas. Extração raw de tabelas Roteiros/Base Vídeos é preservada, mas ainda não é conversão semântica desses módulos. Studio, Roteiros, Base de vídeos, Editor V6, bibliotecas e preferências continuam bloqueados para conversão semântica; tabelas não mapeadas também bloqueiam.

O CLI dry-run está preparado, porém não foi executado contra a árvore real de app-data. A flag `--application-closed` é uma afirmação explícita do operador, não um detector de processo. Não há backup verificável de toda a árvore nem leitor Qt/C++ nesta etapa. Não executar conversão real até preencher os adaptadores faltantes, revisar o relatório dry-run agregado, exigir backup completo verificável e validar com fixtures sintéticas abrangentes. O conteúdo de usuário da origem não foi lido nem modificado nesta etapa.

Exemplo de preparação de dry-run (não executado nesta tarefa):

```powershell
npm run data-migration:dry-run -- `
  --dry-run --application-closed `
  --source-app-data 'C:\caminho-local\app-data' `
  --snapshot-dir 'D:\privado\nymi-snapshot' `
  --report 'D:\privado\nymi-dry-run.json'
```

O snapshot e o relatório são dados privados locais e nunca devem ser adicionados ao Git.

## Interface do CLI de inventário

```powershell
node scripts/data-migration/inspect-legacy.mjs `
  --source 'C:\caminho-local\app-data' `
  --report 'D:\relatorios-privados\inventario.json'
```

O relatório é recusado se estiver dentro de qualquer worktree Git. A saída é deliberadamente só metadados e deve continuar fora de armazenamento público. Nenhuma etapa de conversão é disparada por esse comando.
