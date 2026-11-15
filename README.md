# Nymiprogresss — reconstrução nativa

**Arquitetura em desenvolvimento:** Qt 6/QML + C++20, com Editor V6 como único editor. O aplicativo legado Electron continua preservado para comparação até existir paridade funcional completa. O GitHub público contém código e testes sintéticos, **nunca dados de usuário**.

## Rodadas nativas 1–3

- **Leitor nativo v1**: `native/native-data` valida o bundle `nymiprogress.native-data` v1, não lê nenhum formato antigo do Electron; hashes SHA-256 verificados em streaming sob demanda.
- **Interface Qt/QML**: lista e filtra registros Fabricador DEV, personagens Customizador e vídeos/rascunhos da Base de vídeos. Player Qt Multimedia com verificação de integridade antes da reprodução.
- **Inicialização Windows + CI**: `COMPILAR_NATIVO.bat`, `ABRIR_NATIVO.bat`, `VERIFICAR_DADOS_NATIVOS.bat`. Testes sintéticos e compilação Qt no GitHub Actions.

### Abrir no Windows

1. Instale Qt 6.4+ (Quick/QuickControls2/Multimedia/Concurrent), CMake 3.21+ e compilador C++20 compatível com o Qt escolhido.
2. Abra `COMPILAR_NATIVO.bat` uma vez. O script configura, compila e executa testes.
3. Abra `ABRIR_NATIVO.bat`. Ele procura automaticamente o bundle privado no diretório irmão `NativeProgress-MigrationPrivate/nymiprogress-native-data-v1-final`. Se não encontrar, abre o seletor de pasta. Pode indicar outro local com `NYMI_NATIVE_DATA_DIR`.
4. Opcional: `VERIFICAR_DADOS_NATIVOS.bat` verifica metadados. Use o executável `nymi-native-verify` com `--deep` para validar todos os SHA-256.

**Não copie o bundle para dentro do clone.** A pasta privada fica fora do Git. O leitor não modifica os dados.

O `ABRIR_DESENVOLVIMENTO.bat` mantém o aplicativo Electron original (porta padrão 5196) durante a migração. No nativo, **não existe porta HTTP**.

### Testes sem Qt

```bash
cmake -S . -B build/core -DNYMI_BUILD_DESKTOP=OFF -DBUILD_TESTING=ON
cmake --build build/core --config Release
ctest --test-dir build/core --build-config Release --output-on-failure
```

### Testes com Qt

```bash
cmake -S . -B build/qt -DNYMI_BUILD_DESKTOP=ON -DBUILD_TESTING=ON
cmake --build build/qt --config Release
ctest --test-dir build/qt --build-config Release --output-on-failure
```

## Áreas do produto

Fabricador DEV, Customizador, Studio, Roteiros, Base de vídeos, Editor V6, Biblioteca V6 e Logs DEV continuam no escopo. Somente os **dados históricos** de Fabricador/Customizador/Base de vídeos foram convertidos; os outros módulos terão novos dados e ainda precisam de implementação nativa.

Veja `docs-atuais/NATIVO-RODADAS-01-03.md` para o escopo entregue, limitações e próximos testes. Os documentos antigos continuam arquivados em `Lixo/`; decisões atuais ficam em `docs-atuais/`.

## Fabricador DEV: início da reconstrução fiel (3 rodadas)

- A navegação Qt agora replica as **12 seções** e a tela Modelos conta com os **10 slots** do Fabricador original.
- O `FabricatorProjectReader` usa exclusivamente o bundle nativo v1 e extrai projetos, camadas e imagens de peças convertidas; não abre formatos legados.
- A nova tela tem canvas nativo (imagens por peça, ordem de camadas, zoom, pan e seleção), painel **Peças/Camadas/Juntas**, coordenadas e rotação de peças, ocultar/mostrar, desfazer/refazer.
- **Salvar rascunho** cria somente um patch de transformações no diretório privado da aplicação, nunca no bundle nem no Git; **Carregar** verifica a identidade SHA-256 do modelo original. É possível restaurar as posições e excluir o rascunho local com confirmação.
- A compatibilidade com os modelos pessoais ainda precisa ser observada no Windows. O CI Linux compila e executa testes sintéticos + smoke test QML.

**Importante:** as 12 seções aparecem, mas só **Modelos Dev** tem ferramentas nativas nesta fase. Não há, ainda, importação de folhas, chroma, deformação, salvamento integral de projetos, nem ferramentas nativas para poses/roupas/rostos/cabelos/animações. O Electron continua intacto para comparação e uso dessas funções.

Depois de `git pull --ff-only origin main`, execute `COMPILAR_NATIVO.bat` e `ABRIR_NATIVO.bat`. Para detalhes técnicos e mapeamento para o Electron, veja `docs-atuais/FABRICADOR-NATIVO-FASE-1.md`.
