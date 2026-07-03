import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'app_theme.dart';
import 'models.dart';
import 'native_bridge.dart';

class ClientMediaDevice {
  const ClientMediaDevice({
    required this.id,
    required this.label,
    required this.kind,
  });

  final String id;
  final String label;
  final String kind;

  bool get isMicrophone => kind == 'audioinput';
  bool get isOutput => kind == 'audiooutput';
  bool get isCamera => kind == 'videoinput';
}

class VoiceVideoFeed {
  const VoiceVideoFeed({
    required this.id,
    required this.label,
    required this.renderer,
    this.local = false,
    this.screen = false,
    this.speaking = false,
  });

  final String id;
  final String label;
  final RTCVideoRenderer renderer;
  final bool local;
  final bool screen;
  final bool speaking;
}

class VoiceQualityStats {
  const VoiceQualityStats({
    this.rttMs = 0,
    this.jitterMs = 0,
    this.packetLossPercent = 0,
    this.inboundKbps = 0,
    this.outboundKbps = 0,
    this.usingRelay = false,
    this.speaking = false,
    this.label = 'Idle',
  });

  const VoiceQualityStats.idle() : this();

  final int rttMs;
  final int jitterMs;
  final double packetLossPercent;
  final int inboundKbps;
  final int outboundKbps;
  final bool usingRelay;
  final bool speaking;
  final String label;

  String get routeLabel => usingRelay ? 'relay' : 'direct';
}

enum VoiceAudioProfile {
  voiceFocus('Voice Focus', 'Cleaner speech', 64000, true, true, true, 0.02),
  highFidelity(
    'High Fidelity',
    'Best mic quality',
    96000,
    false,
    true,
    false,
    0.03,
  ),
  lowData('Low Data', 'Stable on weak network', 36000, true, true, true, 0.04);

  const VoiceAudioProfile(
    this.label,
    this.caption,
    this.opusBitrate,
    this.useDtx,
    this.echoCancellation,
    this.autoGainControl,
    this.latency,
  );

  final String label;
  final String caption;
  final int opusBitrate;
  final bool useDtx;
  final bool echoCancellation;
  final bool autoGainControl;
  final double latency;

  static VoiceAudioProfile fromName(String? value) {
    for (final profile in values) {
      if (profile.name == value) return profile;
    }
    return VoiceAudioProfile.voiceFocus;
  }
}

enum ProfileAssetKind { avatar, banner }

class WebCordState extends ChangeNotifier {
  WebCordState({WebCordApi? api}) : api = api ?? WebCordApi();

  static const _tokenKey = 'webcord_native_token';
  static const _textChannelKey = 'webcord_native_text_channel';
  static const _voiceChannelKey = 'webcord_native_voice_channel';
  static const _conversationKey = 'webcord_native_conversation';
  static const _themeModeKey = 'webcord_native_theme_mode';
  static const _inputVolumeKey = 'webcord_native_input_volume';
  static const _outputVolumeKey = 'webcord_native_output_volume';
  static const _noiseSuppressionKey = 'webcord_native_noise_suppression';
  static const _voiceAudioProfileKey = 'webcord_native_voice_audio_profile';
  static const _notificationsKey = 'webcord_native_notifications';
  static const _compactMessagesKey = 'webcord_native_compact_messages';
  static const _inlineMediaPreviewsKey = 'webcord_native_inline_media_previews';
  static const _globalChatWallpaperKey = 'webcord_native_chat_wallpaper_global';
  static const _chatWallpaperDimKey = 'webcord_native_chat_wallpaper_dim';
  static const _micDeviceKey = 'webcord_native_mic_device';
  static const _outputDeviceKey = 'webcord_native_output_device';
  static const _cameraDeviceKey = 'webcord_native_camera_device';
  static const _messagePageSize = 100;

  final WebCordApi api;
  NativeStore? _store;
  io.Socket? _socket;
  Timer? _recordingTimer;
  Timer? _voiceStatsTimer;
  MediaStream? _localVoiceStream;
  MediaStream? _cameraStream;
  MediaStream? _screenStream;
  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, List<RTCIceCandidate>> _pendingIceCandidates = {};
  final Map<String, MediaStream> _remoteStreams = {};
  final Map<String, int> _participantVolumes = {};
  final Map<String, RTCVideoRenderer> remoteRenderers = {};
  List<Map<String, dynamic>> _iceServers = const [
    {'urls': 'stun:stun.l.google.com:19302'},
  ];
  DateTime? _lastVoiceStatsAt;
  int _lastVoiceBytesReceived = 0;
  int _lastVoiceBytesSent = 0;
  final RTCVideoRenderer localCameraRenderer = RTCVideoRenderer();
  final RTCVideoRenderer localScreenRenderer = RTCVideoRenderer();
  bool _localCameraRendererReady = false;
  bool _localScreenRendererReady = false;

  String? token;
  PublicUser? user;
  Guild? guild;
  List<Channel> channels = [];
  SocialSnapshot social = const SocialSnapshot();
  List<ChatMessage> messages = [];
  List<VoiceParticipant> voiceParticipants = [];
  List<StoryItem> stories = [];
  List<ClientMediaDevice> mediaDevices = [];
  final Set<int> unreadChannelIds = {};
  final Set<int> unreadConversationIds = {};

  WorkspaceKind workspace = WorkspaceKind.server;
  int? selectedTextChannelId;
  int? selectedVoiceChannelId;
  int? selectedConversationId;
  AttachmentUpload? pendingAttachment;
  CallSession? activeCall;
  CallSession? incomingCall;
  AppThemeMode themeMode = AppThemeMode.liquid;
  String selectedMicDeviceId = '';
  String selectedOutputDeviceId = '';
  String selectedCameraDeviceId = '';
  String chatWallpaperPath = '';

  bool initializing = true;
  bool busy = false;
  bool uploading = false;
  bool loadingOlderMessages = false;
  bool hasOlderMessages = false;
  bool profileSaving = false;
  bool profileAssetUploading = false;
  bool mediaBusy = false;
  bool voiceJoined = false;
  bool micMuted = false;
  bool cameraEnabled = false;
  bool screenSharing = false;
  bool noiseSuppressionEnabled = true;
  bool notificationsEnabled = true;
  bool compactMessages = false;
  bool inlineMediaPreviews = true;
  VoiceAudioProfile voiceAudioProfile = VoiceAudioProfile.voiceFocus;
  bool recordingVoice = false;
  int inputVolume = 100;
  int outputVolume = 100;
  int chatWallpaperDim = 42;
  Duration voiceRecordingElapsed = Duration.zero;
  String socketStatus = 'offline';
  String voiceStatus = 'Voice idle';
  VoiceQualityStats voiceQuality = const VoiceQualityStats.idle();
  String? error;

  bool get isAuthed => token != null && user != null;
  bool get canSend =>
      isAuthed &&
      ((workspace == WorkspaceKind.server && selectedTextChannelId != null) ||
          (workspace == WorkspaceKind.direct &&
              selectedConversationId != null));
  bool get canRecordMedia => canSend && !busy && !uploading && !mediaBusy;
  bool get hasLocalCamera => _cameraStream != null && _localCameraRendererReady;
  bool get hasLocalScreen => _screenStream != null && _localScreenRendererReady;
  int get serverUnreadCount => unreadChannelIds.length;
  int get directUnreadCount => unreadConversationIds.length;
  int get totalUnreadCount => serverUnreadCount + directUnreadCount;

  List<ClientMediaDevice> get microphones =>
      mediaDevices.where((device) => device.isMicrophone).toList();

  List<ClientMediaDevice> get audioOutputs =>
      mediaDevices.where((device) => device.isOutput).toList();

  List<ClientMediaDevice> get cameras =>
      mediaDevices.where((device) => device.isCamera).toList();

  List<VoiceVideoFeed> get voiceVideoFeeds {
    final feeds = <VoiceVideoFeed>[];
    if (hasLocalScreen) {
      feeds.add(
        VoiceVideoFeed(
          id: 'local-screen',
          label: 'Your screen',
          renderer: localScreenRenderer,
          local: true,
          screen: true,
          speaking: voiceQuality.speaking,
        ),
      );
    }
    if (hasLocalCamera) {
      feeds.add(
        VoiceVideoFeed(
          id: 'local-camera',
          label: 'You',
          renderer: localCameraRenderer,
          local: true,
          speaking: voiceQuality.speaking,
        ),
      );
    }
    for (final entry in remoteRenderers.entries) {
      final participant = _findParticipantBySocket(entry.key);
      feeds.add(
        VoiceVideoFeed(
          id: entry.key,
          label: participant?.displayLabel ?? 'Participant',
          renderer: entry.value,
          speaking: participant?.speaking ?? false,
        ),
      );
    }
    return feeds;
  }

  List<Channel> get textChannels =>
      channels.where((channel) => channel.kind == ChannelKind.text).toList();

  List<Channel> get voiceChannels =>
      channels.where((channel) => channel.kind == ChannelKind.voice).toList();

  bool get canManageChannels => user?.canManageChannels ?? false;

  Channel? get activeTextChannel => _findChannel(selectedTextChannelId);
  Channel? get activeVoiceChannel => _findChannel(selectedVoiceChannelId);
  bool get inDirectCall => activeCall != null;
  String get activeVoiceTitle =>
      activeCall?.title ?? activeVoiceChannel?.name ?? 'Voice room';

  DirectConversation? get activeConversation {
    for (final conversation in social.conversations) {
      if (conversation.id == selectedConversationId) return conversation;
    }
    return null;
  }

  bool isFriendUser(int userId) {
    return social.friends.any((friend) => friend.user.id == userId);
  }

  bool isBlockedUser(int userId) {
    return social.blockedUserIds.contains(userId);
  }

  Friendship? friendshipForUser(int userId) {
    for (final friend in social.friends) {
      if (friend.user.id == userId) return friend;
    }
    return null;
  }

  String get title {
    if (workspace == WorkspaceKind.friends) return 'Friends';
    if (workspace == WorkspaceKind.calls) return 'Calls';
    if (workspace == WorkspaceKind.stories) return 'Stories';
    if (workspace == WorkspaceKind.profile) return 'Profile';
    if (workspace == WorkspaceKind.direct) {
      return activeConversation?.displayTitle ?? 'Direct messages';
    }
    return '# ${activeTextChannel?.name ?? 'lobby'}';
  }

  String get subtitle {
    if (workspace == WorkspaceKind.friends) {
      return '${social.friends.length} friends, ${social.requests.where((r) => r.isPending).length} requests';
    }
    if (workspace == WorkspaceKind.calls) {
      return activeCall == null
          ? 'Private and group calls'
          : 'In $activeVoiceTitle';
    }
    if (workspace == WorkspaceKind.stories) {
      return '${stories.length} active stories';
    }
    if (workspace == WorkspaceKind.profile) {
      return user?.statusText ?? 'Edit your WebCord identity';
    }
    if (workspace == WorkspaceKind.direct) {
      return 'Private messages synced through WebCord';
    }
    return socketStatus == 'connected'
        ? 'Live channel'
        : 'Realtime $socketStatus';
  }

