# Formato de dados nativos v1 — escopo da migração

O conversor offline gera um envelope `nymiprogress.native-data`, versão 1. O manifesto contém exatamente oito domínios conhecidos pelo aplicativo. A seleção atual é registrada em `provenance.selectedDomains` como `fabricator`, `customizer` e `baseVideos`; os outros cinco domínios aparecem vazios e tipados para manter compatibilidade estrutural, sem receber payloads legados.

## Domínios convertidos

- `fabricator`: entidades editáveis, arquivos estruturados, seleção de modelo e recursos de models, accessories, design settings, poses, animações, roupas, componentes faciais, expressões, cabelo e faces. Referências a bytes são `$asset` SHA-256.
- `customizer`: personagens com IDs estáveis, campos de configuração e referências a slots/poses do Fabricador. IDs duplicados, conflitos entre cópias física/SQLite e referências sem destino bloqueiam o bundle.
- `baseVideos`: vídeos publicados e rascunhos, metadados, categorias, atribuições, sequência, arquivo de mídia e seu SHA-256. A mídia é incluída somente quando consta no catálogo selecionado.

Os dados de recuperação que pertencem a esses domínios são registrados em `recoveryHistory` como `recovery-document`, `recovery-media` ou `recovery-selection-marker`, com caminho relativo ao conjunto, SHA-256 da fonte e documento estruturado ou referência a asset. Manifestos de backup são verificados antes da leitura. Snapshots SQLite/WAL/SHM históricos da importação de vídeos são registrados como arquivos operacionais ignorados; seu banco verificado tem zero linhas de vídeos/categorias e não substitui o catálogo ativo.

## Exclusões e auditoria

Roteiros, Editor V6, Studio, preferências gerais e bibliotecas sem referência ficam vazios. Seus payloads não são consultados pelo adaptador SQLite selecionado. O inventário agrega contagens e informa os motivos de exclusão. Tabelas operacionais, índices derivados de busca e migrations do SQLite não viram entidades. Assets referenciados pelo conteúdo selecionado são armazenados em `assets/sha256/<prefix>/<digest>`; o validador confirma tamanho, caminho e referências antes da escrita.

Nenhum arquivo bruto é copiado como se fosse entidade convertida: arquivos binários selecionados tornam-se assets endereçados por conteúdo, JSON de recuperação fica marcado explicitamente como histórico estruturado, JSON ativo não parseável bloqueia, e linhas SQLite sem conversor semântico não entram no bundle.
