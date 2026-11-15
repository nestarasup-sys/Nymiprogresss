@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "VERIFY_EXE="
if exist "build\native\native\native-data\Release\nymi-native-verify.exe" set "VERIFY_EXE=build\native\native\native-data\Release\nymi-native-verify.exe"
if not defined VERIFY_EXE if exist "build\native\native\native-data\nymi-native-verify.exe" set "VERIFY_EXE=build\native\native\native-data\nymi-native-verify.exe"
if not defined VERIFY_EXE (
  echo Compile o app com COMPILAR_NATIVO.bat antes de verificar.
  pause
  exit /b 1
)
if not defined NYMI_NATIVE_DATA_DIR set "NYMI_NATIVE_DATA_DIR=%~dp0..\NativeProgress-MigrationPrivate\nymiprogress-native-data-v1-final"
if not exist "%NYMI_NATIVE_DATA_DIR%\manifest.json" (
  echo Bundle privado nao encontrado. Configure NYMI_NATIVE_DATA_DIR.
  pause
  exit /b 1
)
echo Validando formato e estrutura, sem alterar arquivos...
"%VERIFY_EXE%" "%NYMI_NATIVE_DATA_DIR%"
if errorlevel 1 (pause & exit /b 1)
echo Para verificar todos os SHA-256, use:
echo "%VERIFY_EXE%" "%NYMI_NATIVE_DATA_DIR%" --deep
pause
