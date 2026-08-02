param(
  [switch] $SkipBuild,
  [string] $OutputRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$clientRoot = Join-Path $repoRoot "clients\webcord_native"
$pubspecPath = Join-Path $clientRoot "pubspec.yaml"
$versionLine = Get-Content -LiteralPath $pubspecPath | Where-Object { $_ -match '^version:\s*' } | Select-Object -First 1
if (-not $versionLine) { throw "Could not read the client version from $pubspecPath" }
$version = ($versionLine -replace '^version:\s*', '') -replace '\+', '-build.'

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $repoRoot "releases"
}
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot)
$repoPrefix = $resolvedRepoRoot.TrimEnd('\') + '\'
if ($resolvedOutputRoot -ne $resolvedRepoRoot -and -not $resolvedOutputRoot.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release output must stay inside the repository: $resolvedOutputRoot"
}

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot "flutter-native.ps1") clean
  if ($LASTEXITCODE -ne 0) { throw "Flutter clean failed" }
  & (Join-Path $PSScriptRoot "flutter-native.ps1") analyze
  if ($LASTEXITCODE -ne 0) { throw "Flutter analyze failed" }
  & (Join-Path $PSScriptRoot "flutter-native.ps1") test
  if ($LASTEXITCODE -ne 0) { throw "Flutter tests failed" }
  & (Join-Path $PSScriptRoot "flutter-native.ps1") build apk --release --dart-define=WEBCORD_API_URL=https://webcordes.ru/api
  if ($LASTEXITCODE -ne 0) { throw "Android release build failed" }
  & (Join-Path $PSScriptRoot "flutter-native.ps1") pub get
  if ($LASTEXITCODE -ne 0) { throw "Flutter package restore failed" }
  & (Join-Path $PSScriptRoot "prepare-flutter-windows.ps1")
  & (Join-Path $PSScriptRoot "flutter-native.ps1") build windows --release --no-pub --dart-define=WEBCORD_API_URL=https://webcordes.ru/api
  if ($LASTEXITCODE -ne 0) { throw "Windows release build failed" }
}

$apkSource = Join-Path $clientRoot "build\app\outputs\flutter-apk\app-release.apk"
$windowsSource = Join-Path $clientRoot "build\windows\x64\runner\Release"
if (-not (Test-Path -LiteralPath $apkSource -PathType Leaf)) { throw "Android artifact was not found: $apkSource" }
if (-not (Test-Path -LiteralPath (Join-Path $windowsSource "WebCord.exe") -PathType Leaf)) { throw "Windows artifact was not found: $windowsSource" }

New-Item -ItemType Directory -Force -Path $resolvedOutputRoot | Out-Null
$apkTarget = Join-Path $resolvedOutputRoot "WebCord-$version-android.apk"
$windowsTarget = Join-Path $resolvedOutputRoot "WebCord-$version-windows.zip"
Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
Compress-Archive -Path (Join-Path $windowsSource "*") -DestinationPath $windowsTarget -CompressionLevel Optimal -Force

$artifacts = @($apkTarget, $windowsTarget) | ForEach-Object {
  $file = Get-Item -LiteralPath $_
  $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
  [pscustomobject][ordered]@{
    file = $file.Name
    bytes = $file.Length
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  product = "WebCord"
  version = $version
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  artifacts = $artifacts
}
$manifestPath = Join-Path $resolvedOutputRoot "WebCord-$version-manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "Packaged WebCord $version"
$artifacts | Format-Table file, bytes, sha256 -AutoSize
Write-Host "Manifest: $manifestPath"
