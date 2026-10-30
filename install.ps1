<#
.SYNOPSIS
  Installs the chub binary for this Windows machine.

.DESCRIPTION
  Downloads the release asset for this machine, verifies its SHA-256 against
  the published SHA256SUMS and installs chub.exe. Re-running it upgrades in
  place, so stop chub first: Windows cannot replace a running executable.

.EXAMPLE
  irm https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.ps1 | iex

.EXAMPLE
  .\install.ps1 -Version 0.4.3 -Dir C:\tools\chub
#>
[CmdletBinding()]
param(
  # Install a specific release instead of the latest one.
  [string] $Version = "latest",

  # Install into this directory (default: %LOCALAPPDATA%\Programs\chub).
  [string] $Dir,

  # Release host; used by mirrors and by the test suite.
  [string] $BaseUrl
)

$ErrorActionPreference = "Stop"

function Fail([string] $Message) {
  Write-Error "install.ps1: $Message"
  exit 1
}

$root = if ($BaseUrl) { $BaseUrl } elseif ($env:CHUB_INSTALL_BASE_URL) { $env:CHUB_INSTALL_BASE_URL } else { "https://github.com/AlonsoSG0/CodiceHub" }
$target = if ($Dir) { $Dir } elseif ($env:CHUB_INSTALL_DIR) { $env:CHUB_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\chub" }

# The Windows path is published for testing, not because it is proven. Remove this disclaimer only once a real
# Windows run has confirmed install, start, browser and re-install, and the same note is gone from both READMEs.
Write-Warning "chub for Windows is untested: no one has run this installer or this build on a real Windows machine yet. If something fails, that is the expected outcome until it is verified."

# ARM64 Windows reports AMD64 to a 32-bit process, so the wider variable wins.
$machine = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($machine) {
  "AMD64" { $arch = "x64" }
  "ARM64" { $arch = "arm64" }
  default { Fail "unsupported architecture: $machine (chub publishes x64 and arm64 builds)" }
}

$asset = "chub-windows-$arch"

if ($Version -eq "latest") {
  $release = "releases/latest/download"
} else {
  if ($Version -notmatch "^v") { $Version = "v$Version" }
  $release = "releases/download/$Version"
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("chub-install-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $work -Force | Out-Null

try {
  Write-Host "Downloading $asset ($Version)..."
  $archive = Join-Path $work "$asset.gz"
  $sums = Join-Path $work "SHA256SUMS"
  try {
    Invoke-WebRequest -Uri "$root/$release/$asset.gz" -OutFile $archive -UseBasicParsing
    Invoke-WebRequest -Uri "$root/$release/SHA256SUMS" -OutFile $sums -UseBasicParsing
  } catch {
    Fail "could not download $root/$release/$asset.gz (is that release published?)"
  }

  $line = Get-Content $sums | Where-Object { ($_ -split "\s+")[1] -eq "$asset.gz" } | Select-Object -First 1
  if (-not $line) { Fail "no checksum published for $asset.gz in this release" }
  $expected = ($line -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "checksum mismatch for $asset.gz: expected $expected, got $actual" }

  # The release keeps one format for every platform, and gzip is part of .NET.
  $exe = Join-Path $work "chub.exe"
  $source = [System.IO.File]::OpenRead($archive)
  try {
    $inflate = New-Object System.IO.Compression.GZipStream($source, [System.IO.Compression.CompressionMode]::Decompress)
    try {
      $output = [System.IO.File]::Create($exe)
      try { $inflate.CopyTo($output) } finally { $output.Dispose() }
    } finally { $inflate.Dispose() }
  } finally { $source.Dispose() }

  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $installed = Join-Path $target "chub.exe"
  try {
    Move-Item -Force -Path $exe -Destination $installed
  } catch {
    Fail "could not replace $installed; stop chub (Ctrl+C in its window) and run this again"
  }

  $reported = & $installed --version
  Write-Host "chub $reported installed at $installed"

  $onPath = ($env:PATH -split ";") | Where-Object { $_ -and $_.TrimEnd("\") -eq $target.TrimEnd("\") }
  if (-not $onPath) {
    Write-Warning "$target is not on your PATH, so chub will not be found. Add it for your user with: [Environment]::SetEnvironmentVariable('Path', $env:PATH + ';$target', 'User')"
  }
} finally {
  Remove-Item -Recurse -Force -Path $work -ErrorAction SilentlyContinue
}
