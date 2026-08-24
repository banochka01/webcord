import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'api_client.dart';
import 'client_platform.dart';
import 'native_bridge.dart';

@pragma('vm:entry-point')
Future<void> webCordFirebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushService {
  PushService._();

  static final instance = PushService._();

  bool _available = false;
  String? _registeredToken;
  StreamSubscription<String>? _refreshSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _openSubscription;
  void Function(Map<String, dynamic> data)? _onOpen;
  Map<String, dynamic>? _pendingOpen;

  bool get available => _available;

  Future<void> initialize() async {
    if (!supportsWebCordPush) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(webCordFirebaseBackgroundHandler);
      _available = true;
      _messageSubscription = FirebaseMessaging.onMessage.listen((message) {
        final notification = message.notification;
        if (notification == null) return;
        NativeBridge.showNotification(
          title: notification.title ?? 'WebCord',
          body: notification.body ?? '',
        );
      });
      _openSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
        (message) => _dispatchOpen(message.data),
      );
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _pendingOpen = initial.data;
    } catch (_) {
      _available = false;
    }
  }

  Future<void> configureSession({
    required WebCordApi api,
    required String authToken,
    required bool notificationsEnabled,
    required void Function(Map<String, dynamic> data) onOpen,
  }) async {
    _onOpen = onOpen;
    if (!_available || !notificationsEnabled) return;
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null && token.isNotEmpty) {
      await api.saveDevicePushToken(authToken: authToken, token: token);
      _registeredToken = token;
    }
    await _refreshSubscription?.cancel();
    _refreshSubscription = FirebaseMessaging.instance.onTokenRefresh.listen((
      token,
    ) async {
      try {
        await api.saveDevicePushToken(authToken: authToken, token: token);
        _registeredToken = token;
      } catch (_) {}
    });
    final pending = _pendingOpen;
    _pendingOpen = null;
    if (pending != null) _dispatchOpen(pending);
  }

  Future<void> clearSession({
    required WebCordApi api,
    required String authToken,
  }) async {
    await _refreshSubscription?.cancel();
    _refreshSubscription = null;
    final token = _registeredToken;
    _registeredToken = null;
    _onOpen = null;
    if (!_available || token == null) return;
    try {
      await api.removeDevicePushToken(authToken: authToken, token: token);
    } catch (_) {}
  }

  void _dispatchOpen(Map<String, dynamic> data) {
    final callback = _onOpen;
    if (callback == null) {
      _pendingOpen = data;
      return;
    }
    callback(Map<String, dynamic>.from(data));
  }

  Future<void> dispose() async {
    await _refreshSubscription?.cancel();
    await _messageSubscription?.cancel();
    await _openSubscription?.cancel();
  }
}
