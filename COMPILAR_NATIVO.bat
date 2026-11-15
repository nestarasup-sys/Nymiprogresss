@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
where cmake >nul 2>&1
if errorlevel 1 (
  echo Instale CMake 3.21+ e adicione ao PATH.
  pause
  exit /b 1
)
echo Compilando Qt 6 / C++20...
echo Requer Qt 6.4+ com Qt Quick, Quick Controls, Qml, Multimedia e Concurrent.
echo Requer compilador C++20 (MSVC Build Tools, MinGW compativel com seu Qt, ou equivalente).
echo Se o Qt nao for detectado, configure CMAKE_PREFIX_PATH com o diretorio do Qt.
cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=ON -DBUILD_TESTING=ON
if errorlevel 1 (
  echo Falha ao configurar. Verifique a instalacao Qt e seu compilador.
  pause
  exit /b 1
)
cmake --build build/native --config Release --parallel 4
if errorlevel 1 (
  echo Falha na compilacao Qt nativa.
  pause
  exit /b 1
)
ctest --test-dir build/native --build-config Release --output-on-failure
if errorlevel 1 (
  echo Os testes nativos nao passaram. Nao continue usando dados reais.
  pause
  exit /b 1
)
echo Compilacao e testes concluídos.
