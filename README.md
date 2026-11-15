# Nymiprogresss — Native Gacha

**Migração progressiva para Qt 6/QML + C++20.** O **Editor V6** é o único editor mantido. O aplicativo também inclui Fabricador DEV, Customizador, Studio, Roteiros, Base de vídeos, Biblioteca V6 e Logs DEV.

## Situação real

O repositório foi inicializado com a fundação nativa e ferramentas para importar o código-fonte reorganizado. **O aplicativo completo ainda depende de Electron; a migração para Qt está em andamento.** A interface Qt é um protótipo, não substitui ainda as áreas em produção. Preservaremos o aplicativo funcional até termos paridade verificável.

## Importar o código completo

O pacote reorganizado inclui todas as áreas do app, remove as integrações da versão experimental descartada do editor, move os documentos antigos para `Lixo/` e mantém `ABRIR_DESENVOLVIMENTO.bat` com porta inicial 5196.

1. Baixe o pacote `Nymiprogresss-fonte-reorganizada.zip` fornecido nesta conversa.
2. Clone o repositório: `git clone https://github.com/nestarasup-sys/Nymiprogresss.git`.
3. Na pasta clonada, execute `IMPORTAR_FONTE_PREPARADA.bat "C:\caminho\Nymiprogresss-fonte-reorganizada.zip"`. O script valida o pacote, recusa alterações locais e faz commit/push para `main`.

Não use projetos pessoais, mídia privada ou bancos locais como fonte para publicação. A pasta `app-data/` permanece fora do Git.

## Testar o núcleo C++ sem Qt

```bash
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=OFF -DBUILD_TESTING=ON
cmake --build build/native --config Release
ctest --test-dir build/native --build-config Release --output-on-failure
```

## Compilar o protótipo Qt

Instale Qt 6.5+, compilador C++20 e CMake, depois:

```bash
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=ON
cmake --build build/native --config Release
```

No Windows, `ABRIR_NATIVO.bat` inicia o protótipo compilado. Qt não precisa de porta HTTP; **a porta 5196 é somente para o legado V6 aberto por `ABRIR_DESENVOLVIMENTO.bat`** após a importação.

A documentação antiga é histórica e não confiável; somente código, testes, formatos conferidos e decisões novas fundamentam a migração.
