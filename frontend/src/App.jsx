import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const REMOTE_ORIGIN = import.meta.env.VITE_REMOTE_ORIGIN || 'https://webcordes.ru';
const IS_NATIVE_CLIENT = Boolean(
  window.webcordDesktop ||
  window.webcordWindow ||
  window.electronAPI ||
  window.Capacitor?.isNativePlatform?.() ||
  /\b(WebCordDesktop|WebCordAndroid|Electron)\b/i.test(navigator.userAgent)
);
const API_URL = import.meta.env.VITE_API_URL || (IS_NATIVE_CLIENT ? `${REMOTE_ORIGIN}/api` : '/api');
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (API_URL.startsWith('http') ? new URL(API_URL).origin : window.location.origin);
const SOCKET_TRANSPORTS = IS_NATIVE_CLIENT ? ['polling', 'websocket'] : ['websocket', 'polling'];
const MESSAGE_POLL_INTERVAL_MS = 6000;
const SOCKET_STATUS_LABELS = {
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  offline: 'Offline'
};
const KEYS = {
  text: 'webcord_last_text_channel_id',
  voice: 'webcord_last_voice_channel_id',
  dm: 'webcord_last_dm_id',
  theme: 'webcord_theme',
  messages: 'webcord_message_cache_v1'
};

const PRESETS = {
  Webcord: { bg: '#0b1020', panel: '#10182d', accent: '#5865f2', text: '#f8fbff' },
  Aurora: { bg: '#101114', panel: '#181d20', accent: '#42d3a7', text: '#f7f7f2' },
  Ember: { bg: '#190f0a', panel: '#2a1a14', accent: '#ff8c42', text: '#fff3eb' },
  Moss: { bg: '#0d1510', panel: '#15211a', accent: '#7bd389', text: '#f3fff7' }
};

const DEFAULT_THEME = PRESETS.Webcord;
const EMPTY_SOCIAL = { friends: [], requests: [], conversations: [] };
const EmojiPicker = lazy(async () => {
  const [{ default: Picker }, { default: data }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data')
  ]);

  return {
    default: (props) => <Picker data={data} {...props} />
  };
});
const VOICE_AUDIO_CONSTRAINTS = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
  latency: { ideal: 0.02 }
};

function getScopeKey(type, id) {
  return `${type}:${id || 'none'}`;
}

function readMessageCache() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.messages) || '{}');
  } catch {
    return {};
  }
}

function writeMessageCache(scopeKey, nextMessages) {
  const cache = readMessageCache();
  cache[scopeKey] = nextMessages.slice(-100);
  localStorage.setItem(KEYS.messages, JSON.stringify(cache));
}

async function apiFetch(path, options = {}, token) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error(payload?.error || 'Request failed');
  return payload;
}

function getApiOrigin() {
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function getAttachmentUrl(value) {
  if (!value) return '';
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (value.startsWith('/uploads/')) return `${getApiOrigin()}${value}`;
  return value;
}

function getPublicAssetUrl(value) {
  if (!value) return '';
  if (/^(https?:|file:|blob:|data:)/i.test(value)) return value;
  if (window.location.protocol === 'file:') {
    return new URL(value.replace(/^\//, ''), window.location.href).href;
  }
  return value;
}

function showClientNotification(title, body) {
  if (!IS_NATIVE_CLIENT || !document.hidden) return;
  const bridge = window.webcordDesktop || window.webcordWindow || window.electronAPI;
  if (typeof bridge?.notify === 'function') {
    bridge.notify({ title, body });
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function sortMessages(list) {
  return [...list].sort((left, right) => {
    const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDiff || Number(left.id) - Number(right.id);
  });
}

function mergeMessage(list, item) {
  if (!item?.id) return list;
  if (list.some((entry) => String(entry.id) === String(item.id))) return list;
  return sortMessages([...list, item]);
}

function areMessageListsEqual(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      String(item?.id) === String(other?.id) &&
      String(item?.content || '') === String(other?.content || '') &&
      String(item?.attachmentUrl || '') === String(other?.attachmentUrl || '') &&
      String(item?.updatedAt || item?.createdAt || '') === String(other?.updatedAt || other?.createdAt || '')
    );
  });
}

function getMediaErrorMessage(error, fallback) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Permission was denied or cancelled';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No matching media device was found';
  }
  if (error?.name === 'NotReadableError') {
    return 'The media device is already in use';
  }
  return fallback;
}

function tuneOpusDescription(description) {
  if (!description?.sdp) return description;

  const lines = description.sdp.split('\r\n');
  const opusLineIndex = lines.findIndex((line) => line.toLowerCase().includes('opus/48000'));
  if (opusLineIndex === -1) return description;

  const payloadType = lines[opusLineIndex].match(/^a=rtpmap:(\d+)/)?.[1];
  if (!payloadType) return description;

  const fmtpValue = 'minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=32000;stereo=0;sprop-stereo=0';
  const fmtpIndex = lines.findIndex((line) => line.startsWith(`a=fmtp:${payloadType}`));

  if (fmtpIndex >= 0) {
    const existing = lines[fmtpIndex];
    lines[fmtpIndex] = existing.includes('useinbandfec=1') ? existing : `${existing};${fmtpValue}`;
  } else {
    lines.splice(opusLineIndex + 1, 0, `a=fmtp:${payloadType} ${fmtpValue}`);
  }

  return { type: description.type, sdp: lines.join('\r\n') };
}

async function createEnhancedVoiceStream(rawStream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return { stream: rawStream, audioContext: null };

  try {
    const audioContext = new AudioContextClass({ sampleRate: 48000 });
    await audioContext.resume?.();

    const source = audioContext.createMediaStreamSource(rawStream);
    const highPass = audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    highPass.Q.value = 0.7;

    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 7800;
    lowPass.Q.value = 0.7;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -36;
    compressor.knee.value = 24;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;

    const makeupGain = audioContext.createGain();
    makeupGain.gain.value = 1.05;

    const destination = audioContext.createMediaStreamDestination();
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(destination);

    return { stream: destination.stream, audioContext };
  } catch (error) {
    console.warn('Voice processing fallback:', error);
    return { stream: rawStream, audioContext: null };
  }
}

