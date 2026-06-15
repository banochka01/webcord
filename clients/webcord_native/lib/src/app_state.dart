import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
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
  });

  final String id;
  final String label;
  final RTCVideoRenderer renderer;
  final bool local;
  final bool screen;
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
  static const _notificationsKey = 'webcord_native_notifications';
  static const _compactMessagesKey = 'webcord_native_compact_messages';
  static const _micDeviceKey = 'webcord_native_mic_device';
  static const _outputDeviceKey = 'webcord_native_output_device';
  static const _cameraDeviceKey = 'webcord_native_camera_device';

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
  List<ClientMediaDevice> mediaDevices = [];
  final Set<int> unreadChannelIds = {};
  final Set<int> unreadConversationIds = {};

  WorkspaceKind workspace = WorkspaceKind.server;
  int? selectedTextChannelId;
  int? selectedVoiceChannelId;
  int? selectedConversationId;
  AttachmentUpload? pendingAttachment;
  AppThemeMode themeMode = AppThemeMode.nebula;
  String selectedMicDeviceId = '';
  String selectedOutputDeviceId = '';
  String selectedCameraDeviceId = '';

  bool initializing = true;
  bool busy = false;
  bool uploading = false;
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
  bool recordingVoice = false;
  int inputVolume = 100;
  int outputVolume = 100;
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
        ),
      );
    }
    for (final entry in remoteRenderers.entries) {
      final participant = _findParticipantBySocket(entry.key);
      feeds.add(
        VoiceVideoFeed(
          id: entry.key,
          label: participant?.username ?? 'Participant',
          renderer: entry.value,
        ),
      );
    }
    return feeds;
  }

  List<Channel> get textChannels =>
      channels.where((channel) => channel.kind == ChannelKind.text).toList();

  List<Channel> get voiceChannels =>
      channels.where((channel) => channel.kind == ChannelKind.voice).toList();

  Channel? get activeTextChannel => _findChannel(selectedTextChannelId);
  Channel? get activeVoiceChannel => _findChannel(selectedVoiceChannelId);

  DirectConversation? get activeConversation {
    for (final conversation in social.conversations) {
      if (conversation.id == selectedConversationId) return conversation;
    }
    return null;
  }

  String get title {
    if (workspace == WorkspaceKind.friends) return 'Friends';
    if (workspace == WorkspaceKind.direct) {
      return '@ ${activeConversation?.user.displayLabel ?? 'Direct messages'}';
    }
    return '# ${activeTextChannel?.name ?? 'lobby'}';
  }

  String get subtitle {
    if (workspace == WorkspaceKind.friends) {
      return '${social.friends.length} friends, ${social.requests.where((r) => r.isPending).length} requests';
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
    inputVolume = _clampPercent(await _store?.getInt(_inputVolumeKey), 100);
    outputVolume = _clampPercent(await _store?.getInt(_outputVolumeKey), 100);
    noiseSuppressionEnabled = _storedFlag(
      await _store?.getInt(_noiseSuppressionKey),
      fallback: true,
    );
    notificationsEnabled = _storedFlag(
      await _store?.getInt(_notificationsKey),
      fallback: true,
    );
    compactMessages = _storedFlag(
      await _store?.getInt(_compactMessagesKey),
      fallback: false,
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
    voiceParticipants = [];
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

    _connectSocket(currentToken);
    unawaited(refreshMediaDevices());
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

  Future<void> loadChannelMessages(int? channelId) async {
    final currentToken = token;
    if (currentToken == null || channelId == null) return;
    messages = await api.channelMessages(currentToken, channelId);
    unreadChannelIds.remove(channelId);
    notifyListeners();
  }

  Future<void> loadDirectMessages(int conversationId) async {
    final currentToken = token;
    if (currentToken == null) return;
    messages = await api.directMessages(currentToken, conversationId);
    unreadConversationIds.remove(conversationId);
    notifyListeners();
  }

  Future<void> selectWorkspace(WorkspaceKind next) async {
    workspace = next;
    if (next == WorkspaceKind.server) {
      await loadChannelMessages(selectedTextChannelId);
      _joinRooms();
    } else if (next == WorkspaceKind.direct && selectedConversationId != null) {
      await loadDirectMessages(selectedConversationId!);
      _joinRooms();
    } else {
      messages = [];
      notifyListeners();
    }
  }

  Future<void> selectTextChannel(int channelId) async {
    workspace = WorkspaceKind.server;
    selectedTextChannelId = channelId;
    await _store?.setInt(_textChannelKey, channelId);
    _joinRooms();
    await loadChannelMessages(channelId);
  }

  Future<void> selectVoiceChannel(int channelId) async {
    selectedVoiceChannelId = channelId;
    await _store?.setInt(_voiceChannelKey, channelId);
    if (voiceJoined) {
      _socket?.emit('join-voice', {'channelId': channelId});
      voiceStatus = 'Joining ${activeVoiceChannel?.name ?? 'voice'}';
      notifyListeners();
    }
  }

  Future<void> selectConversation(int conversationId) async {
    workspace = WorkspaceKind.direct;
    selectedConversationId = conversationId;
    await _store?.setInt(_conversationKey, conversationId);
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
  }) async {
    final currentToken = token;
    if (currentToken == null || profileSaving) return;

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
      );
      social = await api.social(currentToken);
    } catch (exception) {
      error = '$exception';
    } finally {
      profileSaving = false;
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
    final currentToken = token;
    if (currentToken == null) return;
    await _runBusy(() async {
      final conversation = await api.openDirectConversation(
        token: currentToken,
        userId: friend.user.id,
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
      );
      await selectConversation(conversation.id);
    });
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
      _localVoiceStream = await navigator.mediaDevices.getUserMedia({
        'audio': _audioConstraints(),
        'video': false,
      });
      await _applyLocalAudioSettings();
      await refreshMediaDevices();

      voiceJoined = true;
      micMuted = false;
      voiceStatus = noiseSuppressionEnabled
          ? 'Noise suppression active'
          : 'Voice connected';
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

  Future<void> setNoiseSuppression(bool value) async {
    noiseSuppressionEnabled = value;
    await _store?.setInt(_noiseSuppressionKey, value ? 1 : 0);
    if (voiceJoined) {
      await _restartVoiceInput();
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

  Map<String, dynamic> _audioConstraints() {
    return {
      'echoCancellation': {'ideal': true},
      'noiseSuppression': {'ideal': noiseSuppressionEnabled},
      'autoGainControl': {'ideal': true},
      'channelCount': {'ideal': 1},
      'sampleRate': {'ideal': 48000},
      'sampleSize': {'ideal': 16},
      'latency': {'ideal': 0.02},
      if (selectedMicDeviceId.isNotEmpty)
        'deviceId': {'exact': selectedMicDeviceId},
    };
  }

  Map<String, dynamic> _cameraConstraints() {
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
      _localVoiceStream = await navigator.mediaDevices.getUserMedia({
        'audio': _audioConstraints(),
        'video': false,
      });
      await _applyLocalAudioSettings();
      if (previous != null) {
        await _replaceAudioTracks(previous, _localVoiceStream!);
        _disposeStream(previous);
      }
      await _renegotiatePeers();
      voiceStatus = 'Microphone ready';
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
      _socket?.emit('voice-ice-candidate', {
        'channelId': selectedVoiceChannelId,
        'candidate': candidate.toMap(),
        'targetSocketId': socketId,
      });
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
    if (!voiceJoined ||
        _localVoiceStream == null ||
        selectedVoiceChannelId == null) {
      return;
    }
    final peer = await _getOrCreatePeer(socketId);
    final offer = _tuneOpusDescription(
      await peer.createOffer({'iceRestart': iceRestart}),
    );
    await peer.setLocalDescription(offer);
    final localDescription = await peer.getLocalDescription();
    _socket?.emit('voice-offer', {
      'channelId': selectedVoiceChannelId,
      'offer': localDescription?.toMap() ?? offer.toMap(),
      'targetSocketId': socketId,
    });
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
      _socket?.emit('voice-answer', {
        'channelId': selectedVoiceChannelId,
        'answer': localDescription?.toMap() ?? answer.toMap(),
        'targetSocketId': socketId,
      });
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

    const fmtpValue =
        'minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=48000;stereo=0;sprop-stereo=0';
    final fmtpIndex = lines.indexWhere(
      (line) => line.startsWith('a=fmtp:$payloadType'),
    );

    if (fmtpIndex >= 0) {
      final existing = lines[fmtpIndex];
      lines[fmtpIndex] = existing.contains('useinbandfec=1')
          ? existing
          : '$existing;$fmtpValue';
    } else {
      lines.insert(opusLineIndex + 1, 'a=fmtp:$payloadType $fmtpValue');
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

  Future<void> _attachRemoteStream(String socketId, MediaStream stream) async {
    _remoteStreams[socketId] = stream;
    final renderer = await _remoteRenderer(socketId);
    renderer.srcObject = stream;
    if (selectedOutputDeviceId.isNotEmpty) {
      try {
        await renderer.audioOutput(selectedOutputDeviceId);
      } catch (_) {}
    }
    await renderer.setVolume(outputVolume / 100).catchError((_) {});
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
    for (final renderer in remoteRenderers.values) {
      if (selectedOutputDeviceId.isNotEmpty) {
        try {
          await renderer.audioOutput(selectedOutputDeviceId);
        } catch (_) {}
      }
      await renderer.setVolume(outputVolume / 100).catchError((_) {});
    }
  }

  Future<void> _cleanupVoice({
    required bool emitLeave,
    bool notify = true,
  }) async {
    if (emitLeave) _socket?.emit('leave-voice');
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
    voiceJoined = false;
    micMuted = false;
    cameraEnabled = false;
    screenSharing = false;
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
    _socket?.emit('voice-state', {
      'channelId': selectedVoiceChannelId,
      'muted': micMuted,
      'camera': cameraEnabled,
      'screen': screenSharing,
      'speaking': voiceQuality.speaking,
      'noiseSuppression': noiseSuppressionEnabled,
      'inputVolume': inputVolume,
      'outputVolume': outputVolume,
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
    if (voiceJoined && selectedVoiceChannelId != null) {
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
}
