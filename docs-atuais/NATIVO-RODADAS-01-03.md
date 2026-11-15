# Rodadas 1–3 do desktop nativo — 2026-11-15

## O que funciona no código

1. **Leitor v1 independente do Electron**: `native/native-data`, usando QtCore/C++20. Só aceita `nymiprogress.native-data` versão 1, selecionado para Fabricador, Customizador e Base de vídeos. Valida metadados, caminhos relativos implícitos ao SHA-256, referências de assets, arquivos existentes, tamanho e chaves essenciais. SHA-256 de cada arquivo é verificado sob demanda com leitura em chunks.
2. **UI Qt/QML**: lista e busca entidades e recursos do Fabricador, personagens do Customizador e vídeos da Base de vídeos (incluindo rascunhos). Um vídeo selecionado passa por verificação de SHA-256 em segundo plano antes da reprodução com QtMultimedia. Não há importação de SQLite nem interface web.
3. **Compilação e operação**: `COMPILAR_NATIVO.bat`, `ABRIR_NATIVO.bat`, `VERIFICAR_DADOS_NATIVOS.bat`, testes C++ sintéticos, CI de desktop Qt no Linux e teste do núcleo isolado em Linux/Windows.

## Como usar os dados privados no Windows

Dados convertidos pelo Codex: `C:\TRABALHO 2\OUTROS\NativeProgress-MigrationPrivate\nymiprogress-native-data-v1-final`. Essa pasta fica **fora do Git**. O BAT procura o bundle no diretório irmão do clone e passa `--data-dir` para o executável. Também é possível usar `NYMI_NATIVE_DATA_DIR` como variável de ambiente ou o botão **Abrir dados locais** na janela. O aplicativo é apenas leitor nesta fase: não altera nem exporta personagens e vídeos.

```powershell
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=ON -DBUILD_TESTING=ON
cmake --build build/native --config Release
ctest --test-dir build/native --build-config Release --output-on-failure
```

Para validação de SHA-256 completo (pode levar tempo se os vídeos forem grandes):

```powershell
.\build\native\native\native-data\Release\nymi-native-verify.exe "C:\TRABALHO 2\OUTROS\NativeProgress-MigrationPrivate\nymiprogress-native-data-v1-final" --deep
```

## Limites honestos

- **Não foi executado aqui com os 8 personagens / 211 vídeos reais.** Os dados são privados e só existem no PC do usuário. A CI testa estruturas sintéticas.
- A UI de Fabricador/Customizador exibe registros e nomes, mas ainda **não edita nem renderiza personagens/poses**. Player de vídeo depende dos codecs/plugins de mídia Qt instalados.
- Studio, Roteiros, Editor V6, Biblioteca V6 e Logs DEV aparecem na navegação, mas **não foram migrados funcionalmente**. A V6 do legado continua sendo referência.
- O leitor usa validação estrutural básica e de referências a assets; paridade integral de esquemas, referências semânticas e comportamento de cada domínio exigirá novos testes.
- Não há FFmpeg nativo nem renderizador de composição audiovisual nesta entrega. Não remover Electron até paridade verificável.
- Nenhum dado privado, backup ou bundle vai ao GitHub; relatórios históricos em `Lixo/` não determinam contratos.
