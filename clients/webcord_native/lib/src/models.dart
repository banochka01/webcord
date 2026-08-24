enum ChannelKind { text, voice }

enum WorkspaceKind {
  server,
  friends,
  direct,
  spaces,
  activity,
  calls,
  stories,
  profile,
}

enum ConversationKind { direct, group }

enum StoryKind { image, video }

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
    this.favoriteTrackUrl,
    this.favoriteTrackName,
    this.accentColor = '#7c5cff',
    this.role = 'USER',
    this.isAdmin = false,
    this.canManageRoles = false,
    this.mutedUntil,
    this.bannedUntil,
    this.isMuted = false,
    this.isBanned = false,
  });

  final int id;
  final String username;
  final String? displayName;
  final String? avatarUrl;
  final String? bannerUrl;
  final String bio;
  final String statusText;
  final String favoriteTrack;
  final String? favoriteTrackUrl;
  final String? favoriteTrackName;
  final String accentColor;
  final String role;
  final bool isAdmin;
  final bool canManageRoles;
  final DateTime? mutedUntil;
  final DateTime? bannedUntil;
  final bool isMuted;
  final bool isBanned;

  bool get canManageChannels =>
      isAdmin || role.toUpperCase() == 'ADMIN' || role.toUpperCase() == 'OWNER';

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
      favoriteTrackUrl: _asNullableString(data['favoriteTrackUrl']),
      favoriteTrackName: _asNullableString(data['favoriteTrackName']),
      accentColor: '${data['accentColor'] ?? '#7c5cff'}',
      role: '${data['role'] ?? 'USER'}',
      isAdmin: data['isAdmin'] == true,
      canManageRoles: data['canManageRoles'] == true,
      mutedUntil: _asNullableDate(data['mutedUntil']),
      bannedUntil: _asNullableDate(data['bannedUntil']),
      isMuted: _asBool(data['isMuted']),
      isBanned: _asBool(data['isBanned']),
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

class ClientSession {
  const ClientSession({
    required this.id,
    required this.deviceName,
    required this.platform,
    required this.lastSeenAt,
    this.ipAddress,
    this.current = false,
  });

  final String id;
  final String deviceName;
  final String platform;
  final DateTime lastSeenAt;
  final String? ipAddress;
  final bool current;

  factory ClientSession.fromJson(Map<String, dynamic> json) => ClientSession(
    id: '${json['id'] ?? ''}',
    deviceName: '${json['deviceName'] ?? 'WebCord client'}',
    platform: '${json['platform'] ?? 'UNKNOWN'}',
    lastSeenAt:
        DateTime.tryParse('${json['lastSeenAt'] ?? ''}') ?? DateTime.now(),
    ipAddress: _asNullableString(json['ipAddress']),
    current: json['current'] == true,
  );
}

class ClientRelease {
  const ClientRelease({
    required this.version,
    required this.updateAvailable,
    required this.required,
    required this.downloadUrl,
  });

  final String version;
  final bool updateAvailable;
  final bool required;
  final String downloadUrl;

  factory ClientRelease.fromJson(Map<String, dynamic> json) {
    final download = json['download'] is Map
        ? Map<String, dynamic>.from(json['download'] as Map)
        : const <String, dynamic>{};
    return ClientRelease(
      version: '${json['version'] ?? ''}',
      updateAvailable: json['updateAvailable'] == true,
      required: json['required'] == true,
      downloadUrl: '${download['url'] ?? ''}',
    );
  }
}

class Guild {
  const Guild({
    required this.id,
    required this.name,
    this.description = '',
    this.iconUrl,
    this.bannerUrl,
    this.accentColor = '#7c5cff',
  });

  final int id;
  final String name;
  final String description;
  final String? iconUrl;
  final String? bannerUrl;
  final String accentColor;

