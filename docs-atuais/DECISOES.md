# Decisões vigentes — 2026-11-15

1. O **Editor V6 é o único editor do produto**; a versão experimental posterior foi removida dos pontos de entrada, IPC, scripts e testes.
2. O aplicativo possui outras áreas de primeira classe: Fabricador DEV, Customizador, Studio, Roteiros, Base de vídeos, Biblioteca V6 e Logs DEV. Nenhuma delas será substituída por uma página genérica de editor.
3. A implementação Qt/QML + C++20 é incremental. O aplicativo original permanece funcional enquanto seus contratos e dados são migrados por etapas.
4. O caminho de exportação final deverá ser independente de captura de páginas Chromium e utilizar o FFmpeg. O protótipo atual **ainda não faz exportação**.
5. O arquivo `.bat` de desenvolvimento legado continua existindo, com porta configurável e isolada, sem acionar migração de dados por `predev`. Qt nativo não usa porta HTTP para a própria janela.
6. Documentos antigos e workflows legados estão em `Lixo/`, **sem autoridade técnica**. A fonte de verdade é código + testes executados + dados versionados conferidos.
7. Alterações irreversíveis em documentos e bibliotecas são proibidas durante a migração sem backups verificáveis.

8. **Conversão definitiva dos dados:** o Nymiprogresss nativo utiliza exclusivamente o formato canônico `nymiprogress.native-data` v1, descrito em `FORMATO-DADOS-NATIVOS-V1.md`. Não deve implementar leitor de formatos antigos em tempo de execução. Um **conversor externo, de uso único**, lê o legado, transforma e valida os dados antes da estreia da aplicação nativa.
9. **Fonte local legada:** `C:\TRABALHO 2\OUTROS\GACHA EM C++`. Destino local do projeto novo: `C:\TRABALHO 2\OUTROS\NativeProgress`. O conversor roda na máquina do usuário, deve preservar a origem intocada, criar cópia de segurança e oferecer execução de ensaio (dry-run), relatórios e retomada segura. Nenhuma mídia pessoal ou banco real será publicada no repositório público.
10. **Ordem de trabalho:** inventariar dados/código legados, desenhar esquema novo, implementar conversor com testes e validação de integridade; somente então migrar módulos gráficos para Qt/C++ que lerão apenas dados convertidos.

11. **Escopo definitivo da conversão local de dados (atualizado em 2026-11-15):** migrar exclusivamente (a) todos os dados úteis e entidades próprias do Fabricador DEV, (b) personagens e dependências do Customizador e (c) vídeos, **rascunhos**, categorias e dependências da Base de vídeos. Não migrar dados dos projetos antigos de Roteiros, Editor V6, Studio, bibliotecas sem referência ou preferências gerais do Electron. **Os módulos e o código continuam no aplicativo**; apenas os dados históricos desses outros módulos não serão convertidos.
12. A seleção do conversor é por domínio e por referências transitivas: preservar os assets que as três áreas incluídas realmente usam, excluir mídias/sidecars órfãos e dependências exclusivas de módulos excluídos. Entidades editáveis próprias do Fabricador são raízes válidas mesmo sem vínculo com personagens do Customizador. A exclusão nunca apaga ou modifica a origem/backup; registros desconhecidos que possam pertencer aos domínios escolhidos exigem classificação antes da conversão.
