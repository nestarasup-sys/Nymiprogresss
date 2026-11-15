@echo off
setlocal
cd /d "%~dp0"
if not exist "build\native\native\desktop-qt\Release\nymi-desktop.exe" if not exist "build\native\native\desktop-qt\nymi-desktop.exe" (
  echo O prototipo Qt ainda nao foi compilado.
  echo Instale Qt 6.5+, CMake e um compilador C++20.
  echo Rode: cmake -S . -B build/native -DNYMI_BUILD_DESKTOP=ON
  echo Depois: cmake --build build/native --config Release
  pause
  exit /b 1
)
if exist "build\native\native\desktop-qt\Release\nymi-desktop.exe" (
  start "" "build\native\native\desktop-qt\Release\nymi-desktop.exe"
) else (
  start "" "build\native\native\desktop-qt\nymi-desktop.exe"
)