  factory Guild.fromJson(Map<String, dynamic> json) {
    return Guild(
      id: _asInt(json['id']),
      name: '${json['name'] ?? 'WebCord'}',
      description: '${json['description'] ?? ''}',
      iconUrl: _asNullableString(json['iconUrl']),
      bannerUrl: _asNullableString(json['bannerUrl']),
      accentColor: '${json['accentColor'] ?? '#7c5cff'}',
    );
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

class PollOptionItem {
  const PollOptionItem({
    required this.id,
    required this.label,
    required this.voteCount,
    required this.selected,
  });

  final int id;
  final String label;
  final int voteCount;
  final bool selected;

  factory PollOptionItem.fromJson(Map<String, dynamic> json) {
    final votes = _asList(json['votes']);
    return PollOptionItem(
      id: _asInt(json['id']),
      label: '${json['label'] ?? 'Option'}',
      voteCount: json['voteCount'] == null
          ? votes.length
          : _asInt(json['voteCount']),
      selected:
          json['selected'] == true ||
          votes.any((vote) => vote['selected'] == true),
    );
  }
}

class MessagePoll {
  const MessagePoll({
    required this.id,
    required this.question,
    required this.allowsMultiple,
    required this.anonymous,
    required this.closed,
    required this.totalVoters,
    required this.options,
  });

  final int id;
  final String question;
  final bool allowsMultiple;
  final bool anonymous;
  final bool closed;
  final int totalVoters;
  final List<PollOptionItem> options;

  factory MessagePoll.fromJson(Map<String, dynamic> json) {
    final options = _asList(
      json['options'],
    ).map(PollOptionItem.fromJson).toList();
    return MessagePoll(
      id: _asInt(json['id']),
      question: '${json['question'] ?? 'Poll'}',
      allowsMultiple: _asBool(json['allowsMultiple']),
      anonymous: _asBool(json['anonymous']),
      closed: _asBool(json['closed']),
      totalVoters: json['totalVoters'] == null
          ? options.fold<int>(
              0,
              (maximum, option) =>
                  option.voteCount > maximum ? option.voteCount : maximum,
            )
          : _asInt(json['totalVoters']),
      options: options,
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
    this.transcript,
    this.forwardedFromName,
    this.pinnedAt,
    this.pinnedById,
    this.replyTo,
    this.editedAt,
    this.deletedAt,
    this.readAt,
    this.bookmarked = false,
    this.reactions = const [],
    this.poll,
    this.threadReplyCount = 0,
    this.silent = false,
  });

  final int id;
  final String content;
  final int? channelId;
  final int? conversationId;
  final String? attachmentUrl;
  final String? attachmentType;
  final String? attachmentName;
  final String? transcript;
  final String? forwardedFromName;
  final DateTime? pinnedAt;
  final int? pinnedById;
  final PublicUser author;
  final ChatMessage? replyTo;
  final DateTime createdAt;
  final DateTime? editedAt;
  final DateTime? deletedAt;
  final DateTime? readAt;
  final bool bookmarked;
  final List<MessageReaction> reactions;
  final MessagePoll? poll;
  final int threadReplyCount;
  final bool silent;

  bool get isDeleted => deletedAt != null;
  bool get hasAttachment => attachmentUrl != null && attachmentUrl!.isNotEmpty;

  ChatMessage copyWith({
    List<MessageReaction>? reactions,
    bool? bookmarked,
    MessagePoll? poll,
  }) {
    return ChatMessage(
      id: id,
      content: content,
      author: author,
      createdAt: createdAt,
      channelId: channelId,
      conversationId: conversationId,
      attachmentUrl: attachmentUrl,
      attachmentType: attachmentType,
      attachmentName: attachmentName,
      transcript: transcript,
      forwardedFromName: forwardedFromName,
      pinnedAt: pinnedAt,
      pinnedById: pinnedById,
      replyTo: replyTo,
      editedAt: editedAt,
      deletedAt: deletedAt,
      readAt: readAt,
      bookmarked: bookmarked ?? this.bookmarked,
      reactions: reactions ?? this.reactions,
      poll: poll ?? this.poll,
      threadReplyCount: threadReplyCount,
      silent: silent,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: _asInt(json['id']),
      content: '${json['content'] ?? ''}',
      channelId: _asNullableInt(json['channelId']),
      conversationId: _asNullableInt(json['conversationId']),
      attachmentUrl: _asNullableString(json['attachmentUrl']),
      attachmentType: _asNullableString(json['attachmentType']),
      attachmentName: _asNullableString(json['attachmentName']),
      transcript: _asNullableString(json['transcript']),
      forwardedFromName: _asNullableString(json['forwardedFromName']),
      pinnedAt: _asNullableDate(json['pinnedAt']),
      pinnedById: _asNullableInt(json['pinnedById']),
      author: PublicUser.fromJson(json['author'] as Map<String, dynamic>?),
      replyTo: json['replyTo'] is Map<String, dynamic>
          ? ChatMessage.fromJson(json['replyTo'] as Map<String, dynamic>)
          : null,
      createdAt: _asDate(json['createdAt']),
      editedAt: _asNullableDate(json['editedAt']),
      deletedAt: _asNullableDate(json['deletedAt']),
      readAt: _asNullableDate(json['readAt']),
      bookmarked: _asBool(json['bookmarked']),
      reactions: _asList(
        json['reactions'],
      ).map(MessageReaction.fromJson).toList(),
      poll: json['poll'] is Map
          ? MessagePoll.fromJson(Map<String, dynamic>.from(json['poll'] as Map))
          : null,
      threadReplyCount: _asInt(json['threadReplyCount']) != 0
          ? _asInt(json['threadReplyCount'])
          : _asInt((json['_count'] as Map?)?['replies']),
      silent: _asBool(json['silent']),
    );
  }
}

class ActivityItem {
  const ActivityItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.unread,
    this.actor,
    this.channelId,
    this.conversationId,
    this.messageId,
    this.directMessageId,
  });