function ThemeModal({ open, theme, onClose, onThemeChange, onReset }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Theme Studio</h3>
            <p className="muted">Colors apply instantly.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>x</button>
        </div>

        <div className="preset-grid">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button key={name} className="preset-btn" type="button" onClick={() => onThemeChange(preset)}>{name}</button>
          ))}
        </div>

        <div className="color-grid">
          {['bg', 'panel', 'accent', 'text'].map((key) => (
            <label key={key}>
              {key}
              <input type="color" value={theme[key]} onChange={(e) => onThemeChange({ ...theme, [key]: e.target.value })} />
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onReset}>Reset</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function BrandLogo({ className = '' }) {
  return <img className={className ? `brand-logo ${className}` : 'brand-logo'} src={getPublicAssetUrl('/icons/webcord.png')} alt="" aria-hidden="true" />;
}

function MessageItem({ message, currentUserId, onAvatarClick }) {
  const isOwn = String(message.author?.id) === String(currentUserId);

  return (
    <div className={isOwn ? 'message-card own' : 'message-card'}>
      <div className="message-meta">
        <button className="avatar-chip avatar-button" type="button" onClick={() => onAvatarClick?.(message.author)}>
          {message.author?.avatarUrl ? <img src={getAttachmentUrl(message.author.avatarUrl)} alt={message.author?.username || 'user'} /> : (message.author?.username || '?').slice(0, 1).toUpperCase()}
        </button>
        <strong>{message.author?.username || 'unknown'}</strong>
        <span>{new Date(message.createdAt).toLocaleString()}</span>
      </div>
      {message.content ? <p>{message.content}</p> : null}
      {message.attachmentType === 'IMAGE' ? <img className="message-media" src={getAttachmentUrl(message.attachmentUrl)} alt={message.attachmentName || 'image'} /> : null}
      {message.attachmentType === 'VIDEO' ? <video className="message-media" controls src={getAttachmentUrl(message.attachmentUrl)} /> : null}
      {message.attachmentType === 'FILE' ? <a className="file-link" href={getAttachmentUrl(message.attachmentUrl)} download>{message.attachmentName || 'file'}</a> : null}
    </div>
  );
}

function UserProfileModal({ open, profile, relationshipLabel, canAddFriend, onAddFriend, onClose }) {
  if (!open || !profile) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-banner" style={{ backgroundImage: profile.bannerUrl ? `url(${getAttachmentUrl(profile.bannerUrl)})` : undefined }} />
        <div className="profile-modal-body">
          <div className="profile-avatar-wrap">
            <span className="profile-avatar large">
              {profile.avatarUrl ? <img src={getAttachmentUrl(profile.avatarUrl)} alt={profile.username || 'user'} /> : (profile.username || '?').slice(0, 1).toUpperCase()}
            </span>
          </div>

          <div className="modal-header">
            <div>
              <h3>{profile.username}</h3>
              <p className="muted">{profile.bio || 'No bio yet.'}</p>
            </div>
            <button className="icon-btn" type="button" onClick={onClose}>x</button>
          </div>

          <div className="viewer-actions">
            <span className="request-pill">{relationshipLabel}</span>
            {canAddFriend ? <button type="button" onClick={onAddFriend}>Add friend</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({
  open,
  user,
  draft,
  avatarUploading,
  bannerUploading,
  onClose,
  onChange,
  onUploadAvatar,
  onUploadBanner,
  onSave
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-banner" style={{ backgroundImage: draft.bannerUrl ? `url(${getAttachmentUrl(draft.bannerUrl)})` : undefined }}>
          <button className="ghost-btn floating-action" type="button" onClick={onUploadBanner}>
            {bannerUploading ? 'Uploading...' : 'Change banner'}
          </button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-avatar-wrap">
            <span className="profile-avatar large">
              {draft.avatarUrl ? <img src={getAttachmentUrl(draft.avatarUrl)} alt={user?.username || 'user'} /> : (user?.username || '?').slice(0, 1).toUpperCase()}
            </span>
            <button className="ghost-btn" type="button" onClick={onUploadAvatar}>
              {avatarUploading ? 'Uploading...' : 'Change avatar'}
            </button>
          </div>

          <div className="modal-header">
            <div>
              <h3>Profile Studio</h3>
              <p className="muted">Avatar, banner and bio are synced from the backend.</p>
            </div>
            <button className="icon-btn" type="button" onClick={onClose}>x</button>
          </div>

          <div className="channel-form">
            <textarea className="profile-bio" value={draft.bio} onChange={(e) => onChange({ ...draft, bio: e.target.value.slice(0, 280) })} placeholder="Write a short bio" rows={5} />
            <p className="muted">{draft.bio.length}/280</p>
          </div>

          <div className="modal-actions">
            <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
            <button type="button" onClick={onSave}>Save profile</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserAvatar({ user, label, className = '' }) {
  const displayLabel = label || user?.username || 'User';

  return (
    <span className={`profile-avatar ${className}`}>
      {user?.avatarUrl ? <img src={getAttachmentUrl(user.avatarUrl)} alt={displayLabel} /> : displayLabel.slice(0, 1).toUpperCase()}
    </span>
  );
}

function VoiceParticipantTile({ participant, compact = false }) {
  return (
    <div className={compact ? 'voice-person compact' : 'voice-person'}>
      <UserAvatar user={participant.user} label={participant.username} className="voice-avatar" />
      <div className="voice-person-copy">
        <strong>{participant.username}</strong>
        <span>{participant.status}</span>
      </div>
      {participant.muted ? <span className="voice-chip">Muted</span> : null}
    </div>
  );
}

function VoiceStage({
  activeVoiceChannel,
  localScreenStream,
  localCameraStream,
  noiseSuppressionEnabled,
  onLeave,
  onToggleMic,
  onToggleScreen,
  onToggleCamera,
  onToggleExpanded,
  micMuted,
  screenSharing,
  cameraEnabled,
  expanded,
  participants,
  remoteStreams,
  voiceParticipants,
  voiceStatus
}) {
  const remoteVideoEntries = Object.entries(remoteStreams)
    .filter(([, stream]) => stream?.getVideoTracks?.().length)
    .map(([socketId, stream]) => ({
      socketId,
      stream,
      username: voiceParticipants[socketId]?.username || 'Participant video',
      label: 'Video stream'
    }));

  const videoEntries = [
    ...(localScreenStream ? [{ socketId: 'local-screen', stream: localScreenStream, username: 'Your screen', label: 'Screen sharing' }] : []),
    ...(localCameraStream ? [{ socketId: 'local-camera', stream: localCameraStream, username: 'Your camera', label: 'Camera on' }] : []),
    ...remoteVideoEntries
  ];
  const spotlight = videoEntries[0] || null;

  return (
    <section className={`${spotlight ? 'voice-stage has-share' : 'voice-stage'}${expanded ? ' expanded' : ''}`}>
      <div className="voice-stage-top">
        <div>
          <span className="eyebrow">Voice channel</span>
          <h2>{activeVoiceChannel?.name || 'Voice room'}</h2>
          <p className="muted">{voiceStatus}</p>
        </div>
        <div className="voice-actions">
          <span className="live-pill">Noise {noiseSuppressionEnabled ? 'on' : 'off'}</span>
          <button type="button" onClick={onToggleMic}>{micMuted ? 'Unmute' : 'Mute'}</button>
          <button type="button" onClick={onToggleScreen}>{screenSharing ? 'Stop share' : 'Share'}</button>
          <button type="button" onClick={onToggleCamera}>{cameraEnabled ? 'Camera off' : 'Camera'}</button>
          <button type="button" onClick={onToggleExpanded}>{expanded ? 'Compact' : 'Expand'}</button>
          <button className="danger" type="button" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {spotlight ? (
        <div className="share-layout">
          <div className="share-frame">
            <video
              autoPlay
              playsInline
              muted={spotlight.socketId.startsWith('local-')}
              ref={(node) => {
                if (node && node.srcObject !== spotlight.stream) node.srcObject = spotlight.stream;
              }}
            />
            <div className="share-caption">
              <strong>{spotlight.username}</strong>
              <span>{spotlight.label}</span>
            </div>
          </div>
          <div className="voice-filmstrip">
            {participants.map((participant) => <VoiceParticipantTile key={participant.socketId} participant={participant} compact />)}
            {videoEntries.slice(1).map((entry) => (
              <div className="voice-mini-video" key={entry.socketId}>
                <video
                  autoPlay
                  playsInline
                  muted={entry.socketId.startsWith('local-')}
                  ref={(node) => {
                    if (node && node.srcObject !== entry.stream) node.srcObject = entry.stream;
                  }}
                />
                <span>{entry.username}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="voice-grid">
          {participants.map((participant) => <VoiceParticipantTile key={participant.socketId} participant={participant} />)}
        </div>
      )}
    </section>
  );
}

function DesktopTitleBar({ user, onOpenSettings, onWindowAction }) {
  return (
    <div className="desktop-titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-mark"><BrandLogo /></span>
        <span className="titlebar-name">WebCord</span>
        <span className="titlebar-channel">{user?.username ? `@${user.username}` : 'Desktop'}</span>
      </div>
      <div className="titlebar-actions">
        <button type="button" title="Settings" aria-label="Settings" onClick={onOpenSettings}>⚙</button>
        <button type="button" title="Minimize" aria-label="Minimize" onClick={() => onWindowAction('minimize')}>−</button>
        <button type="button" title="Maximize" aria-label="Maximize" onClick={() => onWindowAction('maximize')}>□</button>
        <button className="titlebar-close" type="button" title="Close" aria-label="Close" onClick={() => onWindowAction('close')}>×</button>
      </div>
    </div>
  );
}

function SettingsModal({
  open,
  activeSection,
  user,
  draft,
  theme,
  inputVolume,
  outputVolume,
  micMuted,
  cameraEnabled,
  cameraTesting,
  noiseSuppressionEnabled,
  avatarUploading,
  bannerUploading,
  onClose,
  onSectionChange,
  onDraftChange,
  onUploadAvatar,
  onUploadBanner,
  onSaveProfile,
  onThemeChange,
  onThemeReset,
  onInputVolumeChange,
  onOutputVolumeChange,
  onToggleMic,
  onToggleCamera,
  onTestCamera,
  onToggleNoiseSuppression,
  onLogout
}) {
  if (!open) return null;

  const navItems = [
    ['account', 'Account'],
    ['profile', 'Profile'],
    ['voice', 'Voice & Video'],
    ['appearance', 'Appearance'],
    ['privacy', 'Privacy'],
    ['notifications', 'Notifications'],
    ['devices', 'Devices']
  ];

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true">
      <aside className="settings-nav">
        <div className="settings-user-card">
          <UserAvatar user={user} className="settings-user-avatar" />
          <div>
            <strong>{user?.username || 'WebCord user'}</strong>
            <span>{user?.bio || 'Customize your client'}</span>
          </div>
        </div>
        <div className="settings-search">Settings</div>
        <p className="settings-group-label">User Settings</p>
        {navItems.map(([id, label]) => (
          <button key={id} className={activeSection === id ? 'settings-nav-item active' : 'settings-nav-item'} type="button" onClick={() => onSectionChange(id)}>
            {label}
          </button>
        ))}
        <button className="settings-nav-item danger-text" type="button" onClick={onLogout}>Log Out</button>
      </aside>

      <section className="settings-content">
        <button className="settings-close" type="button" onClick={onClose}>x</button>

        {activeSection === 'account' ? (
          <div className="settings-page">
            <h2>My Account</h2>
            <div className="account-hero" style={{ backgroundImage: user?.bannerUrl ? `url(${getAttachmentUrl(user.bannerUrl)})` : undefined }}>
              <UserAvatar user={user} className="account-avatar" />
              <div>
                <h3>{user?.username}</h3>
                <p>{user?.bio || 'No bio yet.'}</p>
              </div>
              <button type="button" onClick={() => onSectionChange('profile')}>Edit Profile</button>
            </div>
            <div className="settings-card-list">
              <div className="settings-row"><span>Username</span><strong>{user?.username}</strong></div>
              <div className="settings-row"><span>Display name</span><strong>{user?.displayName || user?.username}</strong></div>
              <div className="settings-row"><span>Status</span><strong>{user?.statusText || 'Online'}</strong></div>
            </div>
          </div>
        ) : null}

        {activeSection === 'profile' ? (
          <div className="settings-page">
            <h2>Profile</h2>
            <div className="profile-editor">
              <div className="profile-preview">
                <div className="profile-banner" style={{ backgroundImage: draft.bannerUrl ? `url(${getAttachmentUrl(draft.bannerUrl)})` : undefined }} />
                <div className="profile-preview-body">
                  <UserAvatar user={{ ...user, avatarUrl: draft.avatarUrl }} className="account-avatar" />
                  <h3>{user?.username}</h3>
                  <p>{draft.bio || 'Write a short bio so friends know what you are up to.'}</p>
                </div>
              </div>
              <div className="settings-form-grid">
                <label>Bio<textarea value={draft.bio} onChange={(e) => onDraftChange({ ...draft, bio: e.target.value.slice(0, 280) })} rows={5} /></label>
                <div className="settings-actions-row">
                  <button type="button" onClick={onUploadAvatar}>{avatarUploading ? 'Uploading...' : 'Change Avatar'}</button>
                  <button type="button" onClick={onUploadBanner}>{bannerUploading ? 'Uploading...' : 'Change Banner'}</button>
                  <button className="primary-btn" type="button" onClick={onSaveProfile}>Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'voice' ? (
          <div className="settings-page">
            <h2>Voice & Video</h2>
            <div className="settings-card-list">
              <label className="settings-slider">Input Volume<span>{inputVolume}%</span><input type="range" min="0" max="200" value={inputVolume} onChange={(e) => onInputVolumeChange(Number(e.target.value))} /></label>
              <label className="settings-slider">Output Volume<span>{outputVolume}%</span><input type="range" min="0" max="200" value={outputVolume} onChange={(e) => onOutputVolumeChange(Number(e.target.value))} /></label>
              <div className="settings-actions-row">
                <button type="button" onClick={onToggleMic}>{micMuted ? 'Unmute Microphone' : 'Mute Microphone'}</button>
                <button type="button" onClick={onToggleCamera}>{cameraEnabled ? 'Turn Camera Off' : 'Turn Camera On'}</button>
                <button type="button" onClick={onTestCamera}>{cameraTesting ? 'Testing Camera...' : 'Test Camera'}</button>
                <button className="ghost-btn" type="button" onClick={onToggleNoiseSuppression}>Noise Suppression: {noiseSuppressionEnabled ? 'On' : 'Off'}</button>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'appearance' ? (
          <div className="settings-page">
            <h2>Appearance</h2>
            <div className="theme-preview" style={{ background: theme.panel }}>
              <span style={{ background: theme.accent }} />
              <div><strong>Current theme</strong><p>Fine tune the dark client palette.</p></div>
            </div>
            <div className="preset-grid">
              {Object.entries(PRESETS).map(([name, preset]) => (
                <button key={name} className="preset-btn" type="button" onClick={() => onThemeChange(preset)}>{name}</button>
              ))}
            </div>
            <div className="color-grid">
              {['bg', 'panel', 'accent', 'text'].map((key) => (
                <label key={key}>{key}<input type="color" value={theme[key]} onChange={(e) => onThemeChange({ ...theme, [key]: e.target.value })} /></label>
              ))}
            </div>
            <button className="ghost-btn" type="button" onClick={onThemeReset}>Reset Theme</button>
          </div>
        ) : null}

        {activeSection === 'privacy' ? <StaticSettingsPage title="Privacy" rows={['Friend requests use the existing backend flow.', 'Profile popovers expose username, avatar, banner and bio.', 'No extra tracking settings are stored by this client.']} /> : null}
        {activeSection === 'notifications' ? <StaticSettingsPage title="Notifications" rows={['Unread and push notification preferences are not backed by the API yet.', 'Message and voice status indicators stay visible in the client.']} /> : null}
        {activeSection === 'devices' ? <StaticSettingsPage title="Devices" rows={['Microphone and camera permissions are handled by the browser or desktop shell.', 'Connected voice peers use the existing WebRTC implementation.']} /> : null}
      </section>
    </div>
  );
}

function StaticSettingsPage({ title, rows }) {
  return (
    <div className="settings-page">
      <h2>{title}</h2>
      <div className="settings-card-list">
        {rows.map((row) => <div className="settings-row" key={row}><span>{row}</span></div>)}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('webcord_token') || '');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('webcord_user') || 'null'));
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 860);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [workspace, setWorkspace] = useState('server');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [guild, setGuild] = useState(null);
  const [channels, setChannels] = useState([]);
  const [social, setSocial] = useState(EMPTY_SOCIAL);
  const [channelId, setChannelId] = useState(localStorage.getItem(KEYS.text) || '');
  const [voiceChannelId, setVoiceChannelId] = useState(localStorage.getItem(KEYS.voice) || '');
  const [dmConversationId, setDmConversationId] = useState(localStorage.getItem(KEYS.dm) || '');
  const [messages, setMessages] = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('TEXT');
  const [friendUsername, setFriendUsername] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [viewedProfile, setViewedProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Voice idle');
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [inputVolume, setInputVolume] = useState(100);
  const [outputVolume, setOutputVolume] = useState(100);
  const [cameraTesting, setCameraTesting] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState({});
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [error, setError] = useState('');
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false);
  const [socketStatus, setSocketStatus] = useState(() => (navigator.onLine === false ? 'offline' : 'disconnected'));
  const [lastRealtimeSync, setLastRealtimeSync] = useState(null);
  const [theme, setTheme] = useState(() => JSON.parse(localStorage.getItem(KEYS.theme) || 'null') || DEFAULT_THEME);
  const [profileDraft, setProfileDraft] = useState({ bio: '', avatarUrl: '', bannerUrl: '' });
  const [isDesktopShell] = useState(() => /\bElectron\b/i.test(navigator.userAgent) || Boolean(window.webcordDesktop || window.webcordWindow || window.electronAPI));

  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const rawLocalStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const remoteAudioRef = useRef({});
  const remoteStreamsRef = useRef({});
  const pendingIceCandidatesRef = useRef({});
  const messagesRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const endRef = useRef(null);
  const scopeRef = useRef({ type: 'channel', id: '' });
  const guildIdRef = useRef(null);
  const channelIdRef = useRef('');
  const dmConversationIdRef = useRef('');
  const workspaceRef = useRef('server');
  const voiceJoinedRef = useRef(false);
  const voiceChannelIdRef = useRef('');
  const volumeRef = useRef({});

  const isAuthed = Boolean(token && user);
  const textChannels = channels.filter((item) => item.type === 'TEXT');
  const voiceChannels = channels.filter((item) => item.type === 'VOICE');
  const activeTextChannel = textChannels.find((item) => String(item.id) === String(channelId));
  const activeVoiceChannel = voiceChannels.find((item) => String(item.id) === String(voiceChannelId));
  const activeConversation = social.conversations.find((item) => String(item.id) === String(dmConversationId));
  const incomingRequests = social.requests.filter((item) => item.direction === 'INCOMING' && item.status === 'PENDING');
  const outgoingRequests = social.requests.filter((item) => item.direction === 'OUTGOING' && item.status === 'PENDING');
  const peerConfig = useMemo(
    () => ({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }),
    []
  );

  useEffect(() => {
    Object.entries({
      '--bg-color': theme.bg,
      '--panel-color': theme.panel,
      '--accent-color': theme.accent,
      '--text-color': theme.text
    }).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    localStorage.setItem(KEYS.theme, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('webcord_user', JSON.stringify(user));
      setProfileDraft({
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || '',
        bannerUrl: user.bannerUrl || ''
      });
    }
  }, [user]);

  useEffect(() => { voiceJoinedRef.current = voiceJoined; }, [voiceJoined]);
  useEffect(() => { guildIdRef.current = guild?.id || null; }, [guild?.id]);
  useEffect(() => { channelIdRef.current = channelId; }, [channelId]);
  useEffect(() => { dmConversationIdRef.current = dmConversationId; }, [dmConversationId]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);
  useEffect(() => { voiceChannelIdRef.current = voiceChannelId; }, [voiceChannelId]);
  useEffect(() => { volumeRef.current = participantVolumes; }, [participantVolumes]);
  useEffect(() => { remoteStreamsRef.current = remoteStreams; }, [remoteStreams]);
  useEffect(() => { scopeRef.current = workspace === 'dm' ? { type: 'dm', id: String(dmConversationId || '') } : { type: 'channel', id: String(channelId || '') }; }, [workspace, channelId, dmConversationId]);
  useEffect(() => { shouldStickToBottomRef.current = true; }, [workspace, channelId, dmConversationId]);
  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, [messages.length, workspace, channelId, dmConversationId]);
  useEffect(() => {
    const scopeKey = workspace === 'dm' ? getScopeKey('dm', dmConversationId) : getScopeKey('channel', channelId);
    if (isAuthed && messages.length > 0 && ((workspace === 'dm' && dmConversationId) || (workspace === 'server' && channelId))) {
      writeMessageCache(scopeKey, messages);
    }
  }, [messages, workspace, channelId, dmConversationId, isAuthed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowEmojiPicker(false);
        setShowSettingsModal(false);
        setViewedProfile(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setNetworkOnline(true);
      setSocketStatus(socketRef.current?.connected ? 'connected' : 'reconnecting');
      socketRef.current?.connect();
      refreshCurrentMessages({ silent: true }).catch(() => {});
      refreshSocialData().catch(() => {});
    };
    const handleOffline = () => {
      setNetworkOnline(false);
      setSocketStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthed, token, workspace, channelId, dmConversationId]);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isAuthed) {
      setGuild(null);
      setChannels([]);
      setSocial(EMPTY_SOCIAL);
      setMessages([]);
      setSocketStatus(networkOnline ? 'disconnected' : 'offline');
      return;
    }
    bootstrapApp().catch((err) => setError(err.message));
  }, [isAuthed, networkOnline]);

  useEffect(() => {
    if (!isAuthed) return;
    const scopeKey = workspace === 'dm' ? getScopeKey('dm', dmConversationId) : getScopeKey('channel', channelId);
    const cachedMessages = readMessageCache()[scopeKey];
    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
      setMessages(cachedMessages);
    }
    if (!getCurrentMessagePath()) {
      setMessages([]);
      return;
    }
    refreshCurrentMessages().catch((err) => setError(err.message));
  }, [isAuthed, workspace, channelId, dmConversationId, token]);

  useEffect(() => {
    if (!isAuthed) return undefined;

    setSocketStatus(networkOnline ? 'connecting' : 'offline');
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: SOCKET_TRANSPORTS,
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('connected');
      setLastRealtimeSync(new Date().toISOString());
      setError('');
      rejoinRealtimeRooms(socket);
      refreshSocialData().catch(() => {});
      refreshCurrentMessages({ silent: true }).catch(() => {});
    });
    socket.io.on('reconnect', () => {
      setSocketStatus('connected');
      setLastRealtimeSync(new Date().toISOString());
      rejoinRealtimeRooms(socket);
      refreshSocialData().catch(() => {});
      refreshCurrentMessages({ silent: true }).catch(() => {});
      if (voiceJoinedRef.current) {
        cleanupVoice({ emitLeave: false });
        setVoiceStatus('Voice reconnected. Join the channel again.');
      }
    });
    socket.io.on('reconnect_attempt', () => setSocketStatus(networkOnline ? 'reconnecting' : 'offline'));
    socket.io.on('reconnect_error', () => setSocketStatus(networkOnline ? 'reconnecting' : 'offline'));
    socket.io.on('reconnect_failed', () => setSocketStatus('disconnected'));
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setSocketStatus('disconnected');
        return;
      }
      setSocketStatus(networkOnline ? 'reconnecting' : 'offline');
    });
    socket.on('connect_error', (err) => {
      setSocketStatus(networkOnline ? 'reconnecting' : 'offline');
      const rawMessage = err.message || 'Socket connection failed';
      setError(IS_NATIVE_CLIENT && /websocket|xhr|poll|transport/i.test(rawMessage) ? 'Realtime is reconnecting. Messages are kept in sync by fallback polling.' : rawMessage);
    });
    socket.on('socket-error', (payload) => setError(payload?.error || 'Socket error'));
    socket.on('new-message', (message) => {
      const scope = scopeRef.current;
      if (scope.type === 'channel' && String(message.channelId) === scope.id) {
        setMessages((prev) => mergeMessage(prev, message));
        if (String(message.author?.id) !== String(user?.id)) {
          showClientNotification(message.author?.username || 'WebCord', message.content || message.attachmentName || 'New message');
        }
      }
    });
    socket.on('direct-message:new', (message) => {
      const scope = scopeRef.current;
      if (scope.type === 'dm' && String(message.conversationId) === scope.id) {
        setMessages((prev) => mergeMessage(prev, message));
        if (String(message.author?.id) !== String(user?.id)) {
          showClientNotification(message.author?.username || 'Direct message', message.content || message.attachmentName || 'New direct message');
        }
      }
    });
    socket.on('channel-created', (channel) => {
      setChannels((prev) =>
        prev.some((item) => item.id === channel.id)
          ? prev
          : [...prev, channel].sort((a, b) => (a.type !== b.type ? a.type.localeCompare(b.type) : a.id - b.id))
      );
    });
    socket.on('social:refresh', () => refreshSocialData().catch((err) => setError(err.message)));
    socket.on('voice-participants', async (participants) => {
      setVoiceParticipants(() =>
        participants.reduce((acc, participant) => {
          acc[participant.socketId] = participant;
          return acc;
        }, {})
      );
      setParticipantVolumes((prev) => {
        const next = { ...prev };
        participants.forEach((participant) => {
          if (!next[participant.socketId]) next[participant.socketId] = 100;
        });
        return next;
      });
      setVoiceStatus(participants.length > 0 ? `Voice connected with ${participants.length} peer(s)` : 'Voice connected. Waiting for others.');
    });
    socket.on('voice-user-joined', async (participant) => {
      try {
        const { socketId } = participant;
        setVoiceParticipants((prev) => ({ ...prev, [socketId]: participant }));
        setParticipantVolumes((prev) => (prev[socketId] ? prev : { ...prev, [socketId]: 100 }));
        setVoiceStatus(`${participant.username || 'A user'} joined voice`);
        await createPeerAndOffer(socketId);
      } catch {
        setError('Could not connect voice peer');
      }
    });
    socket.on('voice-offer', async ({ offer, fromSocketId, targetSocketId }) => {
      try {
        if (targetSocketId && targetSocketId !== socket.id) return;
        const peer = await getOrCreatePeer(fromSocketId);
        if (peer.signalingState !== 'stable') {
          await peer.setLocalDescription({ type: 'rollback' }).catch(() => {});
        }
        await peer.setRemoteDescription(new RTCSessionDescription(tuneOpusDescription(offer)));
        await flushPendingIceCandidates(fromSocketId, peer);
        const answer = tuneOpusDescription(await peer.createAnswer());
        await peer.setLocalDescription(answer);
        socket.emit('voice-answer', { channelId: Number(voiceChannelIdRef.current), answer: peer.localDescription, targetSocketId: fromSocketId });
      } catch {
        setError('Could not answer voice call');
        closePeer(fromSocketId);
      }
    });
    socket.on('voice-answer', async ({ answer, fromSocketId, targetSocketId }) => {
      try {
        if (targetSocketId && targetSocketId !== socket.id) return;
        const peer = peersRef.current[fromSocketId];
        if (peer && peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(tuneOpusDescription(answer)));
          await flushPendingIceCandidates(fromSocketId, peer);
        }
      } catch {
        setError('Could not complete voice connection');
      }
    });
    socket.on('voice-ice-candidate', async ({ candidate, fromSocketId, targetSocketId }) => {
      try {
        if (targetSocketId && targetSocketId !== socket.id) return;
        if (candidate) await addIceCandidate(fromSocketId, candidate);
      } catch {
        setError('Could not add voice network candidate');
      }
    });
    socket.on('voice-user-left', ({ socketId }) => closePeer(socketId));

    return () => {
      setSocketStatus('disconnected');
      socket.disconnect();
      socketRef.current = null;
      cleanupVoice({ emitLeave: false });
    };
  }, [isAuthed, token, peerConfig, networkOnline]);

  useEffect(() => {
    if (!isAuthed) return undefined;

    const interval = window.setInterval(() => {
      refreshSocialData().catch(() => {});

      refreshCurrentMessages({ silent: true }).catch(() => {});
    }, MESSAGE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isAuthed, workspace, dmConversationId, channelId, token]);

  useEffect(() => {
    if (socketRef.current && guild?.id) socketRef.current.emit('join-guild', { guildId: guild.id });
  }, [guild?.id]);

  useEffect(() => {
    if (socketRef.current && channelId) socketRef.current.emit('join-channel', { channelId: Number(channelId) });
    if (channelId) localStorage.setItem(KEYS.text, String(channelId));
  }, [channelId]);

  useEffect(() => {
    if (socketRef.current && dmConversationId) {
      socketRef.current.emit('join-direct-conversation', { conversationId: Number(dmConversationId) });
    }
    if (dmConversationId) localStorage.setItem(KEYS.dm, String(dmConversationId));
  }, [dmConversationId]);

  useEffect(() => {
    if (voiceChannelId) localStorage.setItem(KEYS.voice, String(voiceChannelId));
  }, [voiceChannelId]);

  function getCurrentMessagePath() {
    if (workspace === 'dm' && dmConversationId) return `/dms/${dmConversationId}/messages`;
    if (workspace === 'server' && channelId) return `/messages/${channelId}`;
    return '';
  }

  function handleMessagesScroll() {
    const node = messagesRef.current;
    if (!node) return;
    shouldStickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }

  async function refreshCurrentMessages({ silent = false } = {}) {
    const path = getCurrentMessagePath();
    if (!isAuthed || !path) return;

    try {
      const nextMessages = await apiFetch(path, {}, token);
      const sortedMessages = sortMessages(nextMessages);
      setMessages((prev) => (areMessageListsEqual(prev, sortedMessages) ? prev : sortedMessages));
      setLastRealtimeSync(new Date().toISOString());
    } catch (err) {
      if (!silent) setError(err.message);
      throw err;
    }
  }

  function rejoinRealtimeRooms(socket = socketRef.current) {
    if (!socket?.connected) return;

    if (guildIdRef.current) {
      socket.emit('join-guild', { guildId: Number(guildIdRef.current) });
    }

    if (channelIdRef.current) {
      socket.emit('join-channel', { channelId: Number(channelIdRef.current) });
    }

    if (dmConversationIdRef.current) {
      socket.emit('join-direct-conversation', { conversationId: Number(dmConversationIdRef.current) });
    }
  }

  async function bootstrapApp() {
    const data = await apiFetch('/bootstrap', {}, token);
    if (data.currentUser) setUser(data.currentUser);
    setGuild(data.guild);
    setChannels(data.channels);
    setSocial(data.social || EMPTY_SOCIAL);

    const savedText = localStorage.getItem(KEYS.text);
    const savedVoice = localStorage.getItem(KEYS.voice);
    const savedDm = localStorage.getItem(KEYS.dm);

    setChannelId(
      data.channels.some((item) => item.type === 'TEXT' && String(item.id) === String(savedText))
        ? savedText
        : String(data.defaults.textChannelId)
    );
    setVoiceChannelId(
      data.channels.some((item) => item.type === 'VOICE' && String(item.id) === String(savedVoice))
        ? savedVoice
        : String(data.defaults.voiceChannelId)
    );
    setDmConversationId(
      (data.social?.conversations || []).some((item) => String(item.id) === String(savedDm))
        ? savedDm
        : String(data.social?.conversations?.[0]?.id || '')
    );
  }

  async function refreshSocialData() {
    const nextSocial = await apiFetch('/social', {}, token);
    setSocial(nextSocial);
    if (!nextSocial.conversations.some((item) => String(item.id) === String(dmConversationId))) {
      const nextDm = String(nextSocial.conversations[0]?.id || '');
      setDmConversationId(nextDm);
      if (workspace === 'dm' && !nextDm) setWorkspace('friends');
    }
  }

  async function saveProfile(nextDraft = profileDraft) {
    const nextUser = await apiFetch(
      '/me/profile',
      {
        method: 'PATCH',
        body: JSON.stringify({
          bio: nextDraft.bio,
          avatarUrl: nextDraft.avatarUrl || null,
          bannerUrl: nextDraft.bannerUrl || null
        })
      },
      token
    );
    setUser(nextUser);
    await refreshSocialData();
    setSettingsSection('account');
  }

  async function uploadProfileAsset(kind, file) {
    if (!file || !token) return;
    const setter = kind === 'avatar' ? setAvatarUploading : setBannerUploading;

    try {
      setter(true);
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await apiFetch('/upload', { method: 'POST', body: formData }, token);
      const nextDraft = {
        ...profileDraft,
        ...(kind === 'avatar' ? { avatarUrl: uploaded.url } : { bannerUrl: uploaded.url })
      };
      setProfileDraft(nextDraft);
      await saveProfile(nextDraft);
    } catch (err) {
      setError(err.message);
    } finally {
      setter(false);
      if (kind === 'avatar' && avatarInputRef.current) avatarInputRef.current.value = '';
      if (kind === 'banner' && bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await apiFetch(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('webcord_token', data.token);
      localStorage.setItem('webcord_user', JSON.stringify(data.user));
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    cleanupVoice();
    setVoiceJoined(false);
    setGuild(null);
    setChannels([]);
    setSocial(EMPTY_SOCIAL);
    setMessages([]);
    setToken('');
    setUser(null);
    setWorkspace('server');
    localStorage.removeItem('webcord_token');
    localStorage.removeItem('webcord_user');
  }

  async function handleCreateChannel(event) {
    event.preventDefault();
    if (!newChannelName.trim() || !guild?.id) return;
    try {
      const created = await apiFetch(
        '/channels',
        {
          method: 'POST',
          body: JSON.stringify({ guildId: guild.id, name: newChannelName.trim(), type: newChannelType })
        },
        token
      );
      if (created.type === 'TEXT') {
        setWorkspace('server');
        setChannelId(String(created.id));
      } else {
        setVoiceChannelId(String(created.id));
      }
      setNewChannelName('');
      setNewChannelType('TEXT');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendFriendRequest(event) {
    event.preventDefault();
    if (!friendUsername.trim()) return;
    try {
      await apiFetch('/friends/request', { method: 'POST', body: JSON.stringify({ username: friendUsername.trim() }) }, token);
      setFriendUsername('');
      await refreshSocialData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFriendRequest(requestId, action) {
    try {
      await apiFetch('/friends/respond', { method: 'POST', body: JSON.stringify({ requestId, action }) }, token);
      await refreshSocialData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function openConversation(userId) {
    try {
      const conversation = await apiFetch('/dms/open', { method: 'POST', body: JSON.stringify({ userId }) }, token);
      await refreshSocialData();
      setWorkspace('dm');
      setDmConversationId(String(conversation.id));
    } catch (err) {
      setError(err.message);
    }
  }

  function getRelationshipInfo(profile) {
    if (!profile || !user) {
      return { label: 'Unknown', canAddFriend: false };
    }

    if (String(profile.id) === String(user.id)) {
      return { label: 'This is you', canAddFriend: false };
    }

    if (social.friends.some((friend) => String(friend.user?.id) === String(profile.id))) {
      return { label: 'Already friends', canAddFriend: false };
    }

    const incoming = social.requests.some((request) => request.direction === 'INCOMING' && request.status === 'PENDING' && String(request.user?.id) === String(profile.id));
    if (incoming) {
      return { label: 'Sent you a request', canAddFriend: false };
    }

    const outgoing = social.requests.some((request) => request.direction === 'OUTGOING' && request.status === 'PENDING' && String(request.user?.id) === String(profile.id));
    if (outgoing) {
      return { label: 'Request sent', canAddFriend: false };
    }

    return { label: 'Not friends yet', canAddFriend: true };
  }

  async function handleAddFriendFromProfile() {
    if (!viewedProfile?.username) return;
    try {
      await apiFetch('/friends/request', { method: 'POST', body: JSON.stringify({ username: viewedProfile.username }) }, token);
      await refreshSocialData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      setPendingAttachment(await apiFetch('/upload', { method: 'POST', body: formData }, token));
    } catch (err) {
      setError(err.message);
      setPendingAttachment(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function selectTextChannel(nextId) {
    setWorkspace('server');
    setChannelId(String(nextId));
    setMobileSidebarOpen(false);
    if (isMobile) setMobileChatOpen(true);
  }

  function selectVoiceChannel(nextId) {
    if (voiceJoined) {
      cleanupVoice();
      setVoiceJoined(false);
    }
    setVoiceChannelId(String(nextId));
    setMobileSidebarOpen(false);
  }

  function selectConversation(nextId) {
    setWorkspace('dm');
    setDmConversationId(String(nextId));
    setMobileSidebarOpen(false);
    if (isMobile) setMobileChatOpen(true);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = newMessage.trim();
    if ((!content && !pendingAttachment) || !token) return;
    if (!networkOnline) {
      setError('You are offline. Reconnect before sending.');
      setSocketStatus('offline');
      return;
    }

    try {
      shouldStickToBottomRef.current = true;
      let createdMessage = null;

      if (workspace === 'server' && channelId) {
        createdMessage = await apiFetch(
          '/messages',
          {
            method: 'POST',
            body: JSON.stringify({
              channelId: Number(channelId),
              content,
              attachmentUrl: pendingAttachment?.url,
              attachmentType: pendingAttachment?.type,
              attachmentName: pendingAttachment?.name
            })
          },
          token
        );
      }

      if (workspace === 'dm' && dmConversationId) {
        createdMessage = await apiFetch(
          `/dms/${dmConversationId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content,
              attachmentUrl: pendingAttachment?.url,
              attachmentType: pendingAttachment?.type,
              attachmentName: pendingAttachment?.name
            })
          },
          token
        );
      }

      if (createdMessage) {
        setMessages((prev) => mergeMessage(prev, createdMessage));
      }

      setError('');
      setNewMessage('');
      setPendingAttachment(null);
      setShowEmojiPicker(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function addStreamTracksToPeer(peer, stream) {
    if (!peer || !stream) return;
    const senderTrackIds = new Set(peer.getSenders().map((sender) => sender.track?.id).filter(Boolean));
    stream.getTracks().forEach((track) => {
      if (!senderTrackIds.has(track.id)) {
        peer.addTrack(track, stream);
      }
    });
  }

  function removeStreamTracksFromPeers(stream) {
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map((track) => track.id));
    Object.values(peersRef.current).forEach((peer) => {
      peer.getSenders().forEach((sender) => {
        if (sender.track && trackIds.has(sender.track.id)) {
          peer.removeTrack(sender);
        }
      });
    });
  }

  async function getOrCreatePeer(remoteSocketId) {
    if (peersRef.current[remoteSocketId]) return peersRef.current[remoteSocketId];

    const peer = new RTCPeerConnection(peerConfig);
    peersRef.current[remoteSocketId] = peer;
    setParticipantVolumes((prev) => (prev[remoteSocketId] ? prev : { ...prev, [remoteSocketId]: 100 }));

    addStreamTracksToPeer(peer, localStreamRef.current);
    addStreamTracksToPeer(peer, screenStreamRef.current);
    addStreamTracksToPeer(peer, cameraStreamRef.current);

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('voice-ice-candidate', {
          channelId: Number(voiceChannelIdRef.current),
          candidate: event.candidate,
          targetSocketId: remoteSocketId
        });
      }
    };

    peer.ontrack = (event) => {
      const combinedStream = remoteStreamsRef.current[remoteSocketId] || new MediaStream();
      const incomingTracks = event.streams.length > 0 ? event.streams.flatMap((stream) => stream.getTracks()) : [event.track];

      incomingTracks.forEach((track) => {
        if (!combinedStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          combinedStream.addTrack(track);
        }
      });

      setRemoteStreams((prev) => ({ ...prev, [remoteSocketId]: combinedStream }));
      setVoiceStatus('Voice media connected');
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setVoiceStatus('Voice media connected');
      }

      if (peer.connectionState === 'failed' && voiceJoinedRef.current) {
        peer.restartIce?.();
        createPeerAndOffer(remoteSocketId, { iceRestart: true }).catch(() => setError('Could not restart voice connection'));
      }
    };

    return peer;
  }

  async function addIceCandidate(remoteSocketId, candidate) {
    const peer = await getOrCreatePeer(remoteSocketId);
    const iceCandidate = new RTCIceCandidate(candidate);

    if (!peer.remoteDescription) {
      pendingIceCandidatesRef.current[remoteSocketId] = [
        ...(pendingIceCandidatesRef.current[remoteSocketId] || []),
        iceCandidate
      ];
      return;
    }

    await peer.addIceCandidate(iceCandidate);
  }

  async function flushPendingIceCandidates(remoteSocketId, peer = peersRef.current[remoteSocketId]) {
    if (!peer?.remoteDescription) return;
    const pending = pendingIceCandidatesRef.current[remoteSocketId] || [];
    delete pendingIceCandidatesRef.current[remoteSocketId];

    await Promise.all(
      pending.map((candidate) =>
        peer.addIceCandidate(candidate).catch(() => {})
      )
    );
  }

  async function renegotiatePeers() {
    await Promise.all(Object.keys(peersRef.current).map((socketId) => createPeerAndOffer(socketId)));
  }

  async function createPeerAndOffer(remoteSocketId, options = {}) {
    if (!voiceJoinedRef.current || !localStreamRef.current || !socketRef.current || !remoteSocketId || !voiceChannelIdRef.current) {
      return;
    }
    const peer = await getOrCreatePeer(remoteSocketId);
    const offer = tuneOpusDescription(await peer.createOffer({ iceRestart: Boolean(options.iceRestart) }));
    await peer.setLocalDescription(offer);
    socketRef.current.emit('voice-offer', {
      channelId: Number(voiceChannelIdRef.current),
      offer: peer.localDescription,
      targetSocketId: remoteSocketId
    });
  }

  function closePeer(remoteSocketId) {
    if (peersRef.current[remoteSocketId]) {
      peersRef.current[remoteSocketId].close();
      delete peersRef.current[remoteSocketId];
    }
    if (remoteAudioRef.current[remoteSocketId]) {
      remoteAudioRef.current[remoteSocketId].srcObject = null;
      delete remoteAudioRef.current[remoteSocketId];
    }
    delete pendingIceCandidatesRef.current[remoteSocketId];
    setParticipantVolumes((prev) => {
      const next = { ...prev };
      delete next[remoteSocketId];
      return next;
    });
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[remoteSocketId];
      return next;
    });
    setVoiceParticipants((prev) => {
      const next = { ...prev };
      delete next[remoteSocketId];
      return next;
    });
    if (Object.keys(peersRef.current).length === 0 && voiceJoinedRef.current) {
      setVoiceStatus('Voice connected. Waiting for others.');
    }
  }

  async function startScreenShare() {
    if (!voiceJoinedRef.current || !localStreamRef.current) {
      setError('Join a voice channel before sharing your screen');
      return;
    }
    if (screenStreamRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(IS_NATIVE_CLIENT ? 'Screen sharing is not supported in this mobile WebView. Use the desktop app or browser.' : 'Screen sharing is not supported in this browser');
      return;
    }
    if (!window.isSecureContext && window.location.protocol !== 'file:' && !IS_NATIVE_CLIENT && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setError('Screen sharing requires a secure HTTPS connection');
      return;
    }

    try {
      setError('');
      setVoiceStatus('Requesting screen share...');
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      screenStreamRef.current = displayStream;
      const [videoTrack] = displayStream.getVideoTracks();
      if (videoTrack) videoTrack.onended = () => stopScreenShare().catch(() => {});
      Object.values(peersRef.current).forEach((peer) => addStreamTracksToPeer(peer, displayStream));
      setScreenSharing(true);
      setVoiceStatus('Screen sharing');
      await renegotiatePeers();
    } catch (err) {
      screenStreamRef.current = null;
      setScreenSharing(false);
      setError(getMediaErrorMessage(err, 'Could not start screen sharing'));
      setVoiceStatus(voiceJoinedRef.current ? 'Voice connected' : 'Voice idle');
    }
  }

  async function stopScreenShare() {
    const stream = screenStreamRef.current;
    if (!stream) return;
    removeStreamTracksFromPeers(stream);
    stream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    setVoiceStatus('Screen sharing stopped');
    await renegotiatePeers();
  }

  async function startCamera() {
    if (!voiceJoinedRef.current || !localStreamRef.current) {
      setError('Join a voice channel before turning on the camera');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser');
      return;
    }
    if (cameraStreamRef.current) return;

    try {
      setError('');
      setVoiceStatus('Requesting camera...');
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      cameraStreamRef.current = cameraStream;
      const [videoTrack] = cameraStream.getVideoTracks();
      if (videoTrack) videoTrack.onended = () => stopCamera().catch(() => {});
      Object.values(peersRef.current).forEach((peer) => addStreamTracksToPeer(peer, cameraStream));
      setCameraEnabled(true);
      setVoiceStatus('Camera on');
      await renegotiatePeers();
    } catch (err) {
      cameraStreamRef.current = null;
      setCameraEnabled(false);
      setError(getMediaErrorMessage(err, 'Could not access the camera'));
      setVoiceStatus(voiceJoinedRef.current ? 'Voice connected' : 'Voice idle');
    }
  }

  async function stopCamera() {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    removeStreamTracksFromPeers(stream);
    stream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraEnabled(false);
    setVoiceStatus('Camera off');
    await renegotiatePeers();
  }

  function toggleCamera() {
    if (cameraEnabled || cameraStreamRef.current) {
      stopCamera().catch(() => setError('Could not stop camera'));
      return;
    }
    startCamera().catch(() => setError('Could not access the camera'));
  }

  function cleanupVoice({ emitLeave = true } = {}) {
    if (screenStreamRef.current) {
      removeStreamTracksFromPeers(screenStreamRef.current);
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
    }
    if (cameraStreamRef.current) {
      removeStreamTracksFromPeers(cameraStreamRef.current);
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraEnabled(false);
    }
    if (emitLeave && socketRef.current?.connected) socketRef.current.emit('leave-voice');
    Object.keys(peersRef.current).forEach(closePeer);
    const tracks = new Set([
      ...(localStreamRef.current?.getTracks?.() || []),
      ...(rawLocalStreamRef.current?.getTracks?.() || [])
    ]);
    tracks.forEach((track) => track.stop());

    if (voiceAudioContextRef.current) {
      voiceAudioContextRef.current.close?.().catch(() => {});
    }

    localStreamRef.current = null;
    rawLocalStreamRef.current = null;
    voiceAudioContextRef.current = null;
    pendingIceCandidatesRef.current = {};
    setMicMuted(false);
    setVoiceJoined(false);
    setVoiceExpanded(false);
    setVoiceStatus('Voice idle');
    setParticipantVolumes({});
    setVoiceParticipants({});
    setRemoteStreams({});
  }

  async function handleJoinVoice() {
    if (!voiceChannelId) return setError('Choose a voice channel first');
    if (!navigator.mediaDevices?.getUserMedia) return setError('Voice is not supported in this browser');

    try {
      if (voiceJoined) {
        cleanupVoice();
        return;
      }

      setError('');
      setVoiceStatus('Requesting microphone...');
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_AUDIO_CONSTRAINTS,
        video: false
      });
      const { stream, audioContext } = noiseSuppressionEnabled
        ? await createEnhancedVoiceStream(rawStream)
        : { stream: rawStream, audioContext: null };

      rawLocalStreamRef.current = rawStream;
      localStreamRef.current = stream;
      voiceAudioContextRef.current = audioContext;
      setMicMuted(false);
      setVoiceJoined(true);
      setVoiceStatus(noiseSuppressionEnabled ? 'Noise suppression active' : 'Voice connected');
      socketRef.current?.emit('join-voice', { channelId: Number(voiceChannelId) });
    } catch {
      cleanupVoice({ emitLeave: false });
      setError('Could not access the microphone');
    }
  }

  function toggleMicrophone() {
    if (!localStreamRef.current) return;
    const nextMuted = !micMuted;
    const tracks = new Set([
      ...localStreamRef.current.getAudioTracks(),
      ...(rawLocalStreamRef.current?.getAudioTracks?.() || [])
    ]);
    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }

  async function testCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser');
      return;
    }

    try {
      setError('');
      setCameraTesting(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setVoiceStatus('Camera permission granted');
      window.setTimeout(() => {
        stream.getTracks().forEach((track) => track.stop());
        setCameraTesting(false);
      }, 1800);
    } catch {
      setCameraTesting(false);
      setError('Could not access the camera');
    }
  }

  function handleWindowAction(action) {
    const bridge = window.webcordDesktop || window.webcordWindow || window.electronAPI;
    const methodMap = {
      minimize: ['minimize', 'windowMinimize'],
      maximize: ['maximize', 'toggleMaximize', 'windowMaximize'],
      close: ['close', 'windowClose']
    };
    const method = methodMap[action]?.find((name) => typeof bridge?.[name] === 'function');
    if (method) bridge[method]();
  }

  const chatTitle =
    workspace === 'friends'
      ? 'Friends'
      : workspace === 'dm'
        ? `@ ${activeConversation?.user?.username || 'Direct messages'}`
        : activeTextChannel
          ? `# ${activeTextChannel.name}`
          : 'Server chat';
  const realtimeStatus = networkOnline ? socketStatus : 'offline';
  const realtimeLabel = SOCKET_STATUS_LABELS[realtimeStatus] || SOCKET_STATUS_LABELS.disconnected;
  const syncTime = lastRealtimeSync
    ? new Date(lastRealtimeSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const voiceStageParticipants = [
    {
      socketId: 'self',
      username: user?.username || 'You',
      user,
      muted: micMuted,
      status: screenSharing ? 'Sharing screen' : cameraEnabled ? 'Camera on' : micMuted ? 'Microphone muted' : 'Speaking ready'
    },
    ...Object.entries(voiceParticipants).map(([socketId, participant]) => ({
      socketId,
      username: participant.username || socketId.slice(0, 8),
      user: participant,
      muted: false,
      status: remoteStreams[socketId]?.getVideoTracks?.().length ? 'Video active' : 'Connected'
    }))
  ];

  if (!isAuthed) {
    return (
      <main className="auth-wrapper">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <span className="hero-badge brand-badge"><BrandLogo /> WebCord</span>
          <h1>Discord-style chat for the web.</h1>
          <p className="muted">Login to test live channels, DMs, friends, and voice.</p>
          <div className="auth-switch">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
          </div>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">{mode === 'login' ? 'Enter WebCord' : 'Create account'}</button>
        </form>
      </main>
    );
  }

  return (
    <>
      <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(e) => uploadProfileAsset('avatar', e.target.files?.[0])} />
      <input ref={bannerInputRef} type="file" accept="image/*" hidden onChange={(e) => uploadProfileAsset('banner', e.target.files?.[0])} />
      {isDesktopShell ? <DesktopTitleBar user={user} onOpenSettings={() => setShowSettingsModal(true)} onWindowAction={handleWindowAction} /> : null}
      <div className={mobileSidebarOpen ? 'mobile-overlay active' : 'mobile-overlay'} onClick={() => setMobileSidebarOpen(false)} />

      <main className={`${isMobile && mobileChatOpen ? 'app-shell mobile-chat-open' : 'app-shell'}${isDesktopShell ? ' desktop-shell' : ''}${voiceExpanded && voiceJoined ? ' voice-expanded-mode' : ''}`}>
        <aside className="rail">
          {[
            ['server', '#', 'Server'],
            ['friends', '◆', 'Friends'],
            ['dm', '@', 'DMs']
          ].map(([item, icon, label]) => (
            <button
              key={item}
              className={workspace === item ? 'rail-btn active' : 'rail-btn'}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => {
                setWorkspace(item);
                setMobileSidebarOpen(false);
                if (isMobile) setMobileChatOpen(false);
              }}
            >
              <span>{item === 'server' ? <BrandLogo className="rail-logo" /> : icon}</span>
            </button>
          ))}
        </aside>

        <aside className={mobileSidebarOpen ? 'sidebar mobile-open' : 'sidebar'}>
          <div className="mobile-telegram-header">
            <div className="mobile-telegram-brand">
              <span className="mobile-telegram-avatar">
                {user?.avatarUrl ? <img src={getAttachmentUrl(user.avatarUrl)} alt={user?.username || 'user'} /> : (user?.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong><BrandLogo className="inline-brand-logo" /> WebCord</strong>
                <p className="muted">{workspace === 'server' ? 'Chats' : workspace === 'friends' ? 'Friends' : 'Direct messages'}</p>
              </div>
            </div>
            <button className="icon-btn" type="button" title="Appearance" aria-label="Appearance" onClick={() => { setSettingsSection('appearance'); setShowSettingsModal(true); }}>⚙</button>
          </div>

          <div className="profile-card" style={{ backgroundImage: user?.bannerUrl ? `url(${getAttachmentUrl(user.bannerUrl)})` : undefined }}>
            <div className="profile-card-overlay">
              <span className="profile-avatar">
                {user?.avatarUrl ? <img src={getAttachmentUrl(user.avatarUrl)} alt={user?.username || 'user'} /> : (user?.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="profile-copy">
                <strong>{user?.username}</strong>
                <p className="muted">{user?.bio || 'Set your bio, avatar and banner.'}</p>
              </div>
              <button className="ghost-btn" type="button" onClick={() => { setSettingsSection('profile'); setShowSettingsModal(true); }}>Edit profile</button>
            </div>
          </div>

          <div className="sidebar-top">
            <div>
              <span className="hero-badge brand-badge"><BrandLogo /> Live Workspace</span>
              <h2>WebCord</h2>
              <p className="muted">{guild?.name || 'Workspace'} - {user?.username}</p>
            </div>
            <button className="icon-btn" type="button" title="Appearance" aria-label="Appearance" onClick={() => { setSettingsSection('appearance'); setShowSettingsModal(true); }}>⚙</button>
          </div>

          {workspace === 'server' ? (
            <div className="stack">
              <section className="sidebar-card">
                <p className="section-label">Text channels</p>
                {textChannels.length === 0 ? <p className="muted empty-copy">No text channels yet.</p> : textChannels.map((channel) => <button key={channel.id} className={String(channel.id) === String(channelId) ? 'channel-btn active' : 'channel-btn'} type="button" onClick={() => selectTextChannel(channel.id)}><span className="channel-icon">#</span><span>{channel.name}</span></button>)}
                <p className="section-label">Voice channels</p>
                {voiceChannels.length === 0 ? <p className="muted empty-copy">No voice channels yet.</p> : voiceChannels.map((channel) => <button key={channel.id} className={String(channel.id) === String(voiceChannelId) ? 'channel-btn active' : 'channel-btn'} type="button" onClick={() => selectVoiceChannel(channel.id)}><span className="channel-icon">◌</span><span>{channel.name}</span></button>)}
              </section>
              <section className="sidebar-card">
                <p className="section-label">Create channel</p>
                <form className="channel-form" onSubmit={handleCreateChannel}>
                  <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="New channel name" />
                  <div className="channel-actions-row">
                    <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}>
                      <option value="TEXT">TEXT</option>
                      <option value="VOICE">VOICE</option>
                    </select>
                    <button type="submit">Create</button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}

          {workspace === 'friends' ? (
            <div className="stack">
              <section className="sidebar-card">
                <p className="section-label">Add friend</p>
                <form className="channel-form" onSubmit={handleSendFriendRequest}>
                  <input value={friendUsername} onChange={(e) => setFriendUsername(e.target.value)} placeholder="Username" />
                  <button type="submit">Send request</button>
                </form>
              </section>
              <section className="sidebar-card">
                <p className="section-label">Incoming requests</p>
                {incomingRequests.length === 0 ? <p className="muted">No pending invites.</p> : incomingRequests.map((request) => <div key={request.id} className="friend-row"><strong>{request.user?.username}</strong><div className="inline-actions"><button type="button" onClick={() => handleFriendRequest(request.id, 'ACCEPT')}>Accept</button><button className="ghost-btn" type="button" onClick={() => handleFriendRequest(request.id, 'DECLINE')}>Decline</button></div></div>)}
              </section>
              <section className="sidebar-card">
                <p className="section-label">Outgoing requests</p>
                {outgoingRequests.length === 0 ? <p className="muted">Nothing pending.</p> : outgoingRequests.map((request) => <div key={request.id} className="friend-row compact"><strong>{request.user?.username}</strong><span className="request-pill">Pending</span></div>)}
              </section>
            </div>
          ) : null}

          {workspace === 'dm' ? (
            <div className="stack">
              <section className="sidebar-card">
                <p className="section-label">Direct messages</p>
                {social.conversations.length === 0 ? <p className="muted">Accept a friend request to unlock DMs.</p> : social.conversations.map((conversation) => <button key={conversation.id} className={String(conversation.id) === String(dmConversationId) ? 'channel-btn active conversation-btn' : 'channel-btn conversation-btn'} type="button" onClick={() => selectConversation(conversation.id)}><strong>@ {conversation.user?.username}</strong><span>{conversation.lastMessage?.content || conversation.lastMessage?.attachmentName || 'Start talking'}</span></button>)}
              </section>
              <section className="sidebar-card">
                <p className="section-label">Friends</p>
                {social.friends.length === 0 ? <p className="muted">No friends yet.</p> : social.friends.map((friend) => <div key={friend.id} className="friend-row"><strong>{friend.user?.username}</strong><button type="button" onClick={() => openConversation(friend.user.id)}>Open DM</button></div>)}
              </section>
            </div>
          ) : null}

          <div className="sidebar-bottom">
            <button type="button" onClick={handleJoinVoice}>{voiceJoined ? 'Leave voice' : `Join voice${activeVoiceChannel ? `: ${activeVoiceChannel.name}` : ''}`}</button>
            {voiceJoined ? <button type="button" onClick={toggleMicrophone}>{micMuted ? 'Unmute mic' : 'Mute mic'}</button> : null}
            {voiceJoined ? <button type="button" onClick={() => (screenSharing ? stopScreenShare() : startScreenShare())}>{screenSharing ? 'Stop stream' : 'Start stream'}</button> : null}
            {voiceJoined ? <button type="button" onClick={toggleCamera}>{cameraEnabled ? 'Camera off' : 'Camera on'}</button> : null}
            <button className="ghost-btn" type="button" disabled={voiceJoined} onClick={() => setNoiseSuppressionEnabled((prev) => !prev)}>Noise suppression: {noiseSuppressionEnabled ? 'On' : 'Off'}</button>
            <p className="voice-status">{voiceStatus}</p>
            <button className="danger" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </aside>

        <section className={`${voiceJoined ? 'chat-panel voice-mode' : 'chat-panel'}${voiceExpanded && voiceJoined ? ' voice-expanded' : ''}`}>
          <header className="chat-header">
            <div>
              {isMobile ? (
                <button className="mobile-sidebar-toggle" type="button" onClick={() => setMobileChatOpen(false)}>
                  Back
                </button>
              ) : (
                <button className="mobile-sidebar-toggle" type="button" onClick={() => setMobileSidebarOpen((prev) => !prev)}>
                  Menu
                </button>
              )}
              <strong>{chatTitle}</strong>
              <p className="muted">{workspace === 'friends' ? 'Requests, friends, and direct conversations.' : workspace === 'dm' ? 'Private messages synced through the backend.' : 'Server chat synced through the backend.'}</p>
            </div>
            <div className="header-badges">
              <span className={`live-pill realtime-pill ${realtimeStatus}`}>
                {realtimeLabel}{syncTime && realtimeStatus === 'connected' ? ` ${syncTime}` : ''}
              </span>
              <span className="live-pill">{social.friends.length} friends</span>
              {voiceJoined ? <span className="live-pill">Voice active</span> : null}
            </div>
          </header>
          {realtimeStatus !== 'connected' ? (
            <div className={`realtime-banner ${realtimeStatus}`}>
              {realtimeStatus === 'offline'
                ? 'Network is offline. Messages will refresh when connection returns.'
                : 'Realtime connection is recovering. WebCord keeps polling until live sync resumes.'}
            </div>
          ) : null}

          {voiceJoined ? (
            <VoiceStage
              activeVoiceChannel={activeVoiceChannel}
              localScreenStream={screenSharing ? screenStreamRef.current : null}
              localCameraStream={cameraEnabled ? cameraStreamRef.current : null}
              noiseSuppressionEnabled={noiseSuppressionEnabled}
              onLeave={handleJoinVoice}
              onToggleMic={toggleMicrophone}
              onToggleScreen={() => (screenSharing ? stopScreenShare() : startScreenShare())}
              onToggleCamera={toggleCamera}
              onToggleExpanded={() => setVoiceExpanded((prev) => !prev)}
              micMuted={micMuted}
              screenSharing={screenSharing}
              cameraEnabled={cameraEnabled}
              expanded={voiceExpanded}
              participants={voiceStageParticipants}
              remoteStreams={remoteStreams}
              voiceParticipants={voiceParticipants}
              voiceStatus={voiceStatus}
            />
          ) : null}

          {workspace === 'friends' ? (
            <div className="dashboard-grid">
              <section className="dashboard-card">
                <p className="section-label">Friends</p>
                {social.friends.length === 0 ? <p className="muted">Your friend list is empty.</p> : social.friends.map((friend) => <div key={friend.id} className="friend-row"><strong>{friend.user?.username}</strong><button type="button" onClick={() => openConversation(friend.user.id)}>Message</button></div>)}
              </section>
              <section className="dashboard-card">
                <p className="section-label">Direct conversations</p>
                {social.conversations.length === 0 ? <p className="muted">No conversations yet.</p> : social.conversations.map((conversation) => <button key={conversation.id} className="channel-btn conversation-btn" type="button" onClick={() => selectConversation(conversation.id)}><strong>@ {conversation.user?.username}</strong><span>{conversation.lastMessage?.content || conversation.lastMessage?.attachmentName || 'Conversation ready'}</span></button>)}
              </section>
            </div>
          ) : (
            <>
              <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
                {messages.length === 0 ? <div className="empty-state"><h3>{workspace === 'dm' ? 'No direct messages yet' : 'No messages yet'}</h3><p className="muted">{workspace === 'dm' ? 'This thread is ready.' : 'Start the conversation in this channel.'}</p></div> : messages.map((message) => <MessageItem key={message.id} message={message} currentUserId={user?.id} onAvatarClick={setViewedProfile} />)}
                <div ref={endRef} />
              </div>
              <form className="message-form composer" onSubmit={sendMessage}>
                <input ref={fileInputRef} type="file" onChange={handleFileSelect} hidden />
                <button className="icon-btn composer-btn" type="button" onClick={() => fileInputRef.current?.click()}>+</button>
                <div className="emoji-wrapper">
                  <button className="icon-btn composer-btn" type="button" onClick={() => setShowEmojiPicker((prev) => !prev)}>:)</button>
                  {showEmojiPicker ? (
                    <div className="emoji-popover">
                      <Suspense fallback={<div className="emoji-loading">Loading...</div>}>
                        <EmojiPicker theme="dark" onEmojiSelect={(emoji) => { setNewMessage((prev) => `${prev}${emoji.native}`); setShowEmojiPicker(false); }} />
                      </Suspense>
                    </div>
                  ) : null}
                </div>
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={workspace === 'dm' ? 'Message your friend' : 'Send a message'} />
                <button className="composer-send" type="submit" disabled={uploading || (!newMessage.trim() && !pendingAttachment)}>Send</button>
              </form>
            </>
          )}

          <div className="panel-footer">
            {pendingAttachment ? (
              <div className="attachment-preview">
                <span className="attachment-dot">{pendingAttachment.type === 'IMAGE' ? 'IMG' : pendingAttachment.type === 'VIDEO' ? 'VID' : 'FILE'}</span>
                <p className="muted">Attached: {pendingAttachment.name}</p>
                <button className="icon-btn" type="button" aria-label="Remove attachment" title="Remove attachment" onClick={() => setPendingAttachment(null)}>×</button>
              </div>
            ) : null}
            {uploading ? <p className="muted">Uploading...</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </div>

          <div className="hidden-audio-host" aria-hidden="true">
            {Object.entries(remoteStreams).map(([socketId, stream]) => (
              stream?.getAudioTracks?.().length ? (
                <audio
                  key={socketId}
                  autoPlay
                  playsInline
                  ref={(node) => {
                    if (!node) {
                      delete remoteAudioRef.current[socketId];
                      return;
                    }
                    remoteAudioRef.current[socketId] = node;
                    if (node.srcObject !== stream) {
                      node.srcObject = stream;
                    }
                    node.volume = Math.min(1, ((participantVolumes[socketId] ?? 100) / 100) * (outputVolume / 100));
                    node.play?.().catch(() => {});
                  }}
                />
              ) : null
            ))}
          </div>
        </section>

        <aside className="activity-panel">
          <section>
            <p className="section-label">Active now</p>
            <div className="activity-card">
              <UserAvatar user={user} />
              <div>
                <strong>{user?.username}</strong>
                <span>{voiceJoined ? `In ${activeVoiceChannel?.name || 'voice'}` : 'Browsing WebCord'}</span>
              </div>
            </div>
          </section>
          <section>
            <p className="section-label">Friends</p>
            {social.friends.length === 0 ? <p className="muted">No friends online yet.</p> : social.friends.slice(0, 6).map((friend) => (
              <button key={friend.id} className="activity-card interactive" type="button" onClick={() => openConversation(friend.user.id)}>
                <UserAvatar user={friend.user} />
                <div>
                  <strong>{friend.user?.username}</strong>
                  <span>Open direct message</span>
                </div>
              </button>
            ))}
          </section>
        </aside>
      </main>

      <SettingsModal
        open={showSettingsModal}
        activeSection={settingsSection}
        user={user}
        draft={profileDraft}
        theme={theme}
        inputVolume={inputVolume}
        outputVolume={outputVolume}
        micMuted={micMuted}
        cameraEnabled={cameraEnabled}
        cameraTesting={cameraTesting}
        noiseSuppressionEnabled={noiseSuppressionEnabled}
        avatarUploading={avatarUploading}
        bannerUploading={bannerUploading}
        onClose={() => setShowSettingsModal(false)}
        onSectionChange={setSettingsSection}
        onDraftChange={setProfileDraft}
        onUploadAvatar={() => avatarInputRef.current?.click()}
        onUploadBanner={() => bannerInputRef.current?.click()}
        onSaveProfile={() => saveProfile().catch((err) => setError(err.message))}
        onThemeChange={setTheme}
        onThemeReset={() => setTheme(DEFAULT_THEME)}
        onInputVolumeChange={setInputVolume}
        onOutputVolumeChange={setOutputVolume}
        onToggleMic={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onTestCamera={testCamera}
        onToggleNoiseSuppression={() => setNoiseSuppressionEnabled((prev) => !prev)}
        onLogout={handleLogout}
      />
      <UserProfileModal
        open={Boolean(viewedProfile)}
        profile={viewedProfile}
        relationshipLabel={getRelationshipInfo(viewedProfile).label}
        canAddFriend={getRelationshipInfo(viewedProfile).canAddFriend}
        onAddFriend={() => handleAddFriendFromProfile().catch((err) => setError(err.message))}
        onClose={() => setViewedProfile(null)}
      />
    </>
  );
}
