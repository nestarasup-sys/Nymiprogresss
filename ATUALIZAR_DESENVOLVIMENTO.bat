@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
echo Nymiprogresss - atualizacao segura de main
where git >nul 2>&1 || goto :erro
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "REPO_URL=%%R"
echo(%REPO_URL%| findstr /i /c:"nestarasup-sys/Nymiprogresss" >nul || goto :repo_errado
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /i not "%CURRENT_BRANCH%"=="main" (
  echo Troque manualmente para a branch main antes de atualizar.
  goto :erro
)
for /f "delims=" %%S in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  echo Existem alteracoes locais. Faca commit ou backup antes de atualizar.
  goto :erro
)
git fetch origin main || goto :erro
git pull --ff-only origin main || goto :erro
echo Atualizacao concluida, sem apagar arquivos locais.
exit /b 0
:repo_errado
echo O repositorio de origem nao e nestarasup-sys/Nymiprogresss.
:erro
pause
exit /b 1
