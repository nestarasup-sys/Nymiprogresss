# Decisões vigentes — 2026-11-15

1. O **Editor V6 é o único editor do produto**; a versão experimental posterior foi removida dos pontos de entrada, IPC, scripts e testes.
2. O aplicativo possui outras áreas de primeira classe: Fabricador DEV, Customizador, Studio, Roteiros, Base de vídeos, Biblioteca V6 e Logs DEV. Nenhuma delas será substituída por uma página genérica de editor.
3. A implementação Qt/QML + C++20 é incremental. O aplicativo original permanece funcional enquanto seus contratos e dados são migrados por etapas.
4. O caminho de exportação final deverá ser independente de captura de páginas Chromium e utilizar o FFmpeg. O protótipo atual **ainda não faz exportação**.
5. O arquivo `.bat` de desenvolvimento legado continua existindo, com porta configurável e isolada, sem acionar migração de dados por `predev`. Qt nativo não usa porta HTTP para a própria janela.
6. Documentos antigos e workflows legados estão em `Lixo/`, **sem autoridade técnica**. A fonte de verdade é código + testes executados + dados versionados conferidos.
7. Alterações irreversíveis em documentos e bibliotecas são proibidas durante a migração sem backups verificáveis.
