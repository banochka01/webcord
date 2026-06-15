// ignore_for_file: use_null_aware_elements

import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class WebCordApi {
  WebCordApi({
    String baseUrl = const String.fromEnvironment(
      'WEBCORD_API_URL',
      defaultValue: 'https://webcordes.ru/api',
    ),
  }) : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), '');

  final String baseUrl;

  Uri get baseUri => Uri.parse(baseUrl);

  String get origin {
    final uri = baseUri;
    return '${uri.scheme}://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}';
  }

  Uri attachmentUri(String value) {
    if (value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('data:') ||
        value.startsWith('blob:')) {
      return Uri.parse(value);
    }
    return Uri.parse('$origin$value');
  }

  Future<AuthSession> login(String username, String password) async {
    final json = await _send(
      'POST',
      '/auth/login',
      body: {'username': username, 'password': password},
    );
    return AuthSession.fromJson(json);
  }

  Future<AuthSession> register(String username, String password) async {
    final json = await _send(
      'POST',
      '/auth/register',
      body: {'username': username, 'password': password},
    );
    return AuthSession.fromJson(json);
  }

  Future<BootstrapData> bootstrap(String token) async {
    final json = await _send('GET', '/bootstrap', token: token);
    return BootstrapData.fromJson(json);
  }

  Future<SocialSnapshot> social(String token) async {
    final json = await _send('GET', '/social', token: token);
    return SocialSnapshot.fromJson(json);
  }

  Future<List<Map<String, dynamic>>> voiceIceServers(String token) async {
    final json = await _send('GET', '/voice/ice-servers', token: token);
    final servers = json is Map<String, dynamic> ? json['iceServers'] : null;
    if (servers is! List) return _defaultIceServers();
    final parsed = servers
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where((item) => item['urls'] != null)
        .toList();
    return parsed.isEmpty ? _defaultIceServers() : parsed;
  }

  Future<PublicUser> updateProfile({
    required String token,
    required String bio,
    required String statusText,
    required String favoriteTrack,
    required String accentColor,
    String? displayName,
    String? avatarUrl,
    String? bannerUrl,
  }) async {
    final json = await _send(
      'PATCH',
      '/me/profile',
      token: token,
      body: {
        'displayName': displayName ?? '',
        'bio': bio,
        'statusText': statusText,
        'favoriteTrack': favoriteTrack,
        'accentColor': accentColor,
        'avatarUrl': avatarUrl,
        'bannerUrl': bannerUrl,
      },
    );
    return PublicUser.fromJson(json as Map<String, dynamic>?);
  }

  Future<List<ChatMessage>> channelMessages(String token, int channelId) async {
    final data = await _send('GET', '/messages/$channelId', token: token);
    return _messageList(data);
  }

  Future<List<ChatMessage>> directMessages(
    String token,
    int conversationId,
  ) async {
    final data = await _send(
      'GET',
      '/dms/$conversationId/messages',
      token: token,
    );
    return _messageList(data);
  }

  Future<ChatMessage> sendChannelMessage({
    required String token,
    required int channelId,
    required String content,
    AttachmentUpload? attachment,
    int? replyToId,
  }) async {
    final json = await _send(
      'POST',
      '/messages',
      token: token,
      body: {
        'channelId': channelId,
        'content': content,
        if (attachment != null) 'attachmentUrl': attachment.url,
        if (attachment != null) 'attachmentType': attachment.type,
        if (attachment != null) 'attachmentName': attachment.name,
        if (replyToId != null) 'replyToId': replyToId,
      },
    );
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> sendDirectMessage({
    required String token,
    required int conversationId,
    required String content,
    AttachmentUpload? attachment,
    int? replyToId,
  }) async {
    final json = await _send(
      'POST',
      '/dms/$conversationId/messages',
      token: token,
      body: {
        'content': content,
        if (attachment != null) 'attachmentUrl': attachment.url,
        if (attachment != null) 'attachmentType': attachment.type,
        if (attachment != null) 'attachmentName': attachment.name,
        if (replyToId != null) 'replyToId': replyToId,
      },
    );
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> editChannelMessage({
    required String token,
    required int messageId,
    required String content,
  }) async {
    final json = await _send(
      'PATCH',
      '/messages/$messageId',
      token: token,
      body: {'content': content},
    );
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> editDirectMessage({
    required String token,
    required int conversationId,
    required int messageId,
    required String content,
  }) async {
    final json = await _send(
      'PATCH',
      '/dms/$conversationId/messages/$messageId',
      token: token,
      body: {'content': content},
    );
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> deleteChannelMessage({
    required String token,
    required int messageId,
  }) async {
    final json = await _send('DELETE', '/messages/$messageId', token: token);
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> deleteDirectMessage({
    required String token,
    required int conversationId,
    required int messageId,
  }) async {
    final json = await _send(
      'DELETE',
      '/dms/$conversationId/messages/$messageId',
      token: token,
    );
    return ChatMessage.fromJson(json);
  }

  Future<Channel> createChannel({
    required String token,
    required int guildId,
    required String name,
    required ChannelKind kind,
  }) async {
    final json = await _send(
      'POST',
      '/channels',
      token: token,
      body: {
        'guildId': guildId,
        'name': name,
        'type': kind == ChannelKind.voice ? 'VOICE' : 'TEXT',
      },
    );
    return Channel.fromJson(json);
  }

  Future<void> sendFriendRequest(String token, String username) async {
    await _send(
      'POST',
      '/friends/request',
      token: token,
      body: {'username': username},
    );
  }

  Future<void> respondFriendRequest({
    required String token,
    required int requestId,
    required bool accept,
  }) async {
    await _send(
      'POST',
      '/friends/respond',
      token: token,
      body: {'requestId': requestId, 'action': accept ? 'ACCEPT' : 'DECLINE'},
    );
  }

  Future<DirectConversation> openDirectConversation({
    required String token,
    required int userId,
  }) async {
    final json = await _send(
      'POST',
      '/dms/open',
      token: token,
      body: {'userId': userId},
    );
    return DirectConversation.fromJson(json);
  }

  Future<AttachmentUpload> upload(String token, File file) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/upload'));
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(await http.MultipartFile.fromPath('file', file.path));

    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    final payload = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        _extractError(payload) ?? 'Upload failed',
        statusCode: response.statusCode,
      );
    }
    return AttachmentUpload.fromJson(payload as Map<String, dynamic>);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    String? token,
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final encodedBody = body == null ? null : jsonEncode(body);

    final response = switch (method) {
      'GET' => await http.get(uri, headers: headers),
      'POST' => await http.post(uri, headers: headers, body: encodedBody),
      'PATCH' => await http.patch(uri, headers: headers, body: encodedBody),
      'DELETE' => await http.delete(uri, headers: headers),
      _ => throw ArgumentError('Unsupported method: $method'),
    };

    final payload = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        _extractError(payload) ?? 'Request failed',
        statusCode: response.statusCode,
      );
    }
    return payload;
  }

  List<ChatMessage> _messageList(dynamic data) {
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((item) => ChatMessage.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  String? _extractError(dynamic payload) {
    if (payload is Map<String, dynamic>) {
      return '${payload['error'] ?? payload['message'] ?? ''}'.trim();
    }
    return null;
  }
}

List<Map<String, dynamic>> _defaultIceServers() {
  return const [
    {'urls': 'stun:stun.l.google.com:19302'},
  ];
}
