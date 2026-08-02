param(
  [Parameter(Mandatory = $true)]
  [string] $ApkPath,
  [string] $ExpectedSha256 = $(if ($env:WEBCORD_ANDROID_EXPECTED_CERT_SHA256) { $env:WEBCORD_ANDROID_EXPECTED_CERT_SHA256 } else { '9ad717f4544a0bb837c728c2dd54fff4c2f6931a21403e32abbe81512381db52' })
)

$ErrorActionPreference = 'Stop'
$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$androidSdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'K:\SDK\android-sdk' }
$apksigner = Get-ChildItem -LiteralPath (Join-Path $androidSdk 'build-tools') -Directory |
  Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } -Descending |
  ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not $apksigner) {
  throw "Android apksigner was not found below $androidSdk\build-tools"
}

$previousJavaToolOptions = $env:JAVA_TOOL_OPTIONS
try {
  $env:JAVA_TOOL_OPTIONS = ''
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $verification = & $apksigner verify --print-certs $resolvedApk 2>&1
  $verifyExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
} finally {
  $env:JAVA_TOOL_OPTIONS = $previousJavaToolOptions
}
if ($verifyExitCode -ne 0) {
  throw "APK signature verification failed: $verification"
}

$digestLine = $verification | Where-Object { $_ -match 'Signer #1 certificate SHA-256 digest:' } | Select-Object -First 1
if (-not $digestLine) {
  throw 'APK signer SHA-256 digest was not reported.'
}
$actual = (($digestLine -split ':', 2)[1] -replace '[^a-fA-F0-9]', '').ToLowerInvariant()
$expected = ($ExpectedSha256 -replace '[^a-fA-F0-9]', '').ToLowerInvariant()
if ($actual -ne $expected) {
  throw "APK signing identity changed. Expected $expected but found $actual. Publishing this build would break in-place upgrades."
}

Write-Host "Verified WebCord Android signing identity: $actual"
