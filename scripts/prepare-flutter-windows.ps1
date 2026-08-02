$ErrorActionPreference = 'Stop'

$clientRoot = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'clients\webcord_native'
$registrantPath = Join-Path $clientRoot 'windows\flutter\generated_plugin_registrant.cc'
$pluginsPath = Join-Path $clientRoot 'windows\flutter\generated_plugins.cmake'

# FCM is Android-only in WebCord. FlutterFire advertises firebase_core for Windows,
# which pulls the full Firebase C++ SDK even though runtime initialization is gated
# by Platform.isAndroid. Remove only that generated Windows registration before a
# --no-pub build; Android keeps the normal FlutterFire plugin registration.
$registrant = Get-Content -Raw -LiteralPath $registrantPath
$registrant = $registrant.Replace("#include <firebase_core/firebase_core_plugin_c_api.h>`r`n", '')
$registrant = $registrant.Replace("#include <firebase_core/firebase_core_plugin_c_api.h>`n", '')
$registrant = $registrant.Replace("  FirebaseCorePluginCApiRegisterWithRegistrar(`r`n      registry->GetRegistrarForPlugin(`"FirebaseCorePluginCApi`"));`r`n", '')
$registrant = $registrant.Replace("  FirebaseCorePluginCApiRegisterWithRegistrar(`n      registry->GetRegistrarForPlugin(`"FirebaseCorePluginCApi`"));`n", '')
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($registrantPath, $registrant, $utf8WithoutBom)

$plugins = Get-Content -Raw -LiteralPath $pluginsPath
$plugins = $plugins.Replace("  firebase_core`r`n", '').Replace("  firebase_core`n", '')
[System.IO.File]::WriteAllText($pluginsPath, $plugins, $utf8WithoutBom)
