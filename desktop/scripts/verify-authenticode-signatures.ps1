param(
  [string]$ReleaseDir = "desktop/release",
  [string]$ExpectedSubject = $env:NEUD_CODE_SIGNING_SUBJECT
)

$ErrorActionPreference = "Stop"
$requireSigning = $env:NEUD_REQUIRE_CODE_SIGNING -eq "1"

function Find-SignTool {
  $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  if (-not (Test-Path $kitsRoot)) {
    throw "Windows SDK SignTool directory not found at $kitsRoot"
  }

  $signtool = Get-ChildItem -Path $kitsRoot -Recurse -Filter "signtool.exe" |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $signtool) {
    throw "SignTool.exe not found under $kitsRoot"
  }

  return $signtool.FullName
}

function Test-ArtifactSignature {
  param(
    [string]$SignTool,
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    throw "Missing artifact: $Path"
  }

  $output = & $SignTool verify /pa /v /ts $Path 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Signature verification failed for $Path`n$output"
  }

  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid") {
    throw "Authenticode status is $($signature.Status) for $Path"
  }

  if (-not $signature.TimeStamperCertificate) {
    throw "Missing RFC 3161 timestamp for $Path"
  }

  if ($ExpectedSubject -and $signature.SignerCertificate.Subject -notlike "*$ExpectedSubject*") {
    throw "Unexpected certificate subject for ${Path}: $($signature.SignerCertificate.Subject)"
  }

  return [ordered]@{
    path = $Path
    status = $signature.Status
    subject = $signature.SignerCertificate.Subject
    timestamp = $signature.TimeStamperCertificate.Subject
    hashAlgorithm = $signature.SignatureType
  }
}

if (-not $requireSigning) {
  Write-Host "Skipping Authenticode verification (NEUD_REQUIRE_CODE_SIGNING is not set)."
  exit 0
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$version = node -p "require('./package.json').version"
$releaseRoot = Join-Path $repoRoot ($ReleaseDir -replace '/', '\')
$artifacts = @(
  (Join-Path $releaseRoot "win-unpacked\NEUD.exe"),
  (Join-Path $releaseRoot "NEUD-Setup-$version-x64.exe")
)

$signtool = Find-SignTool
$results = @()
foreach ($artifact in $artifacts) {
  $results += Test-ArtifactSignature -SignTool $signtool -Path $artifact
}

Write-Host ($results | ConvertTo-Json -Depth 4)
