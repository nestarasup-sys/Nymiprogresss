param(
  [Parameter(Mandatory=$true)][string]$ZipPath
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# Ambos os ZIPs foram produzidos nesta conversa; nao aceitar hashes desconhecidos.
$originalHash = "b2d34839375ab71601933b76199762ef4d98ca5a8baca05848eb49f66b63aea4"
$revisedHash = "5b00f45a8f3edfc389c5dfdb28e533dc72624d1eecfabd975d0cfba79041dbdf"
$acceptedHashes = @($originalHash, $revisedHash)
function MustRunGit([string[]]$Arguments) {
    & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git falhou: $($Arguments -join ' ')" }
}
try {
  $resolvedZip = (Resolve-Path -LiteralPath $ZipPath).Path
  $hash = (Get-FileHash -LiteralPath $resolvedZip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($acceptedHashes -notcontains $hash) {
    throw "ZIP desconhecido: SHA-256 $hash. Importacao bloqueada para proteger o repositorio."
  }
  if ($hash -eq $originalHash) { Write-Host "Pacote original reconhecido. Sera removido CSS residual da versao experimental do editor." }
  Push-Location $repo
  if (-not (Test-Path ".git")) { throw "Clone o repositorio do GitHub antes de importar." }
  $remote = (& git remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0 -or $remote -notmatch 'nestarasup-sys/Nymiprogresss(\.git)?$') {
    throw "O repositorio origin nao aponta para nestarasup-sys/Nymiprogresss."
  }
  $branch = (& git branch --show-current).Trim()
  if ($branch -ne "main") { throw "Use a branch main para importar." }
  $dirty = (& git status --porcelain)
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw "Ha alteracoes locais nao salvas. Faca commit ou backup primeiro." }
  $tempDir = Join-Path ([IO.Path]::GetTempPath()) ("nymi-import-" + [guid]::NewGuid().ToString("N"))
  New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
  try {
    Expand-Archive -LiteralPath $resolvedZip -DestinationPath $tempDir
    foreach ($required in @("package.json", "electron/main.ts", "src/renderer/src/ui/App.tsx", "src/renderer/src/features/editorV6/EditorV6Page.tsx", "Lixo/README.md", "native/nymi-core/src/Timeline.cpp")) {
      if (-not (Test-Path -LiteralPath (Join-Path $tempDir $required))) { throw "Arquivo obrigatorio ausente: $required" }
    }
    # A primeira variante do pacote manteve 52 linhas CSS do editor experimental.
    # A segunda variante ja as removeu. Ambas passam pela verificacao abaixo.
    $css = Join-Path $tempDir "src/renderer/src/ui/styles.css"
    if (-not (Test-Path -LiteralPath $css)) { throw "CSS principal nao encontrado." }
    $cssLines = [IO.File]::ReadAllLines($css, [Text.Encoding]::UTF8)
    $cleanCssLines = @($cssLines | Where-Object { $_ -notmatch 'editor-v7' })
    if ($cleanCssLines.Count -ne $cssLines.Length) {
      [IO.File]::WriteAllText($css, (($cleanCssLines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
      Write-Host "CSS legado da versao experimental removido."
    }
    foreach ($obsolete in @(
      "src/renderer/src/features/editorV7",
      "electron/domains/editorV7",
      "src/shared/editorV7.ts",
      "src/shared/editorV7IpcChannels.ts",
      "src/shared/editorV7Svg.ts",
      "tests/editor-v7",
      "scripts/editor-v7",
      "docs/editor-v7"
    )) {
      if (Test-Path -LiteralPath (Join-Path $tempDir $obsolete)) {
        throw "Pacote inclui codigo desativado inesperado: $obsolete"
      }
    }
    $files = Get-ChildItem -LiteralPath $tempDir -Recurse -Force -File
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($tempDir.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
      if ($relative -match '(^|[\\/])(app-data|node_modules|\.git|\.env)([\\/]|$)') { throw "Caminho proibido no pacote: $relative" }
      $dest = Join-Path $repo $relative
      New-Item -Path (Split-Path -Parent $dest) -ItemType Directory -Force | Out-Null
      Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    }
    MustRunGit -Arguments @("add", "-A")
    MustRunGit -Arguments @("diff", "--cached", "--check")
    MustRunGit -Arguments @("commit", "-m", "feat: importar fonte completa com Editor V6 e todas as areas; arquivar docs")
    Write-Host "Commit criado. Enviando ao GitHub..."
    MustRunGit -Arguments @("push", "origin", "main")
    Write-Host "Fonte importada e publicada com sucesso."
  } finally {
    if (Test-Path $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
  }
} catch {
  Write-Error $_
  exit 1
} finally {
  Pop-Location -ErrorAction SilentlyContinue
}
