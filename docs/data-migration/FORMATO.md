# Formato canônico de dados NativeProgress

## Identidade e compatibilidade

O bundle é identificado por `format: "nymiprogress.native-data"` e `formatVersion: 1`. Cada domínio inclui `schemaVersion: 1`. A aplicação Qt/C++ futura lê exclusivamente esse formato; não deve tentar detectar, abrir ou converter arquivos Electron/SQLite legados. Uma versão desconhecida deve falhar com erro explícito e preservar o bundle original. Evoluções incompatíveis incrementam `formatVersion`; evoluções de payload isoladas incrementam o schema do domínio.

## Layout do bundle

```text
native-data/
  manifest.json
  assets/sha256/<2 primeiros hex>/<sha256 completo>
```

`manifest.json` é UTF-8 JSON, sem BOM, serializado em UTF-8. É o índice de dados e de integridade; payloads de domínio são JSON, sem duplicar bytes de mídia. Assets são imutáveis e endereçados pelo hash SHA-256 dos bytes exatos.

## Manifesto v1

```json
{
  "format": "nymiprogress.native-data",
  "formatVersion": 1,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "provenance": {
    "sourceKind": "legacy-app-data",
    "inventorySha256": "<sha256 do inventário normalizado>"
  },
  "domains": {
    "fabricator": { "schemaVersion": 1, "data": {} },
    "customizer": { "schemaVersion": 1, "data": {} },
    "studio": { "schemaVersion": 1, "data": {} },
    "roteiros": { "schemaVersion": 1, "data": {} },
    "baseVideos": { "schemaVersion": 1, "data": {} },
    "editorV6": { "schemaVersion": 1, "data": {} },
    "libraries": { "schemaVersion": 1, "data": {} },
    "preferences": { "schemaVersion": 1, "data": {} }
  },
  "assets": [{
    "id": "sha256:<64 hex minúsculos>",
    "sha256": "<64 hex minúsculos>",
    "byteLength": 123,
    "mediaType": "image/png",
    "path": "assets/sha256/<2 hex>/<64 hex>"
  }],
  "references": [{ "from": "fabricator.model:<id>", "relation": "hasPose", "to": "fabricator.pose:<id>" }]
}
```

Os objetos `{}` são apenas forma ilustrativa; o conversor não pode emitir domínios vazios para dados não reconhecidos. `data` contém coleções tipadas por domínio e IDs estáveis. Relacionamentos entre domínios são referências explícitas por IDs, nunca dependem de índice/ordem de arquivo. Campos opcionais ausentes têm semântica definida pelo schema; valores desconhecidos não podem ser descartados silenciosamente.

## Regras de segurança e integridade

- `assets[].id` é `sha256:` + `sha256`; `path` deve corresponder ao hash. O leitor recalcula tamanho e SHA-256 antes de disponibilizar qualquer asset.
- Caminhos do bundle são relativos com `/`; não aceitam `..`, raiz absoluta, barra invertida ou NUL. Payload não guarda caminho de máquina.
- Não registrar credenciais, cookies, tokens, conteúdo de Local Storage fora da allowlist ou dados de perfil do SO. Não embutir base64 de mídia. Metadados privados só existem no bundle local, não no inventário/documentação versionados.
- Manifesto deve conter todos os domínios da v1, schema suportado, provenance válida e referências consistentes. Referências quebradas e IDs duplicados são erro de conversão/leitura, não motivo para descartar.
- O leitor Qt valida tudo antes de importar para o armazenamento ativo e não modifica o bundle fonte.
- Fuso e caminhos absolutos de exportação não são dados portáveis; preferências correspondentes são omitidas ou convertidas a uma preferência neutra conforme regra aprovada do schema.

## Política de leitura

O leitor de produto conhece apenas `nymiprogress.native-data`. Sem fallback para `catalog.sqlite`, JSON de perfil Electron, Local Storage ou layouts do legado. O conversor offline é a única fronteira que, futuramente, poderá conhecer formatos de origem; ele produz este bundle e valida-o. Conversões futuras de versão nativa devem operar sobre bundles nativos e nunca reintroduzir leitura legada no Qt.
