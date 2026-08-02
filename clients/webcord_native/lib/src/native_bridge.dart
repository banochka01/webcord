import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

class NativeBridge {
  static const MethodChannel _channel = MethodChannel('webcord/native');

  static Future<String?> pickFile() async {
    if (Platform.isAndroid || Platform.isWindows) {
      return _channel.invokeMethod<String>('pickFile');
    }
    return null;
  }

  static Future<bool> openUrl(String url) async {
    if (Platform.isAndroid || Platform.isWindows) {
      return await _channel.invokeMethod<bool>('openUrl', {'url': url}) ??
          false;
    }
    return false;
  }

  static Future<String?> startAudioRecording() async {
    if (Platform.isAndroid || Platform.isWindows) {
      return _channel.invokeMethod<String>('startAudioRecording');
    }
    return null;
  }

  static Future<String?> stopAudioRecording() async {
    if (Platform.isAndroid || Platform.isWindows) {
      return _channel.invokeMethod<String>('stopAudioRecording');
    }
    return null;
  }

  static Future<void> cancelAudioRecording() async {
    if (Platform.isAndroid || Platform.isWindows) {
      await _channel.invokeMethod<void>('cancelAudioRecording');
    }
  }

  static Future<String?> captureCircleVideo() async {
    if (Platform.isAndroid || Platform.isWindows) {
      return _channel.invokeMethod<String>('captureCircleVideo');
    }
    return null;
  }

  static Future<bool> showNotification({
    required String title,
    required String body,
  }) async {
    if (!Platform.isAndroid) return false;
    return await _channel.invokeMethod<bool>('showNotification', {
          'title': title,
          'body': body,
        }) ??
        false;
  }
}

class NativeStore {
  NativeStore._({required this._file, Map<String, Object?> initial = const {}})
    : _values = Map<String, Object?>.from(initial);

  final File? _file;
  final Map<String, Object?> _values;

  static const MethodChannel _channel = MethodChannel('webcord/native');

  static Future<NativeStore> create() async {
    if (_isFlutterTest) {
      return NativeStore._(file: null);
    }

    if (Platform.isAndroid) {
      return NativeStore._(file: null);
    }

    final file = await _storeFile();
    final initial = await _readFile(file);
    return NativeStore._(file: file, initial: initial);
  }

  static bool get _isFlutterTest =>
      Platform.resolvedExecutable.toLowerCase().contains('flutter_tester') ||
      Platform.environment['FLUTTER_TEST'] == 'true';

  Future<String?> getString(String key) async {
    if (Platform.isAndroid) {
      return _channel.invokeMethod<String>('getString', {'key': key});
    }
    final value = _values[key];
    return value is String ? value : null;
  }

  Future<int?> getInt(String key) async {
    if (Platform.isAndroid) {
      return _channel.invokeMethod<int>('getInt', {'key': key});
    }
    final value = _values[key];
    if (value is int) return value;
    if (value is num) return value.toInt();
    return null;
  }

  Future<void> setString(String key, String value) async {
    if (Platform.isAndroid) {
      await _channel.invokeMethod<void>('setString', {
        'key': key,
        'value': value,
      });
      return;
    }
    _values[key] = value;
    await _flush();
  }

  Future<void> setInt(String key, int value) async {
    if (Platform.isAndroid) {
      await _channel.invokeMethod<void>('setInt', {'key': key, 'value': value});
      return;
    }
    _values[key] = value;
    await _flush();
  }

  Future<void> remove(String key) async {
    if (Platform.isAndroid) {
      await _channel.invokeMethod<void>('remove', {'key': key});
      return;
    }
    _values.remove(key);
    await _flush();
  }

  Future<void> _flush() async {
    final file = _file;
    if (file == null) return;
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode(_values));
  }

  static Future<File> _storeFile() async {
    final base = Platform.environment['APPDATA'];
    final directory = base == null || base.isEmpty
        ? Directory.current
        : Directory('$base\\WebCord');
    return File('${directory.path}\\native_state.json');
  }

  static Future<Map<String, Object?>> _readFile(File file) async {
    try {
      if (!await file.exists()) return {};
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, Object?>.from(decoded);
    } catch (_) {
      return {};
    }
    return {};
  }
}