  Future<void> init() async {
    _store = await NativeStore.create();
    token = await _store?.getString(_tokenKey);
    selectedTextChannelId = await _store?.getInt(_textChannelKey);
    selectedVoiceChannelId = await _store?.getInt(_voiceChannelKey);
    selectedConversationId = await _store?.getInt(_conversationKey);
    selectedMicDeviceId = await _store?.getString(_micDeviceKey) ?? '';
    selectedOutputDeviceId = await _store?.getString(_outputDeviceKey) ?? '';
    selectedCameraDeviceId = await _store?.getString(_cameraDeviceKey) ?? '';
    themeMode = AppThemeMode.fromName(await _store?.getString(_themeModeKey));
    chatWallpaperDim = _clampWallpaperDim(
      await _store?.getInt(_chatWallpaperDimKey),
    );
    chatWallpaperPath =
        await _store?.getString(_currentChatWallpaperKey) ??
        await _store?.getString(_globalChatWallpaperKey) ??
        '';
    inputVolume = _clampPercent(await _store?.getInt(_inputVolumeKey), 100);
    outputVolume = _clampPercent(await _store?.getInt(_outputVolumeKey), 100);
    noiseSuppressionEnabled = _storedFlag(
      await _store?.getInt(_noiseSuppressionKey),
      fallback: true,
    );
    voiceAudioProfile = VoiceAudioProfile.fromName(
      await _store?.getString(_voiceAudioProfileKey),
    );
    notificationsEnabled = _storedFlag(
      await _store?.getInt(_notificationsKey),
      fallback: true,
    );
    compactMessages = _storedFlag(
      await _store?.getInt(_compactMessagesKey),
      fallback: false,
    );
    inlineMediaPreviews = _storedFlag(
      await _store?.getInt(_inlineMediaPreviewsKey),
      fallback: true,
    );

    if (token == null) {
      initializing = false;
      notifyListeners();
      return;
    }

    try {
      await bootstrap();
    } on ApiException catch (exception) {
      await logout(silent: true);
      error = exception.message;
    } finally {
      initializing = false;
      notifyListeners();
    }
  }

  Future<void> login(String username, String password) async {
    await _authenticate(() => api.login(username, password));
  }

  Future<void> register(String username, String password) async {
    await _authenticate(() => api.register(username, password));
  }

  Future<void> _authenticate(Future<AuthSession> Function() action) async {
    await _runBusy(() async {
      final session = await action();
      token = session.token;
      user = session.user;
      await _store?.setString(_tokenKey, session.token);
      await bootstrap();
    });
  }

  Future<void> logout({bool silent = false}) async {
    await _cleanupVoice(emitLeave: true);
    _socket?.dispose();
    _socket = null;
    token = null;
    user = null;
    guild = null;
    channels = [];
    social = const SocialSnapshot();
    messages = [];
    hasOlderMessages = false;
    loadingOlderMessages = false;
    voiceParticipants = [];
    stories = [];
    activeCall = null;
    incomingCall = null;
    unreadChannelIds.clear();
    unreadConversationIds.clear();
    voiceJoined = false;
    socketStatus = 'offline';
    await _store?.remove(_tokenKey);
    if (!silent) notifyListeners();
  }

  @override
  void dispose() {
    _recordingTimer?.cancel();
    _voiceStatsTimer?.cancel();
    _socket?.emit('leave-voice');
    _disposeStream(_localVoiceStream);
    _disposeStream(_cameraStream);
    _disposeStream(_screenStream);
    for (final peer in _peers.values) {
      unawaited(peer.close());
      unawaited(peer.dispose());
    }
    _peers.clear();
    localCameraRenderer.dispose();
    localScreenRenderer.dispose();
    for (final renderer in remoteRenderers.values) {
      renderer.dispose();
    }
    _socket?.dispose();
    super.dispose();
  }

  Future<void> bootstrap() async {
    final currentToken = token;
    if (currentToken == null) return;

    final data = await api.bootstrap(currentToken);
    try {
      _iceServers = await api.voiceIceServers(currentToken);
    } catch (_) {
      _iceServers = const [
        {'urls': 'stun:stun.l.google.com:19302'},
      ];
    }
    guild = data.guild;
    channels = data.channels;
    social = data.social;
    user = data.currentUser;

    selectedTextChannelId =
        _validChannelId(selectedTextChannelId, ChannelKind.text) ??
        data.defaultTextChannelId;
    selectedVoiceChannelId =
        _validChannelId(selectedVoiceChannelId, ChannelKind.voice) ??
        data.defaultVoiceChannelId;
    selectedConversationId =
        _validConversationId(selectedConversationId) ??
        social.conversations.firstOrNull?.id;

    await _store?.setInt(_textChannelKey, selectedTextChannelId ?? 0);
    await _store?.setInt(_voiceChannelKey, selectedVoiceChannelId ?? 0);
    if (selectedConversationId != null) {
      await _store?.setInt(_conversationKey, selectedConversationId!);
    }
    await _loadCurrentChatWallpaper();

    _connectSocket(currentToken);
    unawaited(refreshMediaDevices());
    unawaited(refreshStories());
    if (workspace == WorkspaceKind.direct && selectedConversationId != null) {
      await loadDirectMessages(selectedConversationId!);
    } else {
      workspace = WorkspaceKind.server;
      await loadChannelMessages(selectedTextChannelId);
    }
  }

  Future<void> refreshSocial() async {
    final currentToken = token;
    if (currentToken == null) return;
    social = await api.social(currentToken);
    selectedConversationId =
        _validConversationId(selectedConversationId) ??
        social.conversations.firstOrNull?.id;
    notifyListeners();
  }

  Future<void> refreshStories() async {
    final currentToken = token;
    if (currentToken == null) return;
    try {
      stories = await api.stories(currentToken);
      notifyListeners();
    } catch (exception) {
      error = '$exception';
      notifyListeners();
    }
  }

  Future<void> loadChannelMessages(int? channelId) async {
    final currentToken = token;
    if (currentToken == null || channelId == null) return;
    final next = await api.channelMessages(
      currentToken,
      channelId,
      limit: _messagePageSize,
    );
    messages = next;
    hasOlderMessages = next.length >= _messagePageSize;
    unreadChannelIds.remove(channelId);
    notifyListeners();
  }

  Future<void> loadDirectMessages(int conversationId) async {
    final currentToken = token;
    if (currentToken == null) return;
    final next = await api.directMessages(
      currentToken,
      conversationId,
      limit: _messagePageSize,
    );
    messages = next;
    hasOlderMessages = next.length >= _messagePageSize;
    unreadConversationIds.remove(conversationId);
    notifyListeners();
  }

  Future<void> loadOlderMessages() async {
    final currentToken = token;
    final beforeId = messages.firstOrNull?.id;
    if (currentToken == null ||
        beforeId == null ||
        loadingOlderMessages ||
        !hasOlderMessages) {
      return;
    }

    loadingOlderMessages = true;
    notifyListeners();
    try {
      final older =
          workspace == WorkspaceKind.direct && selectedConversationId != null
          ? await api.directMessages(
              currentToken,
              selectedConversationId!,
              beforeId: beforeId,
              limit: _messagePageSize,
            )
          : selectedTextChannelId != null
          ? await api.channelMessages(
              currentToken,
              selectedTextChannelId!,
              beforeId: beforeId,
              limit: _messagePageSize,
            )
          : const <ChatMessage>[];
      final existingIds = messages.map((message) => message.id).toSet();
      messages = [
        ...older.where((message) => !existingIds.contains(message.id)),
        ...messages,
      ];
      hasOlderMessages = older.length >= _messagePageSize;
    } catch (exception) {
      error = '$exception';
    } finally {
      loadingOlderMessages = false;
      notifyListeners();
    }
  }

  Future<void> selectWorkspace(WorkspaceKind next) async {
    workspace = next;
    if (next == WorkspaceKind.server) {
      await _loadCurrentChatWallpaper();
      await loadChannelMessages(selectedTextChannelId);
      _joinRooms();
    } else if (next == WorkspaceKind.direct && selectedConversationId != null) {
      await _loadCurrentChatWallpaper();
      await loadDirectMessages(selectedConversationId!);
      _joinRooms();
    } else if (next == WorkspaceKind.stories) {
      await refreshStories();
      messages = [];
      hasOlderMessages = false;
      notifyListeners();
    } else if (next == WorkspaceKind.calls ||
        next == WorkspaceKind.profile ||
        next == WorkspaceKind.friends) {
      messages = [];
      hasOlderMessages = false;
      notifyListeners();
    } else {
      messages = [];
      hasOlderMessages = false;
      notifyListeners();
    }
  }

  Future<void> selectTextChannel(int channelId) async {
    workspace = WorkspaceKind.server;
    selectedTextChannelId = channelId;
    await _store?.setInt(_textChannelKey, channelId);
    await _loadCurrentChatWallpaper();
    _joinRooms();
    await loadChannelMessages(channelId);
  }

  Future<void> selectVoiceChannel(int channelId) async {
    selectedVoiceChannelId = channelId;
    await _store?.setInt(_voiceChannelKey, channelId);
    if (voiceJoined && activeCall == null) {
      _socket?.emit('join-voice', {'channelId': channelId});
      voiceStatus = 'Joining ${activeVoiceChannel?.name ?? 'voice'}';
      notifyListeners();
    }
  }

  Future<void> selectConversation(int conversationId) async {
    workspace = WorkspaceKind.direct;
    selectedConversationId = conversationId;
    await _store?.setInt(_conversationKey, conversationId);
    await _loadCurrentChatWallpaper();
    _joinRooms();
    await loadDirectMessages(conversationId);
  }

  Future<void> sendMessage(String content) async {
    final currentToken = token;
    final trimmed = content.trim();
    if (currentToken == null ||
        (!trimmed.isNotEmpty && pendingAttachment == null)) {
      return;
    }

    await _runBusy(() async {
      final attachmentToSend = pendingAttachment;
      if (workspace == WorkspaceKind.direct && selectedConversationId != null) {
        final message = await api.sendDirectMessage(
          token: currentToken,
          conversationId: selectedConversationId!,
          content: trimmed,
          attachment: attachmentToSend,
        );
        _upsertMessage(message);
      } else if (selectedTextChannelId != null) {
        final message = await api.sendChannelMessage(
          token: currentToken,
          channelId: selectedTextChannelId!,
          content: trimmed,
          attachment: attachmentToSend,
        );
        _upsertMessage(message);
      }
      pendingAttachment = null;
    });
  }

  Future<void> editMessage(ChatMessage message, String content) async {
    final currentToken = token;
    if (currentToken == null || content.trim().isEmpty) return;
    await _runBusy(() async {
      final updated =
          workspace == WorkspaceKind.direct && selectedConversationId != null
          ? await api.editDirectMessage(
              token: currentToken,
              conversationId: selectedConversationId!,
              messageId: message.id,
              content: content.trim(),
            )
          : await api.editChannelMessage(
              token: currentToken,
              messageId: message.id,
              content: content.trim(),
            );
      _upsertMessage(updated);
    });
  }

