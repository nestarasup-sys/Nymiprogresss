# Inventário técnico da persistência legada

## Escopo e método

Inventário derivado do código da aplicação Electron legado (bootstrap de app-data, catálogo SQLite, sistema de arquivos por domínio, caminhos dos domínios e chamadas de persistência no renderer). A documentação antiga não foi usada como fonte de verdade. Nenhum valor de usuário, linha SQLite, imagem ou mídia foi lido para este inventário; a inspeção física limitou-se a nomes de diretório, extensões e tamanhos agregados. O diretório legado permaneceu intocado.

`configureLocalAppDataRoot` resolve a raiz como `app-data` ao lado do `app.getAppPath()` no modo desenvolvimento e ao lado do executável empacotado em produção; nessa raiz os subdiretórios são `database`, `runtime/profile`, `projects`, `libraries`, `media`, `manifests` e áreas operacionais (`cache`, `logs`, `crash-dumps`, `temp`). O perfil Electron não é descartável: contém arquivos de domínio e Local Storage do Chromium. Cookies, cache de sessão, logs, crash dumps e temporários não são dados de produto e devem ser excluídos mediante regra explícita.

## Fontes de persistência e destino

| Área | Persistência observada no código | Entidades/relacionamentos a preservar | Destino v1 |
|---|---|---|---|
| Fabricador DEV | `runtime/profile/fabricator/`; catálogo `domain_files`; imagens externalizadas no CAS | modelos e slots; poses e animações por modelo/slot; roupas, faces/componentes, cabelo, acessórios, expressões, configuração visual e referências de assets | `fabricator` + assets |
| Customizador | `runtime/profile/customizer/characters/characters.json`; arquivos publicados e backup temporário do repositório | personagens, IDs, referências aos slots/modelos e poses do Fabricador, overrides e assets | `customizer`, referências para `fabricator` |
| Studio | `runtime/profile/studios/Studio Principal/studio-#/studio.json`; assets; `projects/studio` para impressões | projetos, cenas, objetos, personagens, fundos, impressões e relações com assets/personagens | `studio` + assets |
| Roteiros | tabelas `roteiros`, `roteiro_tiktoks`, `roteiro_sections`, `roteiro_character_sheets`, `roteiro_import_origins`, `roteiro_export_logs`; exportações em `projects/roteiros` | ordem, blocos, texto, timeline, reações, contexto, imagens/GIFs, folhas de personagem, origem de importação e histórico de exportação | `roteiros` + referências e assets |
| Base de vídeos | `base_video_details`, `base_video_categories`, `base_video_category_assignments`, `base_video_sequence` | vídeos, metadados, categorias e ordem/sequência | `baseVideos` + referências a mídia |
| Editor V6 | `runtime/profile/studios/Editor V6/editorV6-#/editorV6.json`; assets e exportações | projetos, sequência de mídia, efeitos, áudio, fundos, objetos, estado necessário à edição e referências | `editorV6` + assets |
| Bibliotecas | `Editor Gacha/media-library/catalog.json`, `background-library/catalog.json`; bibliotecas de assets dos domínios e catálogo de GIFs da interface | IDs, metadados, categorias, origem e uso compartilhado das mídias | `libraries` + assets |
| Preferências | Electron Local Storage; chaves de configuração/seleção/drafts persistentes em código | somente preferências de produto reconhecidas e independentes de máquina | `preferences` |

## Particularidades de integridade

- `database/catalog.sqlite` é o catálogo SQLite versionado (schema legado declarado como 19), com registros de assets/objetos, referências, `domain_files`, refs de imagem, diretórios e estado/execução de migrações. A migração histórica de roteiros também usa `projects/roteiros/library.json`.
- A persistência pode estar simultaneamente em arquivos e em linhas de `domain_files`: o modo híbrido/sombra exige reconciliação por ID/conteúdo e detecção de conflito, não escolha silenciosa de uma fonte. O SQLite possui journal WAL/SHM; uma futura execução real exige aplicação fechada e snapshot consistente.
- Strings `data:image` são externalizadas para assets endereçados por conteúdo e reidratadas pelo sistema legado. O novo formato referencia assets por SHA-256 e não incorpora base64 ou caminhos absolutos.
- Referências cruzadas importantes: Customizador → slot/pose do Fabricador; cenas do Studio/Roteiros/Editor → personagem, biblioteca e mídia; Roteiros → GIFs/fundos/folhas de personagem; Editor V6 → mídia, fundos, objetos e áudio.
- Preferências em Local Storage devem ser allowlist por chave. Seleção atual, caminhos absolutos de exportação e estado de interface podem ser transitórios ou específicos da máquina. Cookies, tokens de sessão e chaves desconhecidas não são migrados.
- O código do produto nesta linha suporta Editor V6. Editor V7 não integra o formato; entradas com esse nome são rejeitadas na validação do manifesto.

## Itens que exigem adaptadores e decisão explícita

O scaffold já classifica a existência de SQLite, domínios e bibliotecas, mas ainda não implementa leitores de payload nem resolução de conflitos. São pré-condições antes de qualquer conversão: snapshot SQLite consistente e leitura somente-leitura; adaptador por domínio; regras para reconciliar cópias físicas/SQL; allowlist de preferências; levantamento completo de arquivos desconhecidos; checagem de ciclos/refs quebradas e contagem de mídia. O plano do conversor deve permanecer `blocked` enquanto houver arquivos `review`/`inspect` ou etapas faltantes.

Um inventário de caminhos é dado operacional sensível quando expõe nomes do usuário. Relatórios devem ficar fora de worktrees e não ser adicionados ao GitHub. Este documento descreve apenas o esquema e caminhos de código, sem conteúdo privado.
