# Decisões vigentes — 2026-11-15

- **Único editor do produto: Editor V6.** A versão experimental posterior não deve ser reutilizada.
- Preservar Fabricador DEV, Customizador, Studio, Roteiros, Base de vídeos, Biblioteca V6 e Logs DEV.
- Migração gradual Qt/QML + C++20; Electron permanece apenas para funcionalidades não migradas.
- FFmpeg será o caminho de exportação final, sem captura Chromium; **ainda não implementado no protótipo nativo**.
- A porta 5196 é para o aplicativo legado; o Qt nativo não necessita de porta HTTP.
- Documentação antiga é quarentenada em `Lixo/`, não define contratos; verificar código e testes.
- Proibir migrações destrutivas e preservar IDs/catálogos/documentos originais com backups.