  Future<void> deleteMessage(ChatMessage message) async {
    final currentToken = token;
    if (currentToken == null) return;
    await _runBusy(() async {
      final updated =
          workspace == WorkspaceKind.direct && selectedConversationId != null
          ? await api.deleteDirectMessage(
              token: currentToken,
              conversationId: selectedConversationId!,
              messageId: message.id,
            )
          : await api.deleteChannelMessage(
              token: currentToken,
              messageId: message.id,
            );
      _upsertMessage(updated);
    });
  }

  Future<void> pickAttachment() async {
    final currentToken = token;
    if (currentToken == null) return;

    try {
      final path = await NativeBridge.pickFile();
      if (path == null) return;
      uploading = true;
      notifyListeners();
      pendingAttachment = await api.upload(currentToken, File(path));
    } catch (exception) {
      error = '$exception';
    } finally {
      uploading = false;
      notifyListeners();
    }
  }

  Future<void> uploadProfileAsset(ProfileAssetKind kind) async {
    final currentToken = token;
    final currentUser = user;
    if (currentToken == null || currentUser == null || profileAssetUploading) {
      return;
    }

    try {
      final path = await NativeBridge.pickFile();
      if (path == null) return;
      if (!_looksLikeImageFile(path)) {
        error = 'Choose an image file for profile media';
        notifyListeners();
        return;
      }

      profileAssetUploading = true;
      notifyListeners();

      final uploaded = await api.upload(currentToken, File(path));
      await saveProfile(
        displayName: currentUser.displayName ?? '',
        bio: currentUser.bio,
        statusText: currentUser.statusText,
        favoriteTrack: currentUser.favoriteTrack,
        accentColor: currentUser.accentColor,
        avatarUrl: kind == ProfileAssetKind.avatar
            ? uploaded.url
            : currentUser.avatarUrl,
        bannerUrl: kind == ProfileAssetKind.banner
            ? uploaded.url
            : currentUser.bannerUrl,
        favoriteTrackUrl: currentUser.favoriteTrackUrl,
        favoriteTrackName: currentUser.favoriteTrackName,
      );
    } catch (exception) {
      error = '$exception';
    } finally {
      profileAssetUploading = false;
      notifyListeners();
    }
  }

  Future<void> saveProfile({
    required String displayName,
    required String bio,
    required String statusText,
    required String favoriteTrack,
    required String accentColor,
    String? avatarUrl,
    String? bannerUrl,
    String? favoriteTrackUrl,
    String? favoriteTrackName,
  }) async {
    final currentToken = token;
    if (currentToken == null || profileSaving) return;
    final currentUser = user;

    profileSaving = true;
    error = null;
    notifyListeners();

    try {
      user = await api.updateProfile(
        token: currentToken,
        displayName: displayName.trim(),
        bio: bio.trim(),
        statusText: statusText.trim(),
        favoriteTrack: favoriteTrack.trim(),
        accentColor: _normalizeAccentColor(accentColor),
        avatarUrl: avatarUrl,
        bannerUrl: bannerUrl,
        favoriteTrackUrl: favoriteTrackUrl ?? currentUser?.favoriteTrackUrl,
        favoriteTrackName: favoriteTrackName ?? currentUser?.favoriteTrackName,
      );
      social = await api.social(currentToken);
    } catch (exception) {
      error = '$exception';
    } finally {
      profileSaving = false;
      notifyListeners();
    }
  }

  Future<void> uploadFavoriteTrack() async {
    final currentToken = token;
    final currentUser = user;
    if (currentToken == null || currentUser == null || profileAssetUploading) {
      return;
    }

    try {
      final path = await NativeBridge.pickFile();
      if (path == null) return;
      if (!_looksLikeAudioFile(path)) {
        error = 'Choose an audio file for profile track';
        notifyListeners();
        return;
      }

      profileAssetUploading = true;
      notifyListeners();

      final uploaded = await api.upload(currentToken, File(path));
      await saveProfile(
        displayName: currentUser.displayName ?? '',
        bio: currentUser.bio,
        statusText: currentUser.statusText,
        favoriteTrack: currentUser.favoriteTrack.trim().isEmpty
            ? _fileDisplayName(path)
            : currentUser.favoriteTrack,
        accentColor: currentUser.accentColor,
        avatarUrl: currentUser.avatarUrl,
        bannerUrl: currentUser.bannerUrl,
        favoriteTrackUrl: uploaded.url,
        favoriteTrackName: uploaded.name,
      );
    } catch (exception) {
      error = '$exception';
    } finally {
      profileAssetUploading = false;
      notifyListeners();
    }
  }

  void clearAttachment() {
    pendingAttachment = null;
    notifyListeners();
  }

  Future<void> openAttachment(ChatMessage message) async {
    final url = message.attachmentUrl;
    if (url == null || url.isEmpty) return;
    final opened = await NativeBridge.openUrl(
      api.attachmentUri(url).toString(),
    );
    if (!opened) {
      error = 'Could not open attachment';
      notifyListeners();
    }
  }

  Future<void> createChannel(String name, ChannelKind kind) async {
    final currentToken = token;
    final currentGuild = guild;
    if (currentToken == null || currentGuild == null || name.trim().isEmpty) {
      return;
    }
    if (!canManageChannels) {
      error = 'Only admins can create channels';
      notifyListeners();
      return;
    }
    await _runBusy(() async {
      final channel = await api.createChannel(
        token: currentToken,
        guildId: currentGuild.id,
        name: name.trim(),
        kind: kind,
      );
      _upsertChannel(channel);
      if (kind == ChannelKind.text) await selectTextChannel(channel.id);
      if (kind == ChannelKind.voice) await selectVoiceChannel(channel.id);
    });
  }

  Future<void> sendFriendRequest(String username) async {
    final currentToken = token;
    if (currentToken == null || username.trim().isEmpty) return;
    await _runBusy(() async {
      await api.sendFriendRequest(currentToken, username.trim());
      await refreshSocial();
    });
  }

  Future<void> respondFriendRequest(FriendRequest request, bool accept) async {
    final currentToken = token;
    if (currentToken == null) return;
    await _runBusy(() async {
      await api.respondFriendRequest(
        token: currentToken,
        requestId: request.id,
        accept: accept,
      );
      await refreshSocial();
    });
  }

  Future<void> openDirect(Friendship friend) async {
    await openDirectUser(friend.user);
  }

  Future<void> openDirectUser(PublicUser targetUser) async {
    final currentToken = token;
    if (currentToken == null) return;
    await _runBusy(() async {
      final conversation = await api.openDirectConversation(
        token: currentToken,
        userId: targetUser.id,
      );
      final conversations = [...social.conversations];
      final index = conversations.indexWhere(
        (item) => item.id == conversation.id,
      );
      if (index >= 0) {
        conversations[index] = conversation;
      } else {
        conversations.insert(0, conversation);
      }
      social = SocialSnapshot(
        friends: social.friends,
        requests: social.requests,
        conversations: conversations,
        blockedUserIds: social.blockedUserIds,
      );
      await selectConversation(conversation.id);
    });
  }

  Future<void> createGroupConversation({
    required String title,
    required List<int> userIds,
  }) async {
    final currentToken = token;
    if (currentToken == null || title.trim().isEmpty || userIds.length < 2) {
      return;
    }

    await _runBusy(() async {
      final conversation = await api.createGroupConversation(
        token: currentToken,
        title: title.trim(),
        userIds: userIds,
      );
      final conversations = [...social.conversations]
        ..removeWhere((item) => item.id == conversation.id)
        ..insert(0, conversation);
      social = SocialSnapshot(
        friends: social.friends,
        requests: social.requests,
        conversations: conversations,
        blockedUserIds: social.blockedUserIds,
      );
      await selectConversation(conversation.id);
    });
  }

  Future<void> blockUser(PublicUser targetUser) async {
    final currentToken = token;
    if (currentToken == null || user?.id == targetUser.id) return;
    await _runBusy(() async {
      await api.blockUser(token: currentToken, userId: targetUser.id);
      await refreshSocial();
      error = '';
    });
  }

  Future<void> unblockUser(PublicUser targetUser) async {
    final currentToken = token;
    if (currentToken == null || user?.id == targetUser.id) return;
    await _runBusy(() async {
      await api.unblockUser(token: currentToken, userId: targetUser.id);
      await refreshSocial();
      error = '';
    });
  }

  Future<void> reportUser(
    PublicUser targetUser, {
    String reason = 'Other',
  }) async {
    final currentToken = token;
    if (currentToken == null || user?.id == targetUser.id) return;
    await _runBusy(() async {
      await api.createReport(
        token: currentToken,
        targetType: 'USER',
        targetUserId: targetUser.id,
        reason: reason,
      );
      error = 'Report sent to moderators';
    });
  }

  Future<void> reportMessage(
    ChatMessage message, {
    String reason = 'Other',
  }) async {
    final currentToken = token;
    if (currentToken == null || user?.id == message.author.id) return;
    await _runBusy(() async {
      await api.createReport(
        token: currentToken,
        targetType: workspace == WorkspaceKind.direct
            ? 'DIRECT_MESSAGE'
            : 'MESSAGE',
        targetUserId: message.author.id,
        messageId: workspace == WorkspaceKind.direct ? null : message.id,
        directMessageId: workspace == WorkspaceKind.direct ? message.id : null,
        reason: reason,
      );
      error = 'Report sent to moderators';
    });
  }

  Future<void> createStoryFromFile({
    String caption = '',
    String musicTitle = '',
    String musicArtist = '',
    bool attachMusic = false,
  }) async {
    final currentToken = token;
    if (currentToken == null || uploading) return;

    try {
      final path = await NativeBridge.pickFile();
      if (path == null) return;
      if (!_looksLikeStoryFile(path)) {
        error = 'Choose an image or video for stories';
        notifyListeners();
        return;
      }

      uploading = true;
      notifyListeners();
      final uploaded = await api.upload(currentToken, File(path));
      final mediaType = _storyMediaType(path, uploaded);
      if (mediaType == null) {
        error = 'Stories support photos and videos';
        return;
      }
      AttachmentUpload? musicUpload;
      if (attachMusic ||
          musicTitle.trim().isNotEmpty ||
          musicArtist.trim().isNotEmpty) {
        final musicPath = await NativeBridge.pickFile();
        if (musicPath != null) {
          if (!_looksLikeAudioFile(musicPath)) {
            error = 'Choose an audio file for story music';
            return;
          }
          musicUpload = await api.upload(currentToken, File(musicPath));
        }
      }
      final story = await api.createStory(
        token: currentToken,
        mediaUrl: uploaded.url,
        mediaType: mediaType,
        caption: caption.trim(),
        musicUrl: musicUpload?.url,
        musicTitle: musicTitle.trim(),
        musicArtist: musicArtist.trim(),
        musicAttachment: musicUpload?.name ?? '',
      );
      stories = [story, ...stories.where((item) => item.id != story.id)];
    } catch (exception) {
      error = '$exception';
    } finally {
      uploading = false;
      notifyListeners();
    }
  }

