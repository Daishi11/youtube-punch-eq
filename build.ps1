param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root 'manifest.json'
$dist = Join-Path $root 'dist'
$tempRoot = Join-Path $env:TEMP 'youtube-punch-eq-build'

if (-not (Test-Path $manifestPath)) {
  throw 'manifest.json was not found next to build.ps1.'
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'manifest.json does not contain a valid version.'
}

Write-Host ''
Write-Host '=== YouTube Punch EQ Build ==='
Write-Host "Version: $version"
Write-Host "Root:    $root"
Write-Host ''

if (-not $SkipTests) {
  $node = Get-Command 'node' -ErrorAction SilentlyContinue

  if (-not $node) {
    throw 'Node.js was not found. Install Node.js or run .\build.ps1 -SkipTests.'
  }

  $jsFiles = @(
    'shared/config.js',
    'content/engine.js',
    'content/bridge.js',
    'popup/popup.js',
    'tests/config.test.js'
  )

  Write-Host 'Checking JavaScript syntax...'
  foreach ($relativePath in $jsFiles) {
    $file = Join-Path $root $relativePath
    & node --check $file
    if ($LASTEXITCODE -ne 0) {
      throw "JavaScript syntax check failed: $relativePath"
    }
  }

  Write-Host 'Running tests...'
  Push-Location $root
  try {
    & node 'tests/config.test.js'
    if ($LASTEXITCODE -ne 0) {
      throw 'Tests failed.'
    }
  }
  finally {
    Pop-Location
  }

  Write-Host 'Tests passed.'
  Write-Host ''
}

if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}
New-Item $dist -ItemType Directory | Out-Null

if (Test-Path $tempRoot) {
  Remove-Item $tempRoot -Recurse -Force
}
New-Item $tempRoot -ItemType Directory | Out-Null

$runtimeStage = Join-Path $tempRoot 'runtime'
$sourceStage = Join-Path $tempRoot 'source'
New-Item $runtimeStage -ItemType Directory | Out-Null
New-Item $sourceStage -ItemType Directory | Out-Null

try {
  Write-Host 'Staging runtime extension...'

  Copy-Item (Join-Path $root 'manifest.json') $runtimeStage
  foreach ($directory in @('content', 'icons', 'popup', 'shared')) {
    Copy-Item (Join-Path $root $directory) $runtimeStage -Recurse
  }

  $runtimeZip = Join-Path $dist "youtube-punch-eq-$version.zip"
  $xpiPath = Join-Path $dist "youtube-punch-eq-$version-unsigned.xpi"

  Compress-Archive -Path (Join-Path $runtimeStage '*') -DestinationPath $runtimeZip -CompressionLevel Optimal
  Move-Item $runtimeZip $xpiPath

  Write-Host 'Staging source package...'

  $excludedNames = @(
    '.git',
    'dist',
    'web-ext-artifacts',
    '.DS_Store',
    'Thumbs.db'
  )

  Get-ChildItem $root -Force | ForEach-Object {
    if ($excludedNames -contains $_.Name) {
      return
    }

    $destination = Join-Path $sourceStage $_.Name
    if ($_.PSIsContainer) {
      Copy-Item $_.FullName $destination -Recurse
    }
    else {
      Copy-Item $_.FullName $destination
    }
  }

  $sourceZip = Join-Path $dist "youtube-punch-eq-$version-source.zip"
  Compress-Archive -Path (Join-Path $sourceStage '*') -DestinationPath $sourceZip -CompressionLevel Optimal

  $hashFile = Join-Path $dist 'SHA256SUMS.txt'
  $artifacts = @($xpiPath, $sourceZip)
  $hashLines = foreach ($artifact in $artifacts) {
    $hash = Get-FileHash $artifact -Algorithm SHA256
    '{0}  {1}' -f $hash.Hash.ToLowerInvariant(), (Split-Path $artifact -Leaf)
  }
  $hashLines | Set-Content $hashFile -Encoding ASCII

  Write-Host ''
  Write-Host 'Build complete.'
  Write-Host "XPI:    $xpiPath"
  Write-Host "Source: $sourceZip"
  Write-Host "Hashes: $hashFile"
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item $tempRoot -Recurse -Force
  }
}
