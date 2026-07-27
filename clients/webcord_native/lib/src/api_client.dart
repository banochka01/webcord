// ignore_for_file: use_null_aware_elements

import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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

  Future<Map<String, dynamic>> clientState(String token) async {
    final json = await _send('GET', '/me/client-state', token: token);
    if (json is! Map) return <String, dynamic>{};
    final payload = Map<String, dynamic>.from(json);
    final state = payload['state'];
    return state is Map
        ? Map<String, dynamic>.from(state)
        : <String, dynamic>{};
  }

  Future<void> saveClientState(String token, Map<String, dynamic> state) async {
    await _send(
      'PUT',
      '/me/client-state',
      token: token,
      body: {'state': state},
    );
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
    String? favoriteTrackUrl,
    String? favoriteTrackName,
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
        'favoriteTrackUrl': favoriteTrackUrl,
        'favoriteTrackName': favoriteTrackName,
        'accentColor': accentColor,
        'avatarUrl': avatarUrl,
        'bannerUrl': bannerUrl,
      },
    );
    return PublicUser.fromJson(json as Map<String, dynamic>?);
  }

  Future<List<ChatMessage>> channelMessages(
    String token,
    int channelId, {
    int? beforeId,
    int limit = 100,
    String? search,
    bool pinned = false,
  }) async {
    final data = await _send(
      'GET',
      _messagesPath(
        '/messages/$channelId',
        beforeId: beforeId,
        limit: limit,
        search: search,
        pinned: pinned,
      ),
      token: token,
    );
    return _messageList(data);
  }

  Future<List<ChatMessage>> directMessages(
    String token,
    int conversationId, {
    int? beforeId,
    int limit = 100,
    String? search,
    bool pinned = false,
  }) async {
    final data = await _send(
      'GET',
      _messagesPath(
        '/dms/$conversationId/messages',
        beforeId: beforeId,
        limit: limit,
        search: search,
        pinned: pinned,
      ),
      token: token,
    );
    return _messageList(data);
  }

  Future<List<ChatMessage>> channelMessageContext(
    String token,
    int channelId,
    int messageId,
  ) async {
    final data = await _send(
      'GET',
      '/messages/$channelId/context/$messageId',
      token: token,
    );
    return _messageList(data is Map ? data['messages'] : null);
  }

  Future<List<ChatMessage>> directMessageContext(
    String token,
    int conversationId,
    int messageId,
  ) async {
    final data = await _send(
      'GET',
      '/dms/$conversationId/messages/$messageId/context',
      token: token,
    );
    return _messageList(data is Map ? data['messages'] : null);
  }

  Future<ChatMessage> sendChannelMessage({
    required String token,
    required int channelId,
    required String content,
    AttachmentUpload? attachment,
    int? replyToId,
    String? transcript,
    String? forwardedFromName,
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
        if (transcript != null && transcript.isNotEmpty)
          'transcript': transcript,
        if (forwardedFromName != null && forwardedFromName.isNotEmpty)
          'forwardedFromName': forwardedFromName,
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
    String? transcript,
    String? forwardedFromName,
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
        if (transcript != null && transcript.isNotEmpty)
          'transcript': transcript,
        if (forwardedFromName != null && forwardedFromName.isNotEmpty)
          'forwardedFromName': forwardedFromName,
        if (replyToId != null) 'replyToId': replyToId,
      },
    );
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> toggleChannelMessagePin({
    required String token,
    required int messageId,
  }) async {
    final json = await _send('PUT', '/messages/$messageId/pin', token: token);
    return ChatMessage.fromJson(json);
  }

  Future<ChatMessage> toggleDirectMessagePin({
    required String token,
    required int conversationId,
    required int messageId,
  }) async {
    final json = await _send(
      'PUT',
      '/dms/$conversationId/messages/$messageId/pin',
      token: token,
    );
    return ChatMessage.fromJson(json);
  }

  Future<bool> toggleChannelMessageBookmark({
    required String token,
    required int messageId,
  }) async {
    final json = await _send(
      'PUT',
      '/messages/$messageId/bookmark',
      token: token,
    );
    return json is Map && json['bookmarked'] == true;
  }

  Future<bool> toggleDirectMessageBookmark({
    required String token,
    required int conversationId,
    required int messageId,
  }) async {
    final json = await _send(
      'PUT',
      '/dms/$conversationId/messages/$messageId/bookmark',
      token: token,
    );
    return json is Map && json['bookmarked'] == true;
  }

  Future<List<SavedMessage>> savedMessages(String token) async {
    final data = await _send('GET', '/me/bookmarks', token: token);
    final rows = data is Map ? data['bookmarks'] : null;
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map((item) => SavedMessage.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<MessageEditVersion>> channelMessageHistory({
    required String token,
    required int messageId,
  }) async {
    final data = await _send(
      'GET',
      '/messages/$messageId/history',
      token: token,
    );
    return _editHistory(data);
  }

  Future<List<MessageEditVersion>> directMessageHistory({
    required String token,
    required int conversationId,
    required int messageId,
  }) async {
    final data = await _send(
      'GET',
      '/dms/$conversationId/messages/$messageId/history',
      token: token,
    );
    return _editHistory(data);
  }

  Future<MediaPage> sharedMedia({
    required String token,
    int? channelId,
    int? conversationId,
    int? cursor,
    int limit = 48,
  }) async {
    final params = <String, String>{
      if (channelId != null) 'channelId': '$channelId',
      if (conversationId != null) 'conversationId': '$conversationId',
      if (cursor != null) 'cursor': '$cursor',
      'types': 'IMAGE,VIDEO,CIRCLE_VIDEO',
      'limit': '$limit',
    };
    final data = await _send(
      'GET',
      '/media?${Uri(queryParameters: params).query}',
      token: token,
    );
    return MediaPage.fromJson(
      Map<String, dynamic>.from(data as Map? ?? const {}),
    );
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

  Future<List<MessageReaction>> toggleChannelMessageReaction({
    required String token,
    required int messageId,
    required String emoji,
  }) async {
    final json = await _send(
      'PUT',
      '/messages/$messageId/reactions',
      token: token,
      body: {'emoji': emoji},
    );
    return _reactionList(json);
  }

  Future<List<MessageReaction>> toggleDirectMessageReaction({
    required String token,
    required int conversationId,
    required int messageId,
    required String emoji,
  }) async {
    final json = await _send(
      'PUT',
      '/dms/$conversationId/messages/$messageId/reactions',
      token: token,
      body: {'emoji': emoji},
    );
    return _reactionList(json);
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

  Future<void> blockUser({required String token, required int userId}) async {
    await _send('POST', '/users/$userId/block', token: token);
  }

  Future<void> unblockUser({required String token, required int userId}) async {
    await _send('DELETE', '/users/$userId/block', token: token);
  }

  Future<void> createReport({
    required String token,
    required String targetType,
    String reason = 'Other',
    String details = '',
    int? targetUserId,
    int? messageId,
    int? directMessageId,
  }) async {
    await _send(
      'POST',
      '/moderation/reports',
      token: token,
      body: {
        'targetType': targetType,
        'reason': reason,
        'details': details,
        if (targetUserId != null) 'targetUserId': targetUserId,
        if (messageId != null) 'messageId': messageId,
        if (directMessageId != null) 'directMessageId': directMessageId,
      },
    );
  }

  Future<DirectConversation> createGroupConversation({
    required String token,
    required String title,
    required List<int> userIds,
    String? avatarUrl,
  }) async {
    final json = await _send(
      'POST',
      '/groups',
      token: token,
      body: {
        'title': title,
        'userIds': userIds,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
      },
    );
    return DirectConversation.fromJson(json);
  }

  Future<CallSession> startCall({
    required String token,
    required int conversationId,
    bool video = false,
  }) async {
    final json = await _send(
      'POST',
      '/dms/$conversationId/calls',
      token: token,
      body: {'video': video},
    );
    return CallSession.fromJson(json);
  }

  Future<CallSession> respondCall({
    required String token,
    required String callId,
    required bool accept,
  }) async {
    final json = await _send(
      'POST',
      '/calls/$callId/respond',
      token: token,
      body: {'action': accept ? 'ACCEPT' : 'DECLINE'},
    );
    if (json is Map<String, dynamic>) return CallSession.fromJson(json);
    return CallSession(
      id: callId,
      conversationId: 0,
      title: 'Call',
      callerId: 0,
    );
  }

  Future<void> endCall({required String token, required String callId}) async {
    await _send('POST', '/calls/$callId/end', token: token);
  }

  Future<List<CallRecord>> callHistory(String token) async {
    final data = await _send('GET', '/calls?limit=100', token: token);
    final rows = data is Map ? data['calls'] : null;
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map((item) => CallRecord.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<StoryItem>> stories(String token) async {
    final data = await _send('GET', '/stories', token: token);
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((item) => StoryItem.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<StoryItem> createStory({
    required String token,
    required String mediaUrl,
    required String mediaType,
    String caption = '',
    String? musicUrl,
    String musicTitle = '',
    String musicArtist = '',
    String musicAttachment = '',
  }) async {
    final json = await _send(
      'POST',
      '/stories',
      token: token,
      body: {
        'mediaUrl': mediaUrl,
        'mediaType': mediaType,
        'caption': caption,
        if (musicUrl != null && musicUrl.trim().isNotEmpty)
          'musicUrl': musicUrl.trim(),
        if (musicTitle.trim().isNotEmpty) 'musicTitle': musicTitle.trim(),
        if (musicArtist.trim().isNotEmpty) 'musicArtist': musicArtist.trim(),
        if (musicAttachment.trim().isNotEmpty)
          'musicAttachment': musicAttachment.trim(),
      },
    );
    return StoryItem.fromJson(json);
  }

  Future<void> markStoryViewed({
    required String token,
    required int storyId,
  }) async {
    await _send('POST', '/stories/$storyId/view', token: token);
  }

  Future<AttachmentUpload> upload(String token, File file) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/upload'));
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(
      await http.MultipartFile.fromPath(
        'file',
        file.path,
        contentType: _contentTypeForPath(file.path),
      ),
    );

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

  String _messagesPath(
    String path, {
    int? beforeId,
    int limit = 100,
    String? search,
    bool pinned = false,
  }) {
    final params = <String, String>{'limit': '$limit'};
    if (beforeId != null && beforeId > 0) params['beforeId'] = '$beforeId';
    if (search != null && search.trim().isNotEmpty) {
      params['search'] = search.trim();
    }
    if (pinned) params['pinned'] = 'true';
    return '$path?${Uri(queryParameters: params).query}';
  }

  MediaType? _contentTypeForPath(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return MediaType('image', 'jpeg');
    }
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.webp')) return MediaType('image', 'webp');
    if (lower.endsWith('.gif')) return MediaType('image', 'gif');
    if (lower.endsWith('.bmp')) return MediaType('image', 'bmp');
    if (lower.endsWith('.heic')) return MediaType('image', 'heic');
    if (lower.endsWith('.heif')) return MediaType('image', 'heif');

    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) {
      return MediaType('video', 'mp4');
    }
    if (lower.endsWith('.mov')) return MediaType('video', 'quicktime');
    if (lower.endsWith('.webm')) return MediaType('video', 'webm');
    if (lower.endsWith('.3gp')) return MediaType('video', '3gpp');
    if (lower.endsWith('.mkv')) return MediaType('video', 'x-matroska');
    if (lower.endsWith('.avi')) return MediaType('video', 'x-msvideo');

    if (lower.endsWith('.mp3')) return MediaType('audio', 'mpeg');
    if (lower.endsWith('.m4a')) return MediaType('audio', 'mp4');
    if (lower.endsWith('.aac')) return MediaType('audio', 'aac');
    if (lower.endsWith('.ogg') || lower.endsWith('.oga')) {
      return MediaType('audio', 'ogg');
    }
    if (lower.endsWith('.opus')) return MediaType('audio', 'opus');
    if (lower.endsWith('.wav')) return MediaType('audio', 'wav');
    if (lower.endsWith('.flac')) return MediaType('audio', 'flac');
    return null;
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
      'PUT' => await http.put(uri, headers: headers, body: encodedBody),
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

  List<MessageReaction> _reactionList(dynamic data) {
    if (data is! Map || data['reactions'] is! List) return const [];
    return (data['reactions'] as List)
        .whereType<Map>()
        .map(
          (item) => MessageReaction.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList();
  }

  List<MessageEditVersion> _editHistory(dynamic data) {
    final rows = data is Map ? data['history'] : null;
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map(
          (item) =>
              MessageEditVersion.fromJson(Map<String, dynamic>.from(item)),
        )
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