  final int id;
  final String kind;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool unread;
  final PublicUser? actor;
  final int? channelId;
  final int? conversationId;
  final int? messageId;
  final int? directMessageId;

  factory ActivityItem.fromJson(Map<String, dynamic> json) {
    return ActivityItem(
      id: _asInt(json['id']),
      kind: '${json['kind'] ?? 'SYSTEM'}',
      title: '${json['title'] ?? 'Activity'}',
      body: '${json['body'] ?? ''}',
      createdAt: _asDate(json['createdAt']),
      unread: json['unread'] == true || json['readAt'] == null,
      actor: json['actor'] is Map
          ? PublicUser.fromJson(Map<String, dynamic>.from(json['actor'] as Map))
          : null,
      channelId: _asNullableInt(json['channelId']),
      conversationId: _asNullableInt(json['conversationId']),
      messageId: _asNullableInt(json['messageId']),
      directMessageId: _asNullableInt(json['directMessageId']),
    );
  }
}

class CommunityEventItem {
  const CommunityEventItem({
    required this.id,
    required this.title,
    required this.description,
    required this.location,
    required this.startsAt,
    required this.rsvp,
    required this.goingCount,
    required this.interestedCount,
  });

  final int id;
  final String title;
  final String description;
  final String location;
  final DateTime startsAt;
  final String? rsvp;
  final int goingCount;
  final int interestedCount;

  factory CommunityEventItem.fromJson(Map<String, dynamic> json) {
    final counts = Map<String, dynamic>.from(
      json['rsvpCounts'] as Map? ?? const {},
    );
    return CommunityEventItem(
      id: _asInt(json['id']),
      title: '${json['title'] ?? 'Community event'}',
      description: '${json['description'] ?? ''}',
      location: '${json['location'] ?? ''}',
      startsAt: _asDate(json['startsAt']),
      rsvp: _asNullableString(json['rsvp']),
      goingCount: _asInt(counts['GOING']),
      interestedCount: _asInt(counts['INTERESTED']),
    );
  }
}

