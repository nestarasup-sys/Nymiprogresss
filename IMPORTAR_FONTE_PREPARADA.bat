@echo off
setlocal EnableExtensions DisableDelayedExpansion
if "%~1"=="" (
  echo Uso: IMPORTAR_FONTE_PREPARADA.bat "C:\caminho\Nymiprogresss-fonte-reorganizada.zip"
  pause
  exit /b 2
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\IMPORTAR_FONTE_PREPARADA.ps1" -ZipPath "%~1"
if errorlevel 1 (
  echo Importacao interrompida. Seus arquivos nao foram apagados.
  pause
  exit /b 1
)
echo Importacao concluida.
pause
