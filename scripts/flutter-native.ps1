param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $FlutterArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$clientRoot = Join-Path $repoRoot "clients\webcord_native"

function Resolve-PathSetting {
  param(
    [string] $EnvName,
    [string] $Fallback
  )

  $value = [Environment]::GetEnvironmentVariable($EnvName)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Fallback
  }
  return $value
}

$sdkRoot = Resolve-PathSetting "WEBCORD_SDK_ROOT" "K:\SDK"
$flutterRoot = Resolve-PathSetting "FLUTTER_ROOT" (Join-Path $sdkRoot "flutter")
$androidSdk = Resolve-PathSetting "ANDROID_SDK_ROOT" (Resolve-PathSetting "ANDROID_HOME" (Join-Path $sdkRoot "android-sdk"))
$cmakeRoot = Resolve-PathSetting "WEBCORD_CMAKE_ROOT" (Join-Path $sdkRoot "cmake")
$javaHome = Resolve-PathSetting "JAVA_HOME" "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$sdkTmp = Resolve-PathSetting "WEBCORD_SDK_TMP" (Join-Path $sdkRoot "tmp")
$gradleHome = Resolve-PathSetting "GRADLE_USER_HOME" (Join-Path $sdkRoot "gradle")
$pubCache = Resolve-PathSetting "PUB_CACHE" (Join-Path $sdkRoot "pub-cache")

if (-not (Test-Path -LiteralPath (Join-Path $flutterRoot "bin\flutter.bat"))) {
  throw "Flutter was not found at $flutterRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $cmakeRoot "bin\cmake.exe"))) {
  throw "CMake was not found at $cmakeRoot"
}

$patchScript = Join-Path $PSScriptRoot "patch-flutter-windows-toolchain.ps1"
if (Test-Path -LiteralPath $patchScript) {
  & $patchScript -FlutterRoot $flutterRoot
}

New-Item -ItemType Directory -Force -Path $sdkTmp, $gradleHome, $pubCache | Out-Null

$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:FLUTTER_WINDOWS_CMAKE_PATH = Join-Path $cmakeRoot "bin\cmake.exe"
$env:JAVA_HOME = $javaHome
$env:TEMP = $sdkTmp
$env:TMP = $sdkTmp
$env:GRADLE_USER_HOME = $gradleHome
$env:PUB_CACHE = $pubCache
$env:JAVA_TOOL_OPTIONS = "-Djava.io.tmpdir=$sdkTmp"
$env:PATH = "$flutterRoot\bin;$cmakeRoot\bin;$androidSdk\cmdline-tools\latest\bin;$androidSdk\platform-tools;$javaHome\bin;$env:PATH"

$localProperties = Join-Path $clientRoot "android\local.properties"
if (Test-Path -LiteralPath $localProperties) {
  $content = Get-Content -LiteralPath $localProperties
  $content = $content | ForEach-Object {
    if ($_ -match "^sdk\.dir=") {
      "sdk.dir=$($androidSdk -replace "\\", "\\")"
    } elseif ($_ -match "^flutter\.sdk=") {
      "flutter.sdk=$($flutterRoot -replace "\\", "\\")"
    } else {
      $_
    }
  }
  Set-Content -LiteralPath $localProperties -Value $content -Encoding ASCII
}

if ($FlutterArgs.Count -eq 0) {
  $FlutterArgs = @("doctor", "-v")
}

Push-Location $clientRoot
try {
  & (Join-Path $flutterRoot "bin\flutter.bat") @FlutterArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