class SpacePollSummary {
  const SpacePollSummary({
    required this.id,
    required this.question,
    required this.totalVoters,
    required this.optionCount,
  });

  final int id;
  final String question;
  final int totalVoters;
  final int optionCount;

  factory SpacePollSummary.fromJson(Map<String, dynamic> json) {
    return SpacePollSummary(
      id: _asInt(json['id']),
      question: '${json['question'] ?? 'Poll'}',
      totalVoters: _asInt(json['totalVoters']),
      optionCount: _asList(json['options']).length,
    );
  }
}

class SpacesOverview {
  const SpacesOverview({
    required this.guild,
    this.activityCount = 0,
    this.scheduledCount = 0,
    this.events = const [],
    this.polls = const [],
  });

  final Guild guild;
  final int activityCount;
  final int scheduledCount;
  final List<CommunityEventItem> events;
  final List<SpacePollSummary> polls;

  factory SpacesOverview.fromJson(Map<String, dynamic> json) {
    return SpacesOverview(
      guild: Guild.fromJson(
        Map<String, dynamic>.from(json['guild'] as Map? ?? const {}),
      ),
      activityCount: _asInt(json['activityCount']),
      scheduledCount: _asInt(json['scheduledCount']),
      events: _asList(json['events']).map(CommunityEventItem.fromJson).toList(),
      polls: _asList(
        json['activePolls'],
      ).map(SpacePollSummary.fromJson).toList(),
    );
  }
}

class SavedMessage {
  const SavedMessage({
    required this.id,
    required this.type,
    required this.createdAt,
    required this.message,
    this.conversation,
  });

  final int id;
  final String type;
  final DateTime createdAt;
  final ChatMessage message;
  final DirectConversation? conversation;

  factory SavedMessage.fromJson(Map<String, dynamic> json) {
    return SavedMessage(
      id: _asInt(json['id']),
      type: '${json['type'] ?? 'channel'}',
      createdAt: _asDate(json['createdAt']),
      message: ChatMessage.fromJson(
        Map<String, dynamic>.from(json['message'] as Map? ?? const {}),
      ),
      conversation: json['conversation'] is Map
          ? DirectConversation.fromJson(
              Map<String, dynamic>.from(json['conversation'] as Map),
            )
          : null,
    );
  }
}

class MediaPage {
  const MediaPage({required this.items, this.nextCursor});

  final List<ChatMessage> items;
  final int? nextCursor;

  factory MediaPage.fromJson(Map<String, dynamic> json) {
    final rows = json['items'];
    return MediaPage(
      items: rows is List
          ? rows
                .whereType<Map>()
                .map(
                  (item) =>
                      ChatMessage.fromJson(Map<String, dynamic>.from(item)),
                )
                .toList()
          : const [],
      nextCursor: _asNullableInt(json['nextCursor']),
    );
  }
}

class MessageEditVersion {
  const MessageEditVersion({
    required this.id,
    required this.previousContent,
    required this.createdAt,
    required this.editor,
  });

  final int id;
  final String previousContent;
  final DateTime createdAt;
  final PublicUser editor;

  factory MessageEditVersion.fromJson(Map<String, dynamic> json) {
    return MessageEditVersion(
      id: _asInt(json['id']),
      previousContent: '${json['previousContent'] ?? ''}',
      createdAt: _asDate(json['createdAt']),
      editor: PublicUser.fromJson(json['editor'] as Map<String, dynamic>?),
    );
  }
}

class MessageReaction {
  const MessageReaction({required this.emoji, required this.userId});

  final String emoji;
  final int userId;

  factory MessageReaction.fromJson(Map<String, dynamic> json) {
    return MessageReaction(
      emoji: '${json['emoji'] ?? ''}',
      userId: _asInt(json['userId']),
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
    required this.kind,
    required this.title,
    this.user,
    this.avatarUrl,
    this.members = const [],
    this.memberCount = 0,
    this.lastMessage,
  });

