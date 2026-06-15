enum ChannelKind { text, voice }

enum WorkspaceKind { server, friends, direct }

class PublicUser {
  const PublicUser({
    required this.id,
    required this.username,
    this.displayName,
    this.avatarUrl,
    this.bannerUrl,
    this.bio = '',
    this.statusText = 'Online',
    this.favoriteTrack = '',
    this.accentColor = '#7c5cff',
  });

  final int id;
  final String username;
  final String? displayName;
  final String? avatarUrl;
  final String? bannerUrl;
  final String bio;
  final String statusText;
  final String favoriteTrack;
  final String accentColor;

  String get displayLabel {
    final value = displayName?.trim();
    return value == null || value.isEmpty ? username : value;
  }

  factory PublicUser.fromJson(Map<String, dynamic>? json) {
    final data = json ?? const <String, dynamic>{};
    return PublicUser(
      id: _asInt(data['id']),
      username: '${data['username'] ?? 'unknown'}',
      displayName: _asNullableString(data['displayName']),
      avatarUrl: _asNullableString(data['avatarUrl']),
      bannerUrl: _asNullableString(data['bannerUrl']),
      bio: '${data['bio'] ?? ''}',
      statusText: '${data['statusText'] ?? 'Online'}',
      favoriteTrack: '${data['favoriteTrack'] ?? ''}',
      accentColor: '${data['accentColor'] ?? '#7c5cff'}',
    );
  }
}

class AuthSession {
  const AuthSession({required this.token, required this.user});

  final String token;
  final PublicUser user;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      token: '${json['token'] ?? ''}',
      user: PublicUser.fromJson(json['user'] as Map<String, dynamic>?),
    );
  }
}

class Guild {
  const Guild({required this.id, required this.name});

  final int id;
  final String name;

  factory Guild.fromJson(Map<String, dynamic> json) {
    return Guild(id: _asInt(json['id']), name: '${json['name'] ?? 'WebCord'}');
  }
}

class Channel {
  const Channel({
    required this.id,
    required this.name,
    required this.kind,
    required this.guildId,
  });

  final int id;
  final String name;
  final ChannelKind kind;
  final int guildId;

  factory Channel.fromJson(Map<String, dynamic> json) {
    final rawType = '${json['type'] ?? 'TEXT'}'.toUpperCase();
    return Channel(
      id: _asInt(json['id']),
      name: '${json['name'] ?? 'channel'}',
      kind: rawType == 'VOICE' ? ChannelKind.voice : ChannelKind.text,
      guildId: _asInt(json['guildId']),
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.content,
    required this.author,
    required this.createdAt,
    this.channelId,
    this.conversationId,
    this.attachmentUrl,
    this.attachmentType,
    this.attachmentName,
    this.replyTo,
    this.editedAt,
    this.deletedAt,
    this.readAt,
  });

  final int id;
  final String content;
  final int? channelId;
  final int? conversationId;
  final String? attachmentUrl;
  final String? attachmentType;
  final String? attachmentName;
  final PublicUser author;
  final ChatMessage? replyTo;
  final DateTime createdAt;
  final DateTime? editedAt;
  final DateTime? deletedAt;
  final DateTime? readAt;

  bool get isDeleted => deletedAt != null;
  bool get hasAttachment => attachmentUrl != null && attachmentUrl!.isNotEmpty;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: _asInt(json['id']),
      content: '${json['content'] ?? ''}',
      channelId: _asNullableInt(json['channelId']),
      conversationId: _asNullableInt(json['conversationId']),
      attachmentUrl: _asNullableString(json['attachmentUrl']),
      attachmentType: _asNullableString(json['attachmentType']),
      attachmentName: _asNullableString(json['attachmentName']),
      author: PublicUser.fromJson(json['author'] as Map<String, dynamic>?),
      replyTo: json['replyTo'] is Map<String, dynamic>
          ? ChatMessage.fromJson(json['replyTo'] as Map<String, dynamic>)
          : null,
      createdAt: _asDate(json['createdAt']),
      editedAt: _asNullableDate(json['editedAt']),
      deletedAt: _asNullableDate(json['deletedAt']),
      readAt: _asNullableDate(json['readAt']),
    );
  }
}

class FriendRequest {
  const FriendRequest({
    required this.id,
    required this.status,
    required this.direction,
    required this.user,
  });

  final int id;
  final String status;
  final String direction;
  final PublicUser user;

  bool get isIncoming => direction == 'INCOMING';
  bool get isPending => status == 'PENDING';

  factory FriendRequest.fromJson(Map<String, dynamic> json) {
    return FriendRequest(
      id: _asInt(json['id']),
      status: '${json['status'] ?? ''}',
      direction: '${json['direction'] ?? ''}',
      user: PublicUser.fromJson(json['user'] as Map<String, dynamic>?),
    );
  }
}

