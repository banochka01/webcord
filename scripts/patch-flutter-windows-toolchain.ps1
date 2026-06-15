param(
  [string] $FlutterRoot = "K:\SDK\flutter"
)

$ErrorActionPreference = "Stop"

$visualStudioFile = Join-Path $FlutterRoot "packages\flutter_tools\lib\src\windows\visual_studio.dart"
$pluginsFile = Join-Path $FlutterRoot "packages\flutter_tools\lib\src\flutter_plugins.dart"
if (-not (Test-Path -LiteralPath $visualStudioFile)) {
  throw "Flutter visual_studio.dart was not found at $visualStudioFile"
}
if (-not (Test-Path -LiteralPath $pluginsFile)) {
  throw "Flutter flutter_plugins.dart was not found at $pluginsFile"
}

$changed = $false

$content = Get-Content -LiteralPath $visualStudioFile -Raw
if (-not $content.Contains("FLUTTER_WINDOWS_CMAKE_PATH")) {

$oldComponents = "  bool get hasNecessaryComponents => _bestVisualStudioDetails?.isUsable ?? false;"
$newComponents = @'
  bool get hasNecessaryComponents {
    final VswhereDetails? details = _bestVisualStudioDetails;
    if (details == null) {
      return false;
    }
    if (details.isUsable) {
      return true;
    }

    // Local fallback for machines where the Visual Studio installer metadata is
    // incomplete but the compiler and a standalone CMake are available.
    return details.installationPath != null &&
        details.msvcVersion != null &&
        isComplete &&
        isLaunchable &&
        cmakePath != null;
  }
'@

if (-not $content.Contains($oldComponents)) {
  throw "Flutter VisualStudio.hasNecessaryComponents shape changed; patch must be reviewed."
}
$content = $content.Replace($oldComponents, $newComponents)

$oldCmake = @'
  String? get cmakePath {
    final VswhereDetails? details = _bestVisualStudioDetails;
    if (details == null || !details.isUsable || details.installationPath == null) {
      return null;
    }

    return _fileSystem.path.joinAll(<String>[
      details.installationPath!,
      'Common7',
      'IDE',
      'CommonExtensions',
      'Microsoft',
      'CMake',
      'CMake',
      'bin',
      'cmake.exe',
    ]);
  }
'@

$newCmake = @'
  String? get cmakePath {
    final String? explicitCmakePath = _platform.environment['FLUTTER_WINDOWS_CMAKE_PATH'];
    if (explicitCmakePath != null && explicitCmakePath.isNotEmpty) {
      final File explicitCmake = _fileSystem.file(explicitCmakePath);
      if (explicitCmake.existsSync()) {
        return explicitCmake.path;
      }
    }

    final VswhereDetails? details = _bestVisualStudioDetails;
    if (details == null || details.installationPath == null) {
      return null;
    }

    final String bundledCmakePath = _fileSystem.path.joinAll(<String>[
      details.installationPath!,
      'Common7',
      'IDE',
      'CommonExtensions',
      'Microsoft',
      'CMake',
      'CMake',
      'bin',
      'cmake.exe',
    ]);
    return _fileSystem.file(bundledCmakePath).existsSync() ? bundledCmakePath : null;
  }
'@

if (-not $content.Contains($oldCmake)) {
  throw "Flutter VisualStudio.cmakePath shape changed; patch must be reviewed."
}
$content = $content.Replace($oldCmake, $newCmake)

$content = $content.Replace("        !details.isUsable ||`r`n", "")
$content = $content.Replace("        !details.isUsable ||`n", "")
$content = $content.Replace("    if (details == null || !details.isUsable || details.installationPath == null) {", "    if (details == null || details.installationPath == null) {")

[System.IO.File]::WriteAllText($visualStudioFile, $content, [System.Text.UTF8Encoding]::new($false))
$changed = $true
}

$pluginsContent = Get-Content -LiteralPath $pluginsFile -Raw
if (-not $pluginsContent.Contains("_createWindowsPluginJunction")) {
  $oldPluginBlock = @'
    final Link link = symlinkDirectory.childLink(name);
    if (link.existsSync()) {
      continue;
    }
    try {
      link.createSync(path);
    } on FileSystemException catch (e) {
      handleSymlinkException(
'@

  $newPluginBlock = @'
    final Link link = symlinkDirectory.childLink(name);
    final Directory junction = symlinkDirectory.childDirectory(name);
    if (link.existsSync() || junction.existsSync()) {
      continue;
    }
    try {
      link.createSync(path);
    } on FileSystemException catch (e) {
      if (_createWindowsPluginJunction(e, link.path, path)) {
        continue;
      }
      handleSymlinkException(
'@

  if (-not $pluginsContent.Contains($oldPluginBlock)) {
    throw "Flutter plugin symlink block shape changed; patch must be reviewed."
  }
  $pluginsContent = $pluginsContent.Replace($oldPluginBlock, $newPluginBlock)

  $oldPluginTail = @'
  }
}

/// Rewrites the `.flutter-plugins` file of [project] based on the plugin
'@

  $newPluginTail = @'
  }
}

bool _createWindowsPluginJunction(
  FileSystemException exception,
  String destination,
  String source,
) {
  if (!globals.platform.isWindows || exception.osError?.errorCode != 1314) {
    return false;
  }
  final result = globals.processManager.runSync(<String>[
    'cmd',
    '/c',
    'mklink',
    '/J',
    destination,
    source,
  ]);
  if (result.exitCode == 0) {
    globals.printTrace('Created plugin junction $destination -> $source');
    return true;
  }
  return false;
}

/// Rewrites the `.flutter-plugins` file of [project] based on the plugin
'@

  if (-not $pluginsContent.Contains($oldPluginTail)) {
    throw "Flutter plugin symlink tail shape changed; patch must be reviewed."
  }
  $pluginsContent = $pluginsContent.Replace($oldPluginTail, $newPluginTail)
  [System.IO.File]::WriteAllText($pluginsFile, $pluginsContent, [System.Text.UTF8Encoding]::new($false))
  $changed = $true
}

if ($changed) {
  Remove-Item -LiteralPath (Join-Path $FlutterRoot "bin\cache\flutter_tools.snapshot") -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $FlutterRoot "bin\cache\flutter_tools.stamp") -Force -ErrorAction SilentlyContinue
}
