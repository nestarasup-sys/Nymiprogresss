@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo Faltam os arquivos do aplicativo completo.
  echo Use IMPORTAR_FONTE_PREPARADA.bat com o pacote reorganizado.
  pause
  exit /b 1
)
echo Iniciando aplicativo legado V6...
if not defined NATIVE_GACHA_DEV_PORT set "NATIVE_GACHA_DEV_PORT=5196"
if exist "config\porta-local.bat" call "config\porta-local.bat"
echo Porta: %NATIVE_GACHA_DEV_PORT%
echo A inicializacao completa sera disponibilizada pelo pacote importado.
pause
exit /b 1