  Future<void> markStoryViewed(StoryItem story) async {
    final currentToken = token;
    if (currentToken == null || story.viewed) return;
    try {
      await api.markStoryViewed(token: currentToken, storyId: story.id);
      stories = [
        for (final item in stories)
          item.id == story.id
              ? StoryItem(
                  id: item.id,
                  caption: item.caption,
                  mediaUrl: item.mediaUrl,
                  kind: item.kind,
                  author: item.author,
                  createdAt: item.createdAt,
                  expiresAt: item.expiresAt,
                  musicUrl: item.musicUrl,
                  musicTitle: item.musicTitle,
                  musicArtist: item.musicArtist,
                  musicAttachment: item.musicAttachment,
                  viewed: true,
                  viewCount: item.viewCount,
                )
              : item,
      ];
      notifyListeners();
    } catch (_) {}
  }

  Future<void> startDirectCall(
    DirectConversation conversation, {
    bool video = false,
  }) async {
    final currentToken = token;
    if (currentToken == null || socketStatus != 'connected') {
      error = 'Realtime socket is not connected yet';
      notifyListeners();
      return;
    }

    await _runBusy(() async {
      final call = await api.startCall(
        token: currentToken,
        conversationId: conversation.id,
        video: video,
      );
      await _joinCallMedia(call);
      if (video && !cameraEnabled) {
        await _startCamera();
      }
    });
  }

  Future<void> acceptIncomingCall() async {
    final currentToken = token;
    final call = incomingCall;
    if (currentToken == null || call == null) return;

    await _runBusy(() async {
      final accepted = await api.respondCall(
        token: currentToken,
        callId: call.id,
        accept: true,
      );
      incomingCall = null;
      await _joinCallMedia(accepted.id.isEmpty ? call : accepted);
    });
  }

  Future<void> declineIncomingCall() async {
    final currentToken = token;
    final call = incomingCall;
    if (currentToken == null || call == null) return;

    await _runBusy(() async {
      await api.respondCall(
        token: currentToken,
        callId: call.id,
        accept: false,
      );
      incomingCall = null;
    });
  }

  Future<void> endActiveCall() async {
    final currentToken = token;
    final call = activeCall;
    if (currentToken != null && call != null) {
      await api
          .endCall(token: currentToken, callId: call.id)
          .catchError((_) {});
    }
    await _cleanupVoice(emitLeave: true);
  }

