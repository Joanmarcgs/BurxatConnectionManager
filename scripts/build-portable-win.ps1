# Builds the Windows portable zip: a small launcher exe at the root + the real Electron app in app\.
#
#   (no args)             build everything and produce dist\<name>-<version>-portable.zip
#   -StageOnly            build but stop before zipping, leaving dist\portable-stage\ in place.
#                         CI uses this so the two exes can be code-signed before they're zipped.
#   -ZipStage <folder>    skip the build; just zip an already-prepared (e.g. signed) folder.
param(
  [switch]$StageOnly,
  [string]$ZipStage
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$productName = 'BurxatConnectionManager'
$distDir = Join-Path $root 'dist'
$zipPath = Join-Path $distDir "$productName-$version-portable.zip"

function New-PortableZip([string]$sourceDir) {
  Write-Host "== Zipping =="
  if (!(Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $sourceDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host ""
  Write-Host "Portable zip created: $zipPath"
  Write-Host "Unzip it, then run $productName.exe at the root - the real app lives in app\, connections.vault lands next to the launcher."
}

if ($ZipStage) {
  if (!(Test-Path (Join-Path $ZipStage "$productName.exe"))) { throw "$ZipStage doesn't look like a prepared stage (no $productName.exe)" }
  New-PortableZip $ZipStage
  return
}

Write-Host "== Building renderer/main/preload =="
npm run build
if ($LASTEXITCODE -ne 0) { throw "electron-vite build failed" }

Write-Host "== Building unpacked Windows app via electron-builder =="
npx electron-builder --win dir
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

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

# Give the launcher the same product name/version metadata the real exe gets from electron-builder.
# Code-signing services check these, and it's what Explorer shows under Properties > Details.
$versionInfoSrc = Join-Path $env:TEMP "BurxatLauncher.AssemblyInfo.cs"
@"
using System.Reflection;
[assembly: AssemblyTitle("$productName launcher")]
[assembly: AssemblyProduct("$productName")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
[assembly: AssemblyInformationalVersion("$version.0")]
"@ | Set-Content -Path $versionInfoSrc -Encoding UTF8

$launcherSrc = Join-Path $root 'build\launcher\Launcher.cs'
$launcherOut = Join-Path $stageDir "$productName.exe"
$iconPath = Join-Path $root 'build\icon.ico'
& $cscPath /nologo /target:winexe /out:"$launcherOut" /win32icon:"$iconPath" "$launcherSrc" "$versionInfoSrc"
if ($LASTEXITCODE -ne 0) { throw "csc.exe failed to compile launcher" }
Remove-Item $versionInfoSrc -Force

if ($StageOnly) {
  Write-Host ""
  Write-Host "Stage ready (not zipped): $stageDir"
  return
}

New-PortableZip $stageDir

Write-Host "== Cleaning up staging =="
Remove-Item $stageDir -Recurse -Force