  final int id;
  final ConversationKind kind;
  final String title;
  final PublicUser? user;
  final String? avatarUrl;
  final List<PublicUser> members;
  final int memberCount;
  final ChatMessage? lastMessage;

  bool get isGroup => kind == ConversationKind.group;
  String get displayTitle => isGroup ? title : user?.displayLabel ?? title;
  String get subtitleLabel =>
      isGroup ? '$memberCount members' : user?.statusText ?? 'Direct message';

  factory DirectConversation.fromJson(Map<String, dynamic> json) {
    final rawType = '${json['type'] ?? 'DIRECT'}'.toUpperCase();
    final members = _asList(json['members']).map(PublicUser.fromJson).toList();
    final user = json['user'] is Map<String, dynamic>
        ? PublicUser.fromJson(json['user'] as Map<String, dynamic>?)
        : null;
    return DirectConversation(
      id: _asInt(json['id']),
      kind: rawType == 'GROUP'
          ? ConversationKind.group
          : ConversationKind.direct,
      title:
          _asNullableString(json['title']) ??
          user?.displayLabel ??
          'Direct message',
      user: user,
      avatarUrl: _asNullableString(json['avatarUrl']),
      members: members,
      memberCount: _asInt(json['memberCount']) == 0
          ? members.length
          : _asInt(json['memberCount']),
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
    this.blockedUserIds = const [],
  });

  final List<Friendship> friends;
  final List<FriendRequest> requests;
  final List<DirectConversation> conversations;
  final List<int> blockedUserIds;

