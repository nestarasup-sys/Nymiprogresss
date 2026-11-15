# Fabricador DEV nativo — mapeamento da fase 1 (baseado no código Electron)

Fonte inspecionada: `src/renderer/src/features/fabricator/FabricatorPage.tsx`,
`FabricatorSectionNavigation.tsx`, `FabricatorModelWorkspace.tsx`,
`FabricatorModelCanvas.tsx`, `FabricatorModelPanel.tsx`,
`src/shared/fabricator.ts`, `src/shared/modelRig.ts`,
`electron/domains/fabricator/paths.ts` e `modelWriter.ts`.

## Layout e funcionalidades que o Qt deve reproduzir

A navegação lateral da versão Electron possui **12 seções**: Modelos Dev, Poses Dev,
Roupas Dev, Olhos Dev, Rosto Dev, Preset Expressão Dev, Animador Rosto Dev,
Cabeças extra dev, Cabelos Dev, Animação Cabelo Dev, Animador Dev e Design Dev.
`Modelos` apresenta 10 slots, canvas de montagem e painel com abas
**Peças, Camadas e Juntas**, além de importação de folhas, edição de
transformações e camadas, articulação, chroma, histórico, deformação,
colorização e outras ferramentas específicas.

Os projetos têm `schemaVersion: 1`, `slot: 1..10`, dimensões `width/height`,
`parts[]` (`id,name,x,y,width,height,rotation`), `joints[]`, `layerOrder[]` de
trás para frente, `hiddenPartIds[]` e imagens por peça.
O projeto do Electron é gravado em `fabricator/models/slot-N/project.json`
e suas imagens em `slot-N/parts/<id>.png`.

## O que a fase 1 adiciona

`native/fabricator/FabricatorProjectReader` consulta somente
`nymiprogress.native-data` v1: os documentos já convertidos em
`domains.fabricator.data.files` e os assets SHA-256. Reconstrói 10 slots
com metadados de modelos, ordem de camadas, visibilidade e caminho das
imagens. Não lê `project.json` do Electron nem formatos de pastas legadas.

O resultado de conversão real deve ser validado no computador do usuário.
A fase 1 ainda não implementa recorte automático, chroma, costura das juntas
nem escrita de projetos. Não declarar paridade com o Fabricador original
até comparar modelo a modelo.

## Rodadas 2 e 3 — Interface nativa e ferramentas iniciais

A página `FabricatorPage.qml` reproduz a estrutura de navegação de 12 seções, 10
slots e composição Modelos → Canvas/Peças/Camadas/Juntas. O reader nativo
reconstrói projetos convertidos, incluindo PNGs por peça e ordem de desenho.
`FabricatorWorkspace` expõe zoom, pan, seleção, movimento de peças, rotação,
visibilidade e histórico desfazer/refazer.

A edição nesta etapa é **apenas das transformações visuais de peças**.
Rascunhos são salvos sob a área privada `QStandardPaths::AppLocalDataLocation`,
em formato `nymiprogress.fabricator-draft` v1, com fingerprint SHA-256 do modelo
de origem e gravação atômica via `QSaveFile`. Não são gravados no bundle
original, no Git ou no aplicativo Electron. Abertura de rascunho exige mesma
identidade e composição de peças; exclusão é explícita e confirmada na UI.

### Não implementado nesta entrega

- Importação e recorte/chroma de novas folhas;
- deformação de malha, reencoloração, encaixe de juntas, máscaras e costuras;
- editores reais de poses, cabelos, roupas, expressões e animações;
- comparação pixel a pixel e validação do bundle real do usuário;
- escrita de dados convertidos em um novo formato central de edição.

**Não declarar equivalência completa com a versão Electron.**
