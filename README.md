# Nymiprogresss — Native Gacha

**Projeto em migração progressiva para Qt 6/QML + C++20.** O único editor mantido é o **Editor V6**. A migração não está concluída: o aplicativo completo original ainda depende de Electron, e o protótipo nativo é apenas uma prova técnica.

## Áreas preservadas do aplicativo legado

- Fabricador DEV — ferramentas para produzir bibliotecas.
- Customizador — personagens e configurações individuais.
- Studio — composição de personagens e cenas.
- Roteiros — organização e exportações de roteiros.
- Base de vídeos — gerenciamento dos vídeos e fundos.
- Editor V6 e Biblioteca V6 — edição audiovisual e mídia.
- Logs DEV — diagnósticos e gerenciamento.

Os dados pessoais e `app-data/` não devem entrar no Git. A primeira migração deve preservar IDs de personagens, catálogos, mídias e documentos existentes. Não execute migrações destrutivas sem cópia de segurança.

## Abrir no Windows

- `ABRIR_DESENVOLVIMENTO.bat`: **aplicativo completo legado** (somente depois da importação do código original), Vite na porta padrão **5196**, sem executar `predev`. Pode sobrescrever com `NATIVE_GACHA_DEV_PORT` ou `config/porta-local.bat` (veja o exemplo).
- `ABRIR_NATIVO.bat`: protótipo Qt, depois de compilar. **Qt nativo não exige porta HTTP.**
- `ATUALIZAR_DESENVOLVIMENTO.bat`: `git pull --ff-only` do `main`, recusa alterações locais e remotes incorretos.

## Núcleo C++ — teste sem Qt

```bash
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=OFF -DBUILD_TESTING=ON
cmake --build build/native --config Release
ctest --test-dir build/native --build-config Release --output-on-failure
```

## Protótipo visual Qt 6.5+

```bash
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=ON
cmake --build build/native --config Release
```

A interface protótipo mostra a navegação das áreas e um objeto animado pelo motor de keyframes C++20. **Ainda não executa funcionalidades reais** das áreas; é o início da substituição do Chromium.

## Organização

- `native/nymi-core`: motor C++ independente de interface e testes.
- `native/desktop-qt`: protótipo da interface desktop Qt/QML.
- `electron`, `src`, `tests`: aplicativo legado importado e preservado, incluindo apenas o Editor V6.
- `Lixo/`: documentos antigos e workflows legados. **Material histórico não confiável**; não constitui requisito ou evidência atual.
- `docs-atuais/`: decisões curtas baseadas no código e nos testes atuais.

## Próximas provas obrigatórias

1. Validar V6 e todas as áreas no Windows após retirar somente as integrações V7.
2. Definir contratos versionados de projetos, personagens, catálogos e mídia sem depender de documentos antigos.
3. Migrar uma cena V6 real para o motor nativo e comparar quadros, áudio e tempos com o resultado do V6 original.
4. Integrar exportação FFmpeg e UI Qt ao mesmo estado de cena.
5. Migrar cada outra área preservando dados. Electron só deve sair quando houver paridade funcional.

Não registrar projetos privados, mídia do usuário, arquivos `.env`, bancos de dados ou tokens. Repositório público.