  factory SocialSnapshot.fromJson(Map<String, dynamic>? json) {
    final data = json ?? const <String, dynamic>{};
    return SocialSnapshot(
      friends: _asList(data['friends']).map(Friendship.fromJson).toList(),
      requests: _asList(data['requests']).map(FriendRequest.fromJson).toList(),
      conversations: _asList(
        data['conversations'],
      ).map(DirectConversation.fromJson).toList(),
      blockedUserIds: data['blockedUserIds'] is List
          ? (data['blockedUserIds'] as List)
                .map(_asInt)
                .where((id) => id > 0)
                .toList()
          : const [],
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

class StoryItem {
  const StoryItem({
    required this.id,
    required this.caption,
    required this.mediaUrl,
    required this.kind,
    required this.author,
    required this.createdAt,
    required this.expiresAt,
    this.musicUrl,
    this.musicTitle = '',
    this.musicArtist = '',
    this.musicAttachment = '',
    this.viewed = false,
    this.viewCount = 0,
  });

  final int id;
  final String caption;
  final String mediaUrl;
  final StoryKind kind;
  final PublicUser author;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String? musicUrl;
  final String musicTitle;
  final String musicArtist;
  final String musicAttachment;
  final bool viewed;
  final int viewCount;

  bool get isVideo => kind == StoryKind.video;
  bool get hasMusic => musicUrl != null && musicUrl!.isNotEmpty;
  String get musicLabel {
    final title = musicTitle.trim();
    final artist = musicArtist.trim();
    if (title.isEmpty && artist.isEmpty) return musicAttachment;
    if (artist.isEmpty) return title;
    if (title.isEmpty) return artist;
    return '$artist - $title';
  }

  factory StoryItem.fromJson(Map<String, dynamic> json) {
    final rawType = '${json['mediaType'] ?? 'IMAGE'}'.toUpperCase();
    return StoryItem(
      id: _asInt(json['id']),
      caption: '${json['caption'] ?? ''}',
      mediaUrl: '${json['mediaUrl'] ?? ''}',
      kind: rawType == 'VIDEO' ? StoryKind.video : StoryKind.image,
      author: PublicUser.fromJson(json['author'] as Map<String, dynamic>?),
      createdAt: _asDate(json['createdAt']),
      expiresAt: _asDate(json['expiresAt']),
      musicUrl: _asNullableString(json['musicUrl']),
      musicTitle: '${json['musicTitle'] ?? ''}',
      musicArtist: '${json['musicArtist'] ?? ''}',
      musicAttachment: '${json['musicAttachment'] ?? ''}',
      viewed: _asBool(json['viewed']),
      viewCount: _asInt(json['viewCount']),
    );
  }
}

class CallSession {
  const CallSession({
    required this.id,
    required this.conversationId,
    required this.title,
    required this.callerId,
    this.memberIds = const [],
    this.video = false,
    this.status = 'RINGING',
  });

  final String id;
  final int conversationId;
  final String title;
  final int callerId;
  final List<int> memberIds;
  final bool video;
  final String status;

  factory CallSession.fromJson(Map<String, dynamic> json) {
    return CallSession(
      id: '${json['id'] ?? ''}',
      conversationId: _asInt(json['conversationId']),
      title: '${json['title'] ?? 'Call'}',
      callerId: _asInt(json['callerId']),
      memberIds:
          (json['memberIds'] is List ? json['memberIds'] as List : const [])
              .map(_asInt)
              .where((id) => id > 0)
              .toList(),
      video: _asBool(json['video']),
      status: '${json['status'] ?? 'RINGING'}',
    );
  }
}

class CallRecord {
  const CallRecord({
    required this.id,
    required this.conversationId,
    required this.title,
    required this.callerId,
    required this.startedAt,
    this.video = false,
    this.status = 'COMPLETED',
    this.answeredAt,
    this.endedAt,
    this.durationSeconds = 0,
    this.outgoing = false,
  });

  final String id;
  final int conversationId;
  final String title;
  final int callerId;
  final DateTime startedAt;
  final bool video;
  final String status;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int durationSeconds;
  final bool outgoing;

  factory CallRecord.fromJson(Map<String, dynamic> json) {
    return CallRecord(
      id: '${json['id'] ?? ''}',
      conversationId: _asInt(json['conversationId']),
      title: '${json['title'] ?? 'Call'}',
      callerId: _asInt(json['callerId']),
      startedAt: _asDate(json['startedAt']),
      video: _asBool(json['video']),
      status: '${json['status'] ?? 'COMPLETED'}',
      answeredAt: _asNullableDate(json['answeredAt']),
      endedAt: _asNullableDate(json['endedAt']),
      durationSeconds: _asInt(json['durationSeconds']),
      outgoing: _asBool(json['outgoing']),
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
    this.user,
    this.muted = false,
    this.camera = false,
    this.screen = false,
    this.speaking = false,
    this.handRaised = false,
    this.audioProfile = 'voiceFocus',
    this.audioBitrate = 64000,
  });

  final String socketId;
  final int userId;
  final String username;
  final PublicUser? user;
  final bool muted;
  final bool camera;
  final bool screen;
  final bool speaking;
  final bool handRaised;
  final String audioProfile;
  final int audioBitrate;

  String get displayLabel => user?.displayLabel ?? username;
  String get audioProfileLabel {
    return switch (audioProfile) {
      'highFidelity' => 'Hi-Fi',
      'lowData' => 'Low',
      _ => 'Voice',
    };
  }

  factory VoiceParticipant.fromJson(Map<String, dynamic> json) {
    return VoiceParticipant(
      socketId: '${json['socketId'] ?? ''}',
      userId: _asInt(json['userId']),
      username: '${json['username'] ?? 'Participant'}',
      user: json['user'] is Map<String, dynamic>
          ? PublicUser.fromJson(json['user'] as Map<String, dynamic>?)
          : null,
      muted: _asBool(json['muted']),
      camera: _asBool(json['camera']),
      screen: _asBool(json['screen']),
      speaking: _asBool(json['speaking']),
      handRaised: _asBool(json['handRaised']),
      audioProfile: '${json['audioProfile'] ?? 'voiceFocus'}',
      audioBitrate: _asInt(json['audioBitrate']) == 0
          ? 64000
          : _asInt(json['audioBitrate']),
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
