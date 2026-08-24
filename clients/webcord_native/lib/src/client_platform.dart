import 'dart:io';

String get webCordPlatformCode {
  if (Platform.isAndroid) return 'ANDROID';
  if (Platform.isIOS) return 'IOS';
  if (Platform.isWindows) return 'WINDOWS';
  if (Platform.isMacOS) return 'MACOS';
  if (Platform.isLinux) return 'LINUX';
  return 'UNKNOWN';
}

String get webCordPlatformSlug {
  if (Platform.isAndroid) return 'android';
  if (Platform.isIOS) return 'ios';
  if (Platform.isWindows) return 'windows';
  if (Platform.isMacOS) return 'macos';
  if (Platform.isLinux) return 'linux';
  return 'unknown';
}

String get webCordDeviceName {
  if (Platform.isAndroid) return 'WebCord for Android';
  if (Platform.isIOS) return 'WebCord for iPhone and iPad';
  if (Platform.isWindows) return 'WebCord for Windows';
  if (Platform.isMacOS) return 'WebCord for macOS';
  if (Platform.isLinux) return 'WebCord for Linux';
  return 'WebCord Native';
}

bool get supportsWebCordPush => Platform.isAndroid || Platform.isIOS;
