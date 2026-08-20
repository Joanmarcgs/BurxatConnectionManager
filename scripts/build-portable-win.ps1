$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$productName = 'BurxatConnectionManager'

Write-Host "== Building renderer/main/preload =="
npm run build
if ($LASTEXITCODE -ne 0) { throw "electron-vite build failed" }

Write-Host "== Building unpacked Windows app via electron-builder =="
npx electron-builder --win dir
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

$distDir = Join-Path $root 'dist'
$unpackedDir = Join-Path $distDir 'win-unpacked'
if (!(Test-Path $unpackedDir)) { throw "win-unpacked not found at $unpackedDir" }

$stageDir = Join-Path $distDir 'portable-stage'
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir | Out-Null

$appDir = Join-Path $stageDir 'app'
Write-Host "== Moving app files into app/ subfolder =="
Move-Item $unpackedDir $appDir

Write-Host "== Compiling launcher stub =="
$cscPath = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (!(Test-Path $cscPath)) { $cscPath = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
if (!(Test-Path $cscPath)) { throw "Could not find csc.exe (.NET Framework C# compiler)" }

$launcherSrc = Join-Path $root 'build\launcher\Launcher.cs'
$launcherOut = Join-Path $stageDir "$productName.exe"
$iconPath = Join-Path $root 'build\icon.ico'
& $cscPath /nologo /target:winexe /out:"$launcherOut" /win32icon:"$iconPath" "$launcherSrc"
if ($LASTEXITCODE -ne 0) { throw "csc.exe failed to compile launcher" }

Write-Host "== Zipping =="
$zipPath = Join-Path $distDir "$productName-$version-portable.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "== Cleaning up staging =="
Remove-Item $stageDir -Recurse -Force

Write-Host ""
Write-Host "Portable zip created: $zipPath"
Write-Host "Unzip it, then run $productName.exe at the root - the real app lives in app\, connections.vault lands next to the launcher."
