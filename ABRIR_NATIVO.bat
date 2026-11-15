@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
rem Este BAT abre somente a interface Qt/C++; nao executa nenhum conversor.
set "NYMI_EXE="
if exist "build\native\native\desktop-qt\Release\nymi-desktop.exe" set "NYMI_EXE=build\native\native\desktop-qt\Release\nymi-desktop.exe"
if not defined NYMI_EXE if exist "build\native\native\desktop-qt\nymi-desktop.exe" set "NYMI_EXE=build\native\native\desktop-qt\nymi-desktop.exe"
if not defined NYMI_EXE if exist "build\native\native\desktop-qt\Debug\nymi-desktop.exe" set "NYMI_EXE=build\native\native\desktop-qt\Debug\nymi-desktop.exe"
if not defined NYMI_EXE (
  echo O executavel Qt ainda nao foi compilado. Tentando compilar...
  call "%~dp0COMPILAR_NATIVO.bat"
  if errorlevel 1 exit /b 1
  if exist "build\native\native\desktop-qt\Release\nymi-desktop.exe" set "NYMI_EXE=build\native\native\desktop-qt\Release\nymi-desktop.exe"
  if not defined NYMI_EXE if exist "build\native\native\desktop-qt\nymi-desktop.exe" set "NYMI_EXE=build\native\native\desktop-qt\nymi-desktop.exe"
  if not defined NYMI_EXE (
    echo Erro: compilacao nao encontrou o executavel esperado.
    pause
    exit /b 1
  )
)
if not defined NYMI_NATIVE_DATA_DIR set "NYMI_NATIVE_DATA_DIR=%~dp0..\NativeProgress-MigrationPrivate\nymiprogress-native-data-v1-final"
if exist "%NYMI_NATIVE_DATA_DIR%\manifest.json" (
  echo Abrindo Nymiprogresss com dados nativos locais...
  "%NYMI_EXE%" --data-dir "%NYMI_NATIVE_DATA_DIR%"
) else (
  echo Bundle nativo nao encontrado em "%NYMI_NATIVE_DATA_DIR%".
  echo A janela permitira escolher a pasta manualmente. Nenhum dado sera modificado.
  "%NYMI_EXE%"
)
if errorlevel 1 (
  echo A janela Qt encerrou com erro. Confirme as bibliotecas Qt e o bundle local.
  pause
  exit /b 1
)