  Future<void> _joinCallMedia(CallSession call) async {
    if (call.id.isEmpty) return;
    if (voiceJoined) {
      await _cleanupVoice(emitLeave: true, notify: false);
    }

    try {
      mediaBusy = true;
      activeCall = call;
      error = null;
      voiceStatus = 'Connecting call...';
      notifyListeners();

      await _prepareNativeVoiceAudio();
      _localVoiceStream = await _openVoiceAudioStream();
      await _applyLocalAudioSettings();
      await refreshMediaDevices();

      voiceJoined = true;
      micMuted = false;
      voiceStatus = 'Call connected';
      _socket?.emit('join-call', {'callId': call.id});
      _startVoiceStats();
      _emitVoiceState();
    } catch (exception) {
      await _cleanupVoice(emitLeave: false);
      error = _mediaError(exception, 'Could not access the microphone');
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> joinOrLeaveVoice() async {
    if (voiceJoined) {
      await _cleanupVoice(emitLeave: true);
      return;
    }

    if (selectedVoiceChannelId == null) {
      error = 'Choose a voice channel first';
      notifyListeners();
      return;
    }

    if (socketStatus != 'connected') {
      error = 'Realtime socket is not connected yet';
      notifyListeners();
      return;
    }

    try {
      mediaBusy = true;
      error = null;
      voiceStatus = 'Requesting microphone...';
      notifyListeners();

      await _prepareNativeVoiceAudio();
      _localVoiceStream = await _openVoiceAudioStream();
      await _applyLocalAudioSettings();
      await refreshMediaDevices();

      voiceJoined = true;
      micMuted = false;
      voiceStatus = _voiceProfileStatus();
      _socket?.emit('join-voice', {'channelId': selectedVoiceChannelId});
      _startVoiceStats();
      _emitVoiceState();
    } catch (exception) {
      await _cleanupVoice(emitLeave: false);
      error = _mediaError(exception, 'Could not access the microphone');
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> toggleMicrophone() async {
    if (!_ensureVoiceControlAvailable()) return;
    micMuted = !micMuted;
    await _applyLocalAudioSettings();
    voiceStatus = micMuted ? 'Microphone muted' : 'Microphone live';
    _emitVoiceState();
    notifyListeners();
  }

  Future<void> toggleCamera() async {
    if (!_ensureVoiceControlAvailable()) return;
    if (_cameraStream == null) {
      await _startCamera();
    } else {
      await _stopCamera();
    }
  }

  Future<void> toggleScreenShare() async {
    if (!_ensureVoiceControlAvailable()) return;
    if (_screenStream == null) {
      await _startScreenShare();
    } else {
      await _stopScreenShare();
    }
  }

  Future<void> setThemeMode(AppThemeMode mode) async {
    themeMode = mode;
    await _store?.setString(_themeModeKey, mode.name);
    notifyListeners();
  }

  Future<void> setGlobalChatWallpaper() async {
    await _setChatWallpaper(_globalChatWallpaperKey);
  }

  Future<void> setCurrentChatWallpaper() async {
    await _setChatWallpaper(_currentChatWallpaperKey);
  }

  Future<void> clearCurrentChatWallpaper() async {
    await _store?.remove(_currentChatWallpaperKey);
    await _loadCurrentChatWallpaper();
  }

  Future<void> clearGlobalChatWallpaper() async {
    await _store?.remove(_globalChatWallpaperKey);
    await _loadCurrentChatWallpaper();
  }

  Future<void> setChatWallpaperDim(double value) async {
    chatWallpaperDim = value.round().clamp(0, 90).toInt();
    await _store?.setInt(_chatWallpaperDimKey, chatWallpaperDim);
    notifyListeners();
  }

  Future<void> setInputVolume(double value) async {
    inputVolume = value.round().clamp(0, 200).toInt();
    await _store?.setInt(_inputVolumeKey, inputVolume);
    await _applyLocalAudioSettings();
    notifyListeners();
  }

  Future<void> setOutputVolume(double value) async {
    outputVolume = value.round().clamp(0, 200).toInt();
    await _store?.setInt(_outputVolumeKey, outputVolume);
    await _applyRemoteAudioSettings();
    notifyListeners();
  }

  int participantVolume(String socketId) =>
      _participantVolumes[socketId] ?? 100;

  Future<void> setParticipantVolume(String socketId, double value) async {
    _participantVolumes[socketId] = value.round().clamp(0, 200).toInt();
    final renderer = remoteRenderers[socketId];
    if (renderer != null) {
      await _applyRendererAudioSettings(socketId, renderer);
    }
    notifyListeners();
  }

  Future<void> setNoiseSuppression(bool value) async {
    noiseSuppressionEnabled = value;
    await _store?.setInt(_noiseSuppressionKey, value ? 1 : 0);
    if (voiceJoined) {
      await _restartVoiceInput();
    }
    notifyListeners();
  }

  Future<void> setVoiceAudioProfile(VoiceAudioProfile profile) async {
    voiceAudioProfile = profile;
    await _store?.setString(_voiceAudioProfileKey, profile.name);
    if (voiceJoined) {
      voiceStatus = 'Applying ${profile.label} audio...';
      notifyListeners();
      await _restartVoiceInput();
      voiceStatus = '${profile.label} active';
    }
    notifyListeners();
  }

  Future<void> setNotificationsEnabled(bool value) async {
    notificationsEnabled = value;
    await _store?.setInt(_notificationsKey, value ? 1 : 0);
    notifyListeners();
  }

  Future<void> setCompactMessages(bool value) async {
    compactMessages = value;
    await _store?.setInt(_compactMessagesKey, value ? 1 : 0);
    notifyListeners();
  }

  Future<void> setInlineMediaPreviews(bool value) async {
    inlineMediaPreviews = value;
    await _store?.setInt(_inlineMediaPreviewsKey, value ? 1 : 0);
    notifyListeners();
  }

  void clearLocalMediaCache() {
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  }

  Future<void> setMicDevice(String value) async {
    selectedMicDeviceId = value;
    await _store?.setString(_micDeviceKey, value);
    if (voiceJoined) {
      await _restartVoiceInput();
    }
    notifyListeners();
  }

  Future<void> setOutputDevice(String value) async {
    selectedOutputDeviceId = value;
    await _store?.setString(_outputDeviceKey, value);
    await _applyRemoteAudioSettings();
    notifyListeners();
  }

  Future<void> setCameraDevice(String value) async {
    selectedCameraDeviceId = value;
    await _store?.setString(_cameraDeviceKey, value);
    if (_cameraStream != null) {
      await _stopCamera();
      await _startCamera();
    }
    notifyListeners();
  }

  Future<void> refreshMediaDevices() async {
    try {
      final devices = await navigator.mediaDevices.enumerateDevices();
      mediaDevices = devices
          .map(
            (device) => ClientMediaDevice(
              id: device.deviceId,
              label: device.label.isEmpty
                  ? _deviceFallbackLabel(device.kind, device.deviceId)
                  : device.label,
              kind: device.kind ?? '',
            ),
          )
          .toList();
      _clearMissingDeviceSelections();
    } catch (exception) {
      error = _mediaError(exception, 'Could not read media devices');
    }
    notifyListeners();
  }

  Future<void> startVoiceMessage() async {
    if (!canRecordMedia || recordingVoice) return;
    mediaBusy = true;
    error = null;
    notifyListeners();

    try {
      final path = await NativeBridge.startAudioRecording();
      if (path == null || path.isEmpty) {
        error = 'Voice recording is not available on this device';
        return;
      }
      recordingVoice = true;
      voiceRecordingElapsed = Duration.zero;
      _recordingTimer?.cancel();
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        voiceRecordingElapsed += const Duration(seconds: 1);
        notifyListeners();
      });
    } catch (exception) {
      error = '$exception';
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> stopVoiceMessage({bool send = true}) async {
    if (!recordingVoice) return;

    mediaBusy = true;
    _recordingTimer?.cancel();
    _recordingTimer = null;
    notifyListeners();

    try {
      final path = send
          ? await NativeBridge.stopAudioRecording()
          : await _cancelVoiceRecording();
      recordingVoice = false;
      voiceRecordingElapsed = Duration.zero;
      if (send && path != null && path.isNotEmpty) {
        await _uploadAndSend(File(path));
      }
    } catch (exception) {
      error = '$exception';
    } finally {
      recordingVoice = false;
      voiceRecordingElapsed = Duration.zero;
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> captureCircleVideo() async {
    if (!canRecordMedia) return;
    mediaBusy = true;
    error = null;
    notifyListeners();

    try {
      final path = await NativeBridge.captureCircleVideo();
      if (path != null && path.isNotEmpty) {
        await _uploadAndSend(File(path));
      }
    } catch (exception) {
      error = '$exception';
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> sendRecordedMedia(File file) async {
    if (!canRecordMedia) return;
    error = null;
    await _uploadAndSend(file);
  }

  void clearError() {
    error = null;
    notifyListeners();
  }

  Future<String?> _cancelVoiceRecording() async {
    await NativeBridge.cancelAudioRecording();
    return null;
  }

  Future<void> _uploadAndSend(File file) async {
    final currentToken = token;
    if (currentToken == null) return;

    uploading = true;
    notifyListeners();
    try {
      final attachment = await api.upload(currentToken, file);
      await _sendUploadedAttachment(attachment);
    } finally {
      uploading = false;
      notifyListeners();
    }
  }

  Future<void> _sendUploadedAttachment(AttachmentUpload attachment) async {
    final currentToken = token;
    if (currentToken == null) return;
    await _runBusy(() async {
      if (workspace == WorkspaceKind.direct && selectedConversationId != null) {
        final message = await api.sendDirectMessage(
          token: currentToken,
          conversationId: selectedConversationId!,
          content: '',
          attachment: attachment,
        );
        _upsertMessage(message);
      } else if (selectedTextChannelId != null) {
        final message = await api.sendChannelMessage(
          token: currentToken,
          channelId: selectedTextChannelId!,
          content: '',
          attachment: attachment,
        );
        _upsertMessage(message);
      }
    });
  }

  Future<void> _prepareNativeVoiceAudio() async {
    try {
      if (WebRTC.platformIsAndroid) {
        await Helper.setAndroidAudioConfiguration(
          AndroidAudioConfiguration.communication,
        );
        await Helper.setSpeakerphoneOnButPreferBluetooth();
      }
    } catch (_) {}
  }

  Future<MediaStream> _openVoiceAudioStream() async {
    try {
      return await navigator.mediaDevices.getUserMedia({
        'audio': _audioConstraints(),
        'video': false,
      });
    } catch (exception) {
      Object lastException = exception;
      if (selectedMicDeviceId.isNotEmpty) {
        selectedMicDeviceId = '';
        await _store?.setString(_micDeviceKey, '');
        notifyListeners();
        try {
          return await navigator.mediaDevices.getUserMedia({
            'audio': _audioConstraints(forceDefaultDevice: true),
            'video': false,
          });
        } catch (defaultException) {
          lastException = defaultException;
        }
      }

      if (WebRTC.platformIsDesktop) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            'audio': true,
            'video': false,
          });
        } catch (desktopException) {
          lastException = desktopException;
        }
      }

      throw lastException;
    }
  }

  Map<String, dynamic> _audioConstraints({bool forceDefaultDevice = false}) {
    final profile = voiceAudioProfile;
    final effectiveNoiseSuppression =
        noiseSuppressionEnabled && profile != VoiceAudioProfile.highFidelity;
    if (!WebRTC.platformIsWeb) {
      final optional = <Map<String, dynamic>>[
        if (!forceDefaultDevice && selectedMicDeviceId.isNotEmpty)
          {'sourceId': selectedMicDeviceId},
      ];
      return {
        'echoCancellation': profile.echoCancellation,
        'noiseSuppression': effectiveNoiseSuppression,
        'autoGainControl': profile.autoGainControl,
        'channelCount': 1,
        'sampleRate': 48000,
        'sampleSize': 16,
        if (optional.isNotEmpty) 'optional': optional,
      };
    }

    return {
      'echoCancellation': {'ideal': profile.echoCancellation},
      'noiseSuppression': {'ideal': effectiveNoiseSuppression},
      'autoGainControl': {'ideal': profile.autoGainControl},
      'channelCount': {'ideal': 1},
      'sampleRate': {'ideal': 48000},
      'sampleSize': {'ideal': 16},
      'latency': {'ideal': profile.latency},
      if (!forceDefaultDevice && selectedMicDeviceId.isNotEmpty)
        'deviceId': {'exact': selectedMicDeviceId},
    };
  }

  Map<String, dynamic> _cameraConstraints() {
    if (!WebRTC.platformIsWeb) {
      return {
        if (selectedCameraDeviceId.isNotEmpty)
          'optional': [
            {'sourceId': selectedCameraDeviceId},
          ],
        'width': 1280,
        'height': 720,
        'frameRate': 30,
      };
    }

    return {
      if (selectedCameraDeviceId.isNotEmpty)
        'deviceId': {'exact': selectedCameraDeviceId},
      'width': {'ideal': 1280},
      'height': {'ideal': 720},
      'frameRate': {'ideal': 30},
    };
  }

  Future<void> _restartVoiceInput() async {
    if (!voiceJoined) return;
    final previous = _localVoiceStream;
    try {
      voiceStatus = 'Switching microphone...';
      notifyListeners();
      _localVoiceStream = await _openVoiceAudioStream();
      await _applyLocalAudioSettings();
      if (previous != null) {
        await _replaceAudioTracks(previous, _localVoiceStream!);
        _disposeStream(previous);
      }
      await _renegotiatePeers();
      voiceStatus = _voiceProfileStatus();
    } catch (exception) {
      _localVoiceStream = previous;
      error = _mediaError(exception, 'Could not switch microphone');
    }
  }

  Future<void> _startCamera() async {
    try {
      mediaBusy = true;
      voiceStatus = 'Requesting camera...';
      notifyListeners();
      _cameraStream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': _cameraConstraints(),
      });
      await _ensureCameraRenderer();
      localCameraRenderer.srcObject = _cameraStream;
      await _addStreamTracksToPeers(_cameraStream);
      cameraEnabled = true;
      voiceStatus = 'Camera on';
      _emitVoiceState();
      await _renegotiatePeers();
    } catch (exception) {
      cameraEnabled = false;
      _disposeStream(_cameraStream);
      _cameraStream = null;
      localCameraRenderer.srcObject = null;
      error = _mediaError(exception, 'Could not access the camera');
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> _stopCamera() async {
    final stream = _cameraStream;
    if (stream == null) return;
    await _removeStreamTracksFromPeers(stream);
    _disposeStream(stream);
    _cameraStream = null;
    localCameraRenderer.srcObject = null;
    cameraEnabled = false;
    voiceStatus = 'Camera off';
    _emitVoiceState();
    await _renegotiatePeers();
    notifyListeners();
  }

  Future<void> _startScreenShare() async {
    try {
      mediaBusy = true;
      voiceStatus = 'Requesting screen share...';
      notifyListeners();
      final constraints = await _screenShareConstraints();
      _screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      _screenStream?.getVideoTracks().forEach((track) {
        track.onEnded = () => unawaited(_stopScreenShare());
      });
      await _ensureScreenRenderer();
      localScreenRenderer.srcObject = _screenStream;
      await _addStreamTracksToPeers(_screenStream);
      screenSharing = true;
      voiceStatus = 'Screen sharing';
      _emitVoiceState();
      await _renegotiatePeers();
    } catch (exception) {
      screenSharing = false;
      _disposeStream(_screenStream);
      _screenStream = null;
      localScreenRenderer.srcObject = null;
      error = _mediaError(exception, 'Could not start screen sharing');
      voiceStatus = voiceJoined ? 'Voice connected' : 'Voice idle';
    } finally {
      mediaBusy = false;
      notifyListeners();
    }
  }

  Future<void> _stopScreenShare() async {
    final stream = _screenStream;
    if (stream == null) return;
    await _removeStreamTracksFromPeers(stream);
    _disposeStream(stream);
    _screenStream = null;
    localScreenRenderer.srcObject = null;
    screenSharing = false;
    voiceStatus = 'Screen sharing stopped';
    _emitVoiceState();
    await _renegotiatePeers();
    notifyListeners();
  }

  Future<Map<String, dynamic>> _screenShareConstraints() async {
    if (WebRTC.platformIsDesktop) {
      final sources = await desktopCapturer.getSources(
        types: [SourceType.Screen, SourceType.Window],
        thumbnailSize: ThumbnailSize(320, 180),
      );
      final source = sources.firstWhere(
        (item) => item.type == SourceType.Screen,
        orElse: () => sources.first,
      );
      return {
        'video': {
          'deviceId': {'exact': source.id},
          'mandatory': {'frameRate': 30.0},
        },
        'audio': false,
      };
    }
    return {'video': true, 'audio': false};
  }

  Future<void> _ensureCameraRenderer() async {
    if (_localCameraRendererReady) return;
    await localCameraRenderer.initialize();
    _localCameraRendererReady = true;
  }

  Future<void> _ensureScreenRenderer() async {
    if (_localScreenRendererReady) return;
    await localScreenRenderer.initialize();
    _localScreenRendererReady = true;
  }

  Future<RTCVideoRenderer> _remoteRenderer(String socketId) async {
    final existing = remoteRenderers[socketId];
    if (existing != null) return existing;
    final renderer = RTCVideoRenderer();
    await renderer.initialize();
    remoteRenderers[socketId] = renderer;
    return renderer;
  }

  Future<RTCPeerConnection> _getOrCreatePeer(String socketId) async {
    final existing = _peers[socketId];
    if (existing != null) return existing;

    final peer = await createPeerConnection(_peerConfig());
    _peers[socketId] = peer;

    await _addStreamTracksToPeer(peer, _localVoiceStream);
    await _addStreamTracksToPeer(peer, _cameraStream);
    await _addStreamTracksToPeer(peer, _screenStream);

    peer.onIceCandidate = (candidate) {
      final call = activeCall;
      if (call != null) {
        _socket?.emit('call-ice-candidate', {
          'callId': call.id,
          'candidate': candidate.toMap(),
          'targetSocketId': socketId,
        });
      } else {
        _socket?.emit('voice-ice-candidate', {
          'channelId': selectedVoiceChannelId,
          'candidate': candidate.toMap(),
          'targetSocketId': socketId,
        });
      }
    };
    peer.onTrack = (event) {
      final streams = event.streams;
      final stream = streams.isNotEmpty ? streams.first : null;
      if (stream == null) return;
      _attachRemoteStream(socketId, stream);
    };
    peer.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        voiceStatus = 'Voice media connected';
        notifyListeners();
      }
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed &&
          voiceJoined) {
        unawaited(_createPeerAndOffer(socketId, iceRestart: true));
      }
    };

    return peer;
  }

  Map<String, dynamic> _peerConfig() {
    return {
      'iceServers': _iceServers,
      'iceCandidatePoolSize': 4,
      'bundlePolicy': 'max-bundle',
      'rtcpMuxPolicy': 'require',
      'sdpSemantics': 'unified-plan',
    };
  }

  Future<void> _createPeerAndOffer(
    String socketId, {
    bool iceRestart = false,
  }) async {
    final call = activeCall;
    if (!voiceJoined ||
        _localVoiceStream == null ||
        (call == null && selectedVoiceChannelId == null)) {
      return;
    }
    final peer = await _getOrCreatePeer(socketId);
    final offer = _tuneOpusDescription(
      await peer.createOffer({'iceRestart': iceRestart}),
    );
    await peer.setLocalDescription(offer);
    final localDescription = await peer.getLocalDescription();
    if (call != null) {
      _socket?.emit('call-offer', {
        'callId': call.id,
        'offer': localDescription?.toMap() ?? offer.toMap(),
        'targetSocketId': socketId,
      });
    } else {
      _socket?.emit('voice-offer', {
        'channelId': selectedVoiceChannelId,
        'offer': localDescription?.toMap() ?? offer.toMap(),
        'targetSocketId': socketId,
      });
    }
  }

  Future<void> _handleVoiceOffer(dynamic payload) async {
    if (payload is! Map) return;
    final socketId = '${payload['fromSocketId'] ?? ''}';
    final offer = payload['offer'];
    if (socketId.isEmpty || offer is! Map) return;
    try {
      final peer = await _getOrCreatePeer(socketId);
      final signalingState = await peer.getSignalingState();
      if (signalingState != RTCSignalingState.RTCSignalingStateStable) {
        await peer
            .setLocalDescription(RTCSessionDescription('', 'rollback'))
            .catchError((_) {});
      }
      await peer.setRemoteDescription(
        _tuneOpusDescription(_descriptionFromPayload(offer)),
      );
      await _flushPendingIceCandidates(socketId, peer);
      final answer = _tuneOpusDescription(await peer.createAnswer());
      await peer.setLocalDescription(answer);
      final localDescription = await peer.getLocalDescription();
      final callId = '${payload['callId'] ?? activeCall?.id ?? ''}';
      if (callId.isNotEmpty) {
        _socket?.emit('call-answer', {
          'callId': callId,
          'answer': localDescription?.toMap() ?? answer.toMap(),
          'targetSocketId': socketId,
        });
      } else {
        _socket?.emit('voice-answer', {
          'channelId': selectedVoiceChannelId,
          'answer': localDescription?.toMap() ?? answer.toMap(),
          'targetSocketId': socketId,
        });
      }
    } catch (exception) {
      error = _mediaError(exception, 'Could not answer voice call');
      await _closePeer(socketId);
      notifyListeners();
    }
  }

  Future<void> _handleVoiceAnswer(dynamic payload) async {
    if (payload is! Map) return;
    final socketId = '${payload['fromSocketId'] ?? ''}';
    final answer = payload['answer'];
    if (socketId.isEmpty || answer is! Map) return;
    try {
      final peer = _peers[socketId];
      if (peer == null) return;
      final signalingState = await peer.getSignalingState();
      if (signalingState == RTCSignalingState.RTCSignalingStateHaveLocalOffer) {
        await peer.setRemoteDescription(
          _tuneOpusDescription(_descriptionFromPayload(answer)),
        );
        await _flushPendingIceCandidates(socketId, peer);
      }
    } catch (exception) {
      error = _mediaError(exception, 'Could not complete voice connection');
      notifyListeners();
    }
  }

  Future<void> _handleVoiceIceCandidate(dynamic payload) async {
    if (payload is! Map) return;
    final socketId = '${payload['fromSocketId'] ?? ''}';
    final candidatePayload = payload['candidate'];
    if (socketId.isEmpty || candidatePayload is! Map) return;
    try {
      final candidate = _candidateFromPayload(candidatePayload);
      final peer = await _getOrCreatePeer(socketId);
      final remoteDescription = await peer.getRemoteDescription();
      if (remoteDescription == null) {
        _pendingIceCandidates[socketId] = [
          ...?_pendingIceCandidates[socketId],
          candidate,
        ];
        return;
      }
      await peer.addCandidate(candidate);
    } catch (exception) {
      error = _mediaError(exception, 'Could not add voice network candidate');
      notifyListeners();
    }
  }

  Future<void> _flushPendingIceCandidates(
    String socketId,
    RTCPeerConnection peer,
  ) async {
    final pending = _pendingIceCandidates.remove(socketId) ?? const [];
    for (final candidate in pending) {
      await peer.addCandidate(candidate).catchError((_) {});
    }
  }

  RTCSessionDescription _descriptionFromPayload(Map<dynamic, dynamic> payload) {
    return RTCSessionDescription(
      '${payload['sdp'] ?? ''}',
      '${payload['type'] ?? ''}',
    );
  }

  RTCSessionDescription _tuneOpusDescription(
    RTCSessionDescription description,
  ) {
    final sdp = description.sdp;
    if (sdp == null || sdp.isEmpty) return description;

    final lines = sdp.split('\r\n');
    final opusLineIndex = lines.indexWhere(
      (line) => line.toLowerCase().contains('opus/48000'),
    );
    if (opusLineIndex == -1) return description;

    final match = RegExp(r'^a=rtpmap:(\d+)').firstMatch(lines[opusLineIndex]);
    final payloadType = match?.group(1);
    if (payloadType == null) return description;

    final desiredParams = {
      'minptime': '10',
      'useinbandfec': '1',
      'usedtx': voiceAudioProfile.useDtx ? '1' : '0',
      'maxaveragebitrate': '${voiceAudioProfile.opusBitrate}',
      'maxplaybackrate': '48000',
      'stereo': '0',
      'sprop-stereo': '0',
    };
    final fmtpIndex = lines.indexWhere(
      (line) => line.startsWith('a=fmtp:$payloadType'),
    );
    String mergedFmtpValue([String line = '']) {
      final parts = line.split(RegExp(r'\s+'));
      final source = parts.length > 1 ? parts.sublist(1).join(' ') : '';
      final params = <String, String>{};
      for (final item in source.split(';')) {
        final trimmed = item.trim();
        if (trimmed.isEmpty) continue;
        final separator = trimmed.indexOf('=');
        if (separator <= 0) continue;
        params[trimmed.substring(0, separator)] = trimmed.substring(
          separator + 1,
        );
      }
      params.addAll(desiredParams);
      return params.entries
          .map((entry) => '${entry.key}=${entry.value}')
          .join(';');
    }

    if (fmtpIndex >= 0) {
      lines[fmtpIndex] =
          'a=fmtp:$payloadType ${mergedFmtpValue(lines[fmtpIndex])}';
    } else {
      lines.insert(
        opusLineIndex + 1,
        'a=fmtp:$payloadType ${mergedFmtpValue()}',
      );
    }

    return RTCSessionDescription(lines.join('\r\n'), description.type);
  }

  RTCIceCandidate _candidateFromPayload(Map<dynamic, dynamic> payload) {
    return RTCIceCandidate(
      '${payload['candidate'] ?? ''}',
      payload['sdpMid'] == null ? null : '${payload['sdpMid']}',
      payload['sdpMLineIndex'] is int
          ? payload['sdpMLineIndex'] as int
          : int.tryParse('${payload['sdpMLineIndex'] ?? ''}'),
    );
  }

  Future<void> _addStreamTracksToPeers(MediaStream? stream) async {
    if (stream == null) return;
    for (final peer in _peers.values) {
      await _addStreamTracksToPeer(peer, stream);
    }
  }

  Future<void> _addStreamTracksToPeer(
    RTCPeerConnection peer,
    MediaStream? stream,
  ) async {
    if (stream == null) return;
    final senders = await peer.getSenders();
    final senderTrackIds = senders
        .map((sender) => sender.track?.id)
        .whereType<String>()
        .toSet();
    for (final track in stream.getTracks()) {
      final trackId = track.id;
      if (trackId != null && !senderTrackIds.contains(trackId)) {
        await peer.addTrack(track, stream);
      }
    }
  }

  Future<void> _removeStreamTracksFromPeers(MediaStream stream) async {
    final trackIds = stream.getTracks().map((track) => track.id).toSet();
    for (final peer in _peers.values) {
      final senders = await peer.getSenders();
      for (final sender in senders) {
        if (trackIds.contains(sender.track?.id)) {
          await peer.removeTrack(sender);
        }
      }
    }
  }

  Future<void> _replaceAudioTracks(
    MediaStream oldStream,
    MediaStream newStream,
  ) async {
    final oldIds = oldStream.getAudioTracks().map((track) => track.id).toSet();
    for (final peer in _peers.values) {
      final senders = await peer.getSenders();
      for (final sender in senders) {
        if (oldIds.contains(sender.track?.id)) {
          final replacement = newStream.getAudioTracks().firstOrNull;
          await sender.replaceTrack(replacement);
        }
      }
    }
  }

  Future<void> _renegotiatePeers() async {
    for (final socketId in _peers.keys.toList()) {
      await _createPeerAndOffer(socketId);
    }
  }

  void _startVoiceStats() {
    _voiceStatsTimer?.cancel();
    _lastVoiceStatsAt = null;
    _lastVoiceBytesReceived = 0;
    _lastVoiceBytesSent = 0;
    voiceQuality = const VoiceQualityStats(label: 'Connecting');
    _voiceStatsTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      unawaited(_sampleVoiceStats());
    });
    unawaited(_sampleVoiceStats());
  }

  Future<void> _sampleVoiceStats() async {
    if (!voiceJoined || _peers.isEmpty) {
      final speaking = false;
      if (voiceQuality.speaking != speaking) {
        voiceQuality = VoiceQualityStats(
          label: voiceJoined ? 'Waiting' : 'Idle',
          speaking: speaking,
        );
        _emitVoiceState();
        notifyListeners();
      }
      return;
    }

    try {
      final reports = <StatsReport>[];
      for (final peer in _peers.values) {
        reports.addAll(await peer.getStats());
      }

      final reportById = {for (final report in reports) report.id: report};
      int packetsLost = 0;
      int packetsReceived = 0;
      int bytesReceived = 0;
      int bytesSent = 0;
      double jitterSeconds = 0;
      double rttSeconds = 0;
      double audioLevel = 0;
      bool usingRelay = false;

      for (final report in reports) {
        final values = report.values;
        final type = report.type;
        final kind = '${values['kind'] ?? values['mediaType'] ?? ''}';

        if (type == 'inbound-rtp' && kind == 'audio') {
          packetsLost += _statsInt(values['packetsLost']);
          packetsReceived += _statsInt(values['packetsReceived']);
          bytesReceived += _statsInt(values['bytesReceived']);
          jitterSeconds = jitterSeconds < _statsDouble(values['jitter'])
              ? _statsDouble(values['jitter'])
              : jitterSeconds;
        }

        if (type == 'outbound-rtp' && kind == 'audio') {
          bytesSent += _statsInt(values['bytesSent']);
        }

        if ((type == 'media-source' || type == 'track') && kind == 'audio') {
          audioLevel = audioLevel < _statsDouble(values['audioLevel'])
              ? _statsDouble(values['audioLevel'])
              : audioLevel;
        }

        if (type == 'candidate-pair' &&
            (_statsBool(values['selected']) ||
                _statsBool(values['nominated']) ||
                values['state'] == 'succeeded')) {
          rttSeconds = rttSeconds < _statsDouble(values['currentRoundTripTime'])
              ? _statsDouble(values['currentRoundTripTime'])
              : rttSeconds;
          final localCandidate = reportById['${values['localCandidateId']}'];
          final remoteCandidate = reportById['${values['remoteCandidateId']}'];
          usingRelay =
              usingRelay ||
              localCandidate?.values['candidateType'] == 'relay' ||
              remoteCandidate?.values['candidateType'] == 'relay';
        }
      }

      final now = DateTime.now();
      final previousAt = _lastVoiceStatsAt;
      final elapsedSeconds = previousAt == null
          ? 0.0
          : now.difference(previousAt).inMilliseconds / 1000;
      final inboundKbps = elapsedSeconds <= 0
          ? 0
          : (((bytesReceived - _lastVoiceBytesReceived).clamp(0, 1 << 31) * 8) /
                    elapsedSeconds /
                    1000)
                .round();
      final outboundKbps = elapsedSeconds <= 0
          ? 0
          : (((bytesSent - _lastVoiceBytesSent).clamp(0, 1 << 31) * 8) /
                    elapsedSeconds /
                    1000)
                .round();

      _lastVoiceStatsAt = now;
      _lastVoiceBytesReceived = bytesReceived;
      _lastVoiceBytesSent = bytesSent;

      final totalPackets = packetsReceived + packetsLost;
      final packetLossPercent = totalPackets <= 0
          ? 0.0
          : (packetsLost / totalPackets * 100).clamp(0.0, 100.0);
      final rttMs = (rttSeconds * 1000).round();
      final jitterMs = (jitterSeconds * 1000).round();
      final speaking = !micMuted && audioLevel > 0.018;

      final next = VoiceQualityStats(
        rttMs: rttMs,
        jitterMs: jitterMs,
        packetLossPercent: packetLossPercent,
        inboundKbps: inboundKbps,
        outboundKbps: outboundKbps,
        usingRelay: usingRelay,
        speaking: speaking,
        label: _voiceQualityLabel(
          rttMs: rttMs,
          jitterMs: jitterMs,
          packetLossPercent: packetLossPercent,
        ),
      );
      final speakingChanged = next.speaking != voiceQuality.speaking;
      voiceQuality = next;
      if (speakingChanged) _emitVoiceState();
      notifyListeners();
    } catch (_) {}
  }

  String _voiceQualityLabel({
    required int rttMs,
    required int jitterMs,
    required double packetLossPercent,
  }) {
    if (packetLossPercent >= 10 || jitterMs >= 70 || rttMs >= 360) {
      return 'Poor';
    }
    if (packetLossPercent >= 4 || jitterMs >= 40 || rttMs >= 200) {
      return 'Fair';
    }
    if (rttMs == 0 && jitterMs == 0 && packetLossPercent == 0) {
      return 'Connecting';
    }
    return 'Good';
  }

  String _voiceProfileStatus() {
    return '${voiceAudioProfile.label} audio active';
  }

  Future<void> _attachRemoteStream(String socketId, MediaStream stream) async {
    _remoteStreams[socketId] = stream;
    final renderer = await _remoteRenderer(socketId);
    renderer.srcObject = stream;
    await _applyRendererAudioSettings(socketId, renderer);
    voiceStatus = 'Voice media connected';
    notifyListeners();
  }

  Future<void> _applyLocalAudioSettings() async {
    final tracks = _localVoiceStream?.getAudioTracks() ?? const [];
    for (final track in tracks) {
      track.enabled = !micMuted;
      await Helper.setMicrophoneMute(micMuted, track).catchError((_) {});
      await Helper.setVolume(inputVolume / 100, track).catchError((_) {});
      await track
          .applyConstraints({'volume': inputVolume / 100})
          .catchError((_) {});
    }
  }

  Future<void> _applyRemoteAudioSettings() async {
    for (final entry in remoteRenderers.entries) {
      await _applyRendererAudioSettings(entry.key, entry.value);
    }
  }

  Future<void> _applyRendererAudioSettings(
    String socketId,
    RTCVideoRenderer renderer,
  ) async {
    if (selectedOutputDeviceId.isNotEmpty) {
      try {
        await renderer.audioOutput(selectedOutputDeviceId);
      } catch (_) {}
    }
    final volume = (outputVolume / 100) * (participantVolume(socketId) / 100);
    await renderer.setVolume(volume.clamp(0.0, 4.0)).catchError((_) {});
  }

  Future<void> _cleanupVoice({
    required bool emitLeave,
    bool notify = true,
  }) async {
    final callToLeave = activeCall;
    if (emitLeave) {
      if (callToLeave != null) {
        _socket?.emit('leave-call', {'callId': callToLeave.id});
      } else {
        _socket?.emit('leave-voice');
      }
    }
    _voiceStatsTimer?.cancel();
    _voiceStatsTimer = null;
    _lastVoiceStatsAt = null;
    _lastVoiceBytesReceived = 0;
    _lastVoiceBytesSent = 0;

    await _stopCamera();
    await _stopScreenShare();
    for (final socketId in _peers.keys.toList()) {
      await _closePeer(socketId);
    }
    _disposeStream(_localVoiceStream);
    _localVoiceStream = null;
    _pendingIceCandidates.clear();
    _remoteStreams.clear();
    for (final renderer in remoteRenderers.values) {
      renderer.srcObject = null;
      await renderer.dispose();
    }
    remoteRenderers.clear();
    _participantVolumes.clear();
    voiceJoined = false;
    micMuted = false;
    cameraEnabled = false;
    screenSharing = false;
    activeCall = null;
    voiceParticipants = [];
    voiceStatus = 'Voice idle';
    voiceQuality = const VoiceQualityStats.idle();
    if (WebRTC.platformIsAndroid) {
      await Helper.clearAndroidCommunicationDevice().catchError((_) {});
    }
    if (notify) notifyListeners();
  }

  Future<void> _closePeer(String socketId) async {
    final peer = _peers.remove(socketId);
    if (peer != null) {
      await peer.close().catchError((_) {});
      await peer.dispose().catchError((_) {});
    }
    _pendingIceCandidates.remove(socketId);
    _remoteStreams.remove(socketId);
    _participantVolumes.remove(socketId);
    final renderer = remoteRenderers.remove(socketId);
    if (renderer != null) {
      renderer.srcObject = null;
      await renderer.dispose().catchError((_) {});
    }
  }

  void _disposeStream(MediaStream? stream) {
    if (stream == null) return;
    for (final track in stream.getTracks()) {
      track.stop();
    }
    unawaited(stream.dispose());
  }

  void _clearMissingDeviceSelections() {
    if (selectedMicDeviceId.isNotEmpty &&
        !microphones.any((device) => device.id == selectedMicDeviceId)) {
      selectedMicDeviceId = '';
      unawaited(_store?.setString(_micDeviceKey, ''));
    }
    if (selectedOutputDeviceId.isNotEmpty &&
        !audioOutputs.any((device) => device.id == selectedOutputDeviceId)) {
      selectedOutputDeviceId = '';
      unawaited(_store?.setString(_outputDeviceKey, ''));
    }
    if (selectedCameraDeviceId.isNotEmpty &&
        !cameras.any((device) => device.id == selectedCameraDeviceId)) {
      selectedCameraDeviceId = '';
      unawaited(_store?.setString(_cameraDeviceKey, ''));
    }
  }

  String _deviceFallbackLabel(String? kind, String id) {
    final suffix = id.isEmpty
        ? 'default'
        : id.substring(0, id.length.clamp(0, 5));
    return switch (kind) {
      'audioinput' => 'Microphone $suffix',
      'audiooutput' => 'Output $suffix',
      'videoinput' => 'Camera $suffix',
      _ => 'Device $suffix',
    };
  }

  String _mediaError(Object exception, String fallback) {
    final text = '$exception'.toLowerCase();
    if (text.contains('permission') || text.contains('denied')) {
      return 'Permission was denied or cancelled';
    }
    if (text.contains('notfound') || text.contains('not found')) {
      return 'No matching media device was found';
    }
    if (text.contains('busy') || text.contains('in use')) {
      return 'The media device is already in use';
    }
    return fallback;
  }

  Future<void> _runBusy(Future<void> Function() action) async {
    try {
      busy = true;
      error = null;
      notifyListeners();
      await action();
    } on ApiException catch (exception) {
      error = exception.message;
    } catch (exception) {
      error = '$exception';
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void _connectSocket(String currentToken) {
    if (_socket != null) return;
    socketStatus = 'connecting';
    _socket = io.io(
      api.origin,
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': currentToken})
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) {
        socketStatus = 'connected';
        _joinRooms();
        notifyListeners();
      })
      ..onDisconnect((_) {
        socketStatus = 'disconnected';
        notifyListeners();
      })
      ..onConnectError((payload) {
        socketStatus = 'reconnecting';
        error = 'Socket connection failed';
        notifyListeners();
      })
      ..on('socket-error', (payload) {
        error = _payloadError(payload) ?? 'Socket error';
        notifyListeners();
      })
      ..on(
        'new-message',
        (payload) => _handleSocketMessage(payload, direct: false),
      )
      ..on(
        'guild-message:new',
        (payload) => _handleSocketMessage(payload, direct: false),
      )
      ..on(
        'message:updated',
        (payload) => _handleSocketMessage(payload, direct: false),
      )
      ..on(
        'direct-message:new',
        (payload) => _handleSocketMessage(payload, direct: true),
      )
      ..on(
        'direct-message:notify',
        (payload) => _handleSocketMessage(payload, direct: true),
      )
      ..on(
        'direct-message:updated',
        (payload) => _handleSocketMessage(payload, direct: true),
      )
      ..on('channel-created', (payload) {
        if (payload is Map) {
          _upsertChannel(Channel.fromJson(Map<String, dynamic>.from(payload)));
        }
      })
      ..on('social:refresh', (_) {
        unawaited(refreshSocial());
      })
      ..on('stories:refresh', (_) {
        unawaited(refreshStories());
      })
      ..on('call:incoming', (payload) {
        if (payload is Map) {
          final call = CallSession.fromJson(Map<String, dynamic>.from(payload));
          if (activeCall?.id != call.id) {
            incomingCall = call;
            notifyListeners();
          }
        }
      })
      ..on('call:outgoing', (payload) {
        if (payload is Map) {
          activeCall = CallSession.fromJson(Map<String, dynamic>.from(payload));
          notifyListeners();
        }
      })
      ..on('call:accepted', (payload) {
        if (payload is Map) {
          final call = CallSession.fromJson(Map<String, dynamic>.from(payload));
          if (activeCall?.id == call.id) {
            activeCall = call;
            voiceStatus = 'Call accepted';
            notifyListeners();
          }
        }
      })
      ..on('call:declined', (payload) {
        if (payload is Map) {
          final callId = '${payload['id'] ?? ''}';
          if (activeCall?.id == callId) {
            voiceStatus = 'Call declined';
            unawaited(_cleanupVoice(emitLeave: true));
          }
        }
      })
      ..on('call:ended', (payload) {
        if (payload is Map) {
          final callId = '${payload['id'] ?? ''}';
          if (incomingCall?.id == callId) incomingCall = null;
          if (activeCall?.id == callId) {
            voiceStatus = 'Call ended';
            unawaited(_cleanupVoice(emitLeave: false));
          } else {
            notifyListeners();
          }
        }
      })
      ..on('call-participants', (payload) {
        if (payload is Map) {
          final participants = payload['participants'];
          if (participants is List) {
            voiceParticipants = participants
                .whereType<Map>()
                .map(
                  (item) => VoiceParticipant.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList();
            voiceStatus = voiceParticipants.isEmpty
                ? 'Call connected. Waiting for others.'
                : 'Call connected with ${voiceParticipants.length} peer(s)';
            if (voiceJoined && _localVoiceStream != null) {
              for (final participant in voiceParticipants) {
                unawaited(_createPeerAndOffer(participant.socketId));
              }
            }
            notifyListeners();
          }
        }
      })
      ..on('call-user-joined', (payload) {
        if (payload is Map && payload['participant'] is Map) {
          final participant = VoiceParticipant.fromJson(
            Map<String, dynamic>.from(payload['participant'] as Map),
          );
          final next = [...voiceParticipants]
            ..removeWhere((item) => item.socketId == participant.socketId)
            ..add(participant);
          voiceParticipants = next;
          voiceStatus = '${participant.displayLabel} joined call';
          if (voiceJoined && _localVoiceStream != null) {
            unawaited(_createPeerAndOffer(participant.socketId));
          }
          notifyListeners();
        }
      })
      ..on('call-user-left', (payload) {
        if (payload is Map) {
          final socketId = '${payload['socketId'] ?? ''}';
          voiceParticipants = voiceParticipants
              .where((item) => item.socketId != socketId)
              .toList();
          voiceStatus = '${payload['username'] ?? 'Participant'} left call';
          unawaited(_closePeer(socketId));
          notifyListeners();
        }
      })
      ..on('call-state', (payload) {
        if (payload is Map && payload['participant'] is Map) {
          final participant = VoiceParticipant.fromJson(
            Map<String, dynamic>.from(payload['participant'] as Map),
          );
          voiceParticipants = [
            for (final item in voiceParticipants)
              item.socketId == participant.socketId ? participant : item,
          ];
          notifyListeners();
        }
      })
      ..on('call-offer', (payload) {
        unawaited(_handleVoiceOffer(payload));
      })
      ..on('call-answer', (payload) {
        unawaited(_handleVoiceAnswer(payload));
      })
      ..on('call-ice-candidate', (payload) {
        unawaited(_handleVoiceIceCandidate(payload));
      })
      ..on('voice-participants', (payload) {
        if (payload is List) {
          voiceParticipants = payload
              .whereType<Map>()
              .map(
                (item) =>
                    VoiceParticipant.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList();
          voiceStatus = voiceParticipants.isEmpty
              ? 'Voice connected. Waiting for others.'
              : 'Voice connected with ${voiceParticipants.length} peer(s)';
          if (voiceJoined && _localVoiceStream != null) {
            for (final participant in voiceParticipants) {
              unawaited(_createPeerAndOffer(participant.socketId));
            }
          }
          notifyListeners();
        }
      })
      ..on('voice-user-joined', (payload) {
        if (payload is Map) {
          final participant = VoiceParticipant.fromJson(
            Map<String, dynamic>.from(payload),
          );
          final next = [...voiceParticipants]
            ..removeWhere((item) => item.socketId == participant.socketId)
            ..add(participant);
          voiceParticipants = next;
          voiceStatus = '${participant.username} joined voice';
          if (voiceJoined && _localVoiceStream != null) {
            unawaited(_createPeerAndOffer(participant.socketId));
          }
          notifyListeners();
        }
      })
      ..on('voice-user-left', (payload) {
        if (payload is Map) {
          final socketId = '${payload['socketId'] ?? ''}';
          voiceParticipants = voiceParticipants
              .where((item) => item.socketId != socketId)
              .toList();
          voiceStatus = '${payload['username'] ?? 'Participant'} left voice';
          unawaited(_closePeer(socketId));
          notifyListeners();
        }
      })
      ..on('voice-state', (payload) {
        if (payload is Map) {
          final participant = VoiceParticipant.fromJson(
            Map<String, dynamic>.from(payload),
          );
          voiceParticipants = [
            for (final item in voiceParticipants)
              item.socketId == participant.socketId ? participant : item,
          ];
          notifyListeners();
        }
      })
      ..on('voice-offer', (payload) {
        unawaited(_handleVoiceOffer(payload));
      })
      ..on('voice-answer', (payload) {
        unawaited(_handleVoiceAnswer(payload));
      })
      ..on('voice-ice-candidate', (payload) {
        unawaited(_handleVoiceIceCandidate(payload));
      });

    _socket!.connect();
  }

  bool _ensureVoiceControlAvailable() {
    if (voiceJoined) return true;
    error = 'Join a voice channel first';
    notifyListeners();
    return false;
  }

  void _emitVoiceState() {
    final payload = {
      'muted': micMuted,
      'camera': cameraEnabled,
      'screen': screenSharing,
      'speaking': voiceQuality.speaking,
      'noiseSuppression': noiseSuppressionEnabled,
      'audioProfile': voiceAudioProfile.name,
      'audioBitrate': voiceAudioProfile.opusBitrate,
      'inputVolume': inputVolume,
      'outputVolume': outputVolume,
    };
    final call = activeCall;
    if (call != null) {
      _socket?.emit('call-state', {'callId': call.id, ...payload});
      return;
    }
    _socket?.emit('voice-state', {
      'channelId': selectedVoiceChannelId,
      ...payload,
    });
  }

  void _joinRooms() {
    final socket = _socket;
    if (socket == null || socket.disconnected) return;
    if (guild != null) socket.emit('join-guild', {'guildId': guild!.id});
    if (selectedTextChannelId != null) {
      socket.emit('join-channel', {'channelId': selectedTextChannelId});
    }
    if (selectedConversationId != null) {
      socket.emit('join-direct-conversation', {
        'conversationId': selectedConversationId,
      });
    }
    if (voiceJoined && activeCall != null) {
      socket.emit('join-call', {'callId': activeCall!.id});
    } else if (voiceJoined && selectedVoiceChannelId != null) {
      socket.emit('join-voice', {'channelId': selectedVoiceChannelId});
    }
  }

  void _handleSocketMessage(dynamic payload, {required bool direct}) {
    if (payload is! Map) return;
    final message = ChatMessage.fromJson(Map<String, dynamic>.from(payload));
    final belongs = direct
        ? workspace == WorkspaceKind.direct &&
              message.conversationId == selectedConversationId
        : workspace == WorkspaceKind.server &&
              message.channelId == selectedTextChannelId;
    if (belongs) {
      if (direct && message.conversationId != null) {
        unreadConversationIds.remove(message.conversationId);
      }
      if (!direct && message.channelId != null) {
        unreadChannelIds.remove(message.channelId);
      }
      _upsertMessage(message);
    } else if (message.author.id != user?.id) {
      if (direct && message.conversationId != null) {
        unreadConversationIds.add(message.conversationId!);
      }
      if (!direct && message.channelId != null) {
        unreadChannelIds.add(message.channelId!);
      }
      notifyListeners();
    }
    if (direct) unawaited(refreshSocial());
  }

  void _upsertMessage(ChatMessage message) {
    final next = [...messages];
    final index = next.indexWhere((item) => item.id == message.id);
    if (index >= 0) {
      next[index] = message;
    } else {
      next.add(message);
      next.sort((left, right) => left.id.compareTo(right.id));
    }
    messages = next;
    notifyListeners();
  }

  void _upsertChannel(Channel channel) {
    final next = [...channels];
    final index = next.indexWhere((item) => item.id == channel.id);
    if (index >= 0) {
      next[index] = channel;
    } else {
      next.add(channel);
      next.sort((left, right) {
        final type = left.kind.index.compareTo(right.kind.index);
        return type == 0 ? left.id.compareTo(right.id) : type;
      });
    }
    channels = next;
    notifyListeners();
  }

  int? _validChannelId(int? id, ChannelKind kind) {
    if (id == null || id == 0) return null;
    return channels.any((channel) => channel.id == id && channel.kind == kind)
        ? id
        : null;
  }

  int? _validConversationId(int? id) {
    if (id == null || id == 0) return null;
    return social.conversations.any((conversation) => conversation.id == id)
        ? id
        : null;
  }

  Channel? _findChannel(int? id) {
    if (id == null) return null;
    for (final channel in channels) {
      if (channel.id == id) return channel;
    }
    return null;
  }

  VoiceParticipant? _findParticipantBySocket(String socketId) {
    for (final participant in voiceParticipants) {
      if (participant.socketId == socketId) return participant;
    }
    return null;
  }

  String? _payloadError(dynamic payload) {
    if (payload is Map) return '${payload['error'] ?? ''}'.trim();
    return null;
  }

  int _statsInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('$value') ?? 0;
  }

  double _statsDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse('$value') ?? 0;
  }

  bool _statsBool(dynamic value) {
    return value == true || value == 1 || value == '1' || value == 'true';
  }

  bool _looksLikeImageFile(String path) {
    final lower = path.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.bmp') ||
        lower.endsWith('.heic') ||
        lower.endsWith('.heif');
  }

  bool _looksLikeAudioFile(String path) {
    final lower = path.toLowerCase();
    return lower.endsWith('.mp3') ||
        lower.endsWith('.m4a') ||
        lower.endsWith('.aac') ||
        lower.endsWith('.ogg') ||
        lower.endsWith('.oga') ||
        lower.endsWith('.opus') ||
        lower.endsWith('.wav') ||
        lower.endsWith('.flac');
  }

  bool _looksLikeStoryFile(String path) {
    return _looksLikeImageFile(path) || _looksLikeVideoFile(path);
  }

  bool _looksLikeVideoFile(String path) {
    final lower = path.toLowerCase();
    return lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.m4v') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.3gp') ||
        lower.endsWith('.mkv') ||
        lower.endsWith('.avi');
  }

  String? _storyMediaType(String path, AttachmentUpload uploaded) {
    final uploadedType = uploaded.type.toUpperCase();
    if (uploadedType == 'IMAGE') return 'IMAGE';
    if (uploadedType == 'VIDEO') return 'VIDEO';
    if (_looksLikeImageFile(path) || _looksLikeImageFile(uploaded.name)) {
      return 'IMAGE';
    }
    if (_looksLikeVideoFile(path) || _looksLikeVideoFile(uploaded.name)) {
      return 'VIDEO';
    }
    return null;
  }

  String get _currentChatWallpaperKey {
    if (workspace == WorkspaceKind.direct && selectedConversationId != null) {
      return 'webcord_native_chat_wallpaper_dm_$selectedConversationId';
    }
    if (workspace == WorkspaceKind.server && selectedTextChannelId != null) {
      return 'webcord_native_chat_wallpaper_channel_$selectedTextChannelId';
    }
    return _globalChatWallpaperKey;
  }

  Future<void> _setChatWallpaper(String key) async {
    try {
      final path = await NativeBridge.pickFile();
      if (path == null) return;
      if (!_looksLikeImageFile(path)) {
        error = 'Choose an image for chat wallpaper';
        notifyListeners();
        return;
      }
      await _store?.setString(key, path);
      await _loadCurrentChatWallpaper();
    } catch (exception) {
      error = '$exception';
      notifyListeners();
    }
  }

  Future<void> _loadCurrentChatWallpaper() async {
    chatWallpaperPath =
        await _store?.getString(_currentChatWallpaperKey) ??
        await _store?.getString(_globalChatWallpaperKey) ??
        '';
    notifyListeners();
  }

  String _fileDisplayName(String path) {
    final normalized = path.replaceAll('\\', '/');
    final value = normalized.split('/').last.trim();
    return value.isEmpty ? 'Profile track' : value;
  }

  String _normalizeAccentColor(String value) {
    final trimmed = value.trim();
    return RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(trimmed) ? trimmed : '#7c5cff';
  }

  bool _storedFlag(int? value, {required bool fallback}) {
    if (value == null) return fallback;
    return value == 1;
  }

  int _clampPercent(int? value, int fallback) {
    return (value ?? fallback).clamp(0, 200).toInt();
  }

  int _clampWallpaperDim(int? value) {
    return (value ?? 42).clamp(0, 90).toInt();
  }
}