class Friendship {
  const Friendship({required this.id, required this.user});

  final int id;
  final PublicUser user;

  factory Friendship.fromJson(Map<String, dynamic> json) {
    return Friendship(
      id: _asInt(json['id']),
      user: PublicUser.fromJson(json['user'] as Map<String, dynamic>?),
    );
  }
}

class DirectConversation {
  const DirectConversation({
    required this.id,
    required this.user,
    this.lastMessage,
  });

  final int id;
  final PublicUser user;
  final ChatMessage? lastMessage;

  factory DirectConversation.fromJson(Map<String, dynamic> json) {
    return DirectConversation(
      id: _asInt(json['id']),
      user: PublicUser.fromJson(json['user'] as Map<String, dynamic>?),
      lastMessage: json['lastMessage'] is Map<String, dynamic>
          ? ChatMessage.fromJson(json['lastMessage'] as Map<String, dynamic>)
          : null,
    );
  }
}

class SocialSnapshot {
  const SocialSnapshot({
    this.friends = const [],
    this.requests = const [],
    this.conversations = const [],
  });

  final List<Friendship> friends;
  final List<FriendRequest> requests;
  final List<DirectConversation> conversations;

  factory SocialSnapshot.fromJson(Map<String, dynamic>? json) {
    final data = json ?? const <String, dynamic>{};
    return SocialSnapshot(
      friends: _asList(data['friends']).map(Friendship.fromJson).toList(),
      requests: _asList(data['requests']).map(FriendRequest.fromJson).toList(),
      conversations: _asList(
        data['conversations'],
      ).map(DirectConversation.fromJson).toList(),
    );
  }
}

class BootstrapData {
  const BootstrapData({
    required this.guild,
    required this.channels,
    required this.social,
    required this.currentUser,
    required this.defaultTextChannelId,
    required this.defaultVoiceChannelId,
  });

  final Guild guild;
  final List<Channel> channels;
  final SocialSnapshot social;
  final PublicUser currentUser;
  final int defaultTextChannelId;
  final int defaultVoiceChannelId;

  factory BootstrapData.fromJson(Map<String, dynamic> json) {
    final defaults = json['defaults'] is Map<String, dynamic>
        ? json['defaults'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return BootstrapData(
      guild: Guild.fromJson(json['guild'] as Map<String, dynamic>),
      channels: _asList(json['channels']).map(Channel.fromJson).toList(),
      social: SocialSnapshot.fromJson(json['social'] as Map<String, dynamic>?),
      currentUser: PublicUser.fromJson(
        json['currentUser'] as Map<String, dynamic>?,
      ),
      defaultTextChannelId: _asInt(defaults['textChannelId']),
      defaultVoiceChannelId: _asInt(defaults['voiceChannelId']),
    );
  }
}

class AttachmentUpload {
  const AttachmentUpload({
    required this.url,
    required this.type,
    required this.name,
  });

  final String url;
  final String type;
  final String name;

  factory AttachmentUpload.fromJson(Map<String, dynamic> json) {
    return AttachmentUpload(
      url: '${json['url'] ?? ''}',
      type: '${json['type'] ?? 'FILE'}',
      name: '${json['name'] ?? 'file'}',
    );
  }
}

class VoiceParticipant {
  const VoiceParticipant({
    required this.socketId,
    required this.userId,
    required this.username,
    this.muted = false,
    this.camera = false,
    this.screen = false,
    this.speaking = false,
  });

  final String socketId;
  final int userId;
  final String username;
  final bool muted;
  final bool camera;
  final bool screen;
  final bool speaking;

  factory VoiceParticipant.fromJson(Map<String, dynamic> json) {
    return VoiceParticipant(
      socketId: '${json['socketId'] ?? ''}',
      userId: _asInt(json['userId']),
      username: '${json['username'] ?? 'Participant'}',
      muted: _asBool(json['muted']),
      camera: _asBool(json['camera']),
      screen: _asBool(json['screen']),
      speaking: _asBool(json['speaking']),
    );
  }
}

List<Map<String, dynamic>> _asList(dynamic value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}

int _asInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value') ?? 0;
}

int? _asNullableInt(dynamic value) {
  if (value == null) return null;
  final parsed = _asInt(value);
  return parsed == 0 ? null : parsed;
}

String? _asNullableString(dynamic value) {
  if (value == null) return null;
  final text = '$value';
  return text.isEmpty ? null : text;
}

bool _asBool(dynamic value) {
  return value == true || value == 1 || value == '1' || value == 'true';
}

DateTime _asDate(dynamic value) {
  return DateTime.tryParse('${value ?? ''}')?.toLocal() ?? DateTime.now();
}

DateTime? _asNullableDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse('$value')?.toLocal();
}
