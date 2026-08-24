import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { io } from 'socket.io-client';
import {
  TbArrowLeft, TbArrowsMaximize, TbArrowsMinimize, TbBolt, TbBrowser, TbCameraRotate,
  TbBookmark, TbCircleCheck, TbCircleDashed, TbCopy, TbDotsVertical, TbHandStop, TbHash, TbMenu2, TbMicrophone, TbMicrophoneOff,
  TbMinus, TbMoodSmile, TbMusic, TbPalette, TbPaperclip, TbPhone, TbPhoneOff, TbPlayerPause,
  TbPlayerPlay, TbPlayerStop, TbPlus, TbPinned, TbScreenShare, TbSearch, TbSend2, TbSettings,
  TbSun, TbMoon, TbShield, TbVideo, TbVideoOff, TbVolume, TbVolumeOff, TbWaveSine, TbX
} from 'react-icons/tb';
import {
  MdAdd, MdArrowBackIosNew, MdBookmarkBorder, MdClose, MdContentCopy, MdFullscreen, MdFullscreenExit, MdMenu,
  MdMoreVert, MdOutlineAttachFile, MdOutlineAutoStories, MdOutlineBackHand, MdOutlineBolt,
  MdOutlineCall, MdOutlineCallEnd, MdOutlineCameraswitch, MdOutlineCheckCircle,
  MdOutlineChatBubbleOutline, MdOutlineGraphicEq, MdOutlineGroup, MdOutlineMic,
  MdOutlineDarkMode, MdOutlineLightMode, MdOutlineMicOff, MdOutlineMusicNote, MdOutlinePalette, MdOutlinePublic, MdOutlineScreenShare,
  MdOutlineSearch, MdOutlineSend, MdOutlineSentimentSatisfiedAlt,
  MdOutlineSettings, MdOutlineShield, MdOutlineTag, MdOutlineVideocam, MdOutlineVideocamOff,
  MdOutlineVolumeOff, MdOutlineVolumeUp, MdOutlineWallpaper, MdPause,
  MdOutlinePushPin, MdPlayArrow, MdRemove, MdStop
} from 'react-icons/md';
import {
  PiArrowLeft, PiBookmarkSimple, PiBrowser, PiCameraRotate, PiChatCircleDots, PiCheckCircle, PiCopy,
  PiCornersIn, PiCornersOut, PiDotsThreeVertical, PiGear, PiHash, PiImageSquare,
  PiHand, PiImagesSquare, PiList, PiMagnifyingGlass, PiMicrophone, PiMicrophoneSlash, PiMoon,
  PiMinus, PiMonitorArrowUp, PiMusicNotes, PiPalette, PiPaperPlaneTilt,
  PiPaperclip, PiPause, PiPhoneCall, PiPhoneSlash, PiPlay, PiPlus, PiPushPin, PiSignOut,
  PiShield, PiSmiley, PiSpeakerHigh, PiSpeakerSlash, PiStop, PiSun, PiUserCircle, PiUsersThree,
  PiVideoCamera, PiVideoCameraSlash, PiWaveform, PiX
} from 'react-icons/pi';

gsap.registerPlugin(useGSAP);

const IconFamilyContext = React.createContext('telegram');
const APP_VERSION = '4.3.0';
const SessionCenter = lazy(() => import('./reliability-panels.jsx').then((module) => ({ default: module.SessionCenter })));
const ReleaseBanner = lazy(() => import('./release-banner.jsx'));

const REMOTE_ORIGIN = import.meta.env.VITE_REMOTE_ORIGIN || 'https://webcordes.ru';
const DOWNLOAD_PAGE_URL = `${REMOTE_ORIGIN}/#download`;
const DOWNLOAD_URLS = {
  windows: '/downloads/windows',
  android: '/downloads/android',
  ios: '/downloads/ios'
};
const IS_TAURI_CLIENT = Boolean(window.__TAURI__?.window || window.__TAURI_INTERNALS__);
const IS_NATIVE_CLIENT = Boolean(
  IS_TAURI_CLIENT ||
  window.webcordDesktop ||
  window.webcordWindow ||
  window.electronAPI ||
  window.Capacitor?.isNativePlatform?.() ||
  /\b(WebCordTauri|WebCordDesktop|WebCordAndroid|WebCordiOS|Electron)\b/i.test(navigator.userAgent)
);
const API_URL = import.meta.env.VITE_API_URL || (IS_NATIVE_CLIENT ? `${REMOTE_ORIGIN}/api` : '/api');
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (API_URL.startsWith('http') ? new URL(API_URL).origin : window.location.origin);
const SOCKET_TRANSPORTS = IS_NATIVE_CLIENT ? ['polling', 'websocket'] : ['websocket', 'polling'];
const MESSAGE_POLL_INTERVAL_MS = 6000;
const CIRCLE_RECORDING_MAX_SECONDS = 60;
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
  messages: 'webcord_message_cache_v1',
  settings: 'webcord_client_settings_v1',
  folders: 'webcord_custom_folders_v1',
  chatPreferences: 'webcord_chat_preferences_v2',
  chatDrafts: 'webcord_chat_drafts_v2',
  outbox: 'webcord_message_outbox_v1',
  colorMode: 'webcord_color_mode'
};
const ADMIN_PATH = '/adminka';
const ADMIN_PATHS = new Set([ADMIN_PATH, '/admin']);

const PRESETS = {
  'Telegram Focus': {
    id: 'telegram-focus',
    bg: '#101820', panel: '#18232f', accent: '#3390ec', text: '#f5f7fa', mode: 'telegram',
    iconFamily: 'telegram', motion: 'quick', density: 'compact', surface: 'flat',
    description: 'Fast, compact and conversation-first',
    behavior: 'Quick fades, sliding selection and restrained bubbles'
  },
  'Material Motion': {
    id: 'material-motion',
    bg: '#141218', panel: '#211f26', accent: '#d0bcff', text: '#f7f2fa', mode: 'material',
    iconFamily: 'material', motion: 'expressive', density: 'comfortable', surface: 'tonal',
    description: 'Expressive shapes and Google motion',
    behavior: 'Container transforms, state layers and emphasized easing'
  },
  'Adaptive Atmosphere': {
    id: 'adaptive-atmosphere',
    bg: '#07111d', panel: '#172337', accent: '#76e4ff', text: '#f7fbff', mode: 'liquid',
    iconFamily: 'atmosphere', motion: 'spring', density: 'comfortable', surface: 'glass',
    description: 'Reactive depth and calm ambient light',
    behavior: 'Spring depth, pointer-reactive light and breathing voice states'
  }
};

const LIGHT_PALETTES = {
  telegram: { bg: '#edf3f8', panel: '#ffffff', accent: '#168acd', text: '#17212b' },
  material: { bg: '#fffbfe', panel: '#f4eff7', accent: '#6750a4', text: '#1d1b20' },
  liquid: { bg: '#eef8fb', panel: '#ffffff', accent: '#006a78', text: '#102027' }
};

const COLOR_MODES = ['system', 'dark', 'light'];

const DEFAULT_THEME = PRESETS['Telegram Focus'];

function hydrateTheme(value) {
  const stored = value && typeof value === 'object' ? value : null;
  const match = Object.values(PRESETS).find((preset) => preset.id === stored?.id || preset.mode === stored?.mode) || DEFAULT_THEME;
  if (!stored) return match;
  return {
    ...match,
    ...stored,
    id: match.id,
    mode: match.mode,
    iconFamily: match.iconFamily,
    motion: match.motion,
    density: match.density,
    surface: match.surface,
    description: match.description,
    behavior: match.behavior
  };
}

const DEFAULT_PROFILE_ACCENT = '#7c5cff';
const PROFILE_ACCENTS = ['#7c5cff', '#4f8cff', '#31e4d1', '#ff6b8a', '#f2b84b', '#63d471'];
const EMPTY_SOCIAL = { friends: [], requests: [], conversations: [], blockedUserIds: [] };
const DEFAULT_CLIENT_SETTINGS = {
  notificationsEnabled: true,
  notificationMode: 'all',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  autoDownloadMedia: true,
  launchAtLogin: false,
  minimizeToTray: true,
  micDeviceId: '',
  cameraDeviceId: '',
  outputDeviceId: '',
  chatWallpaper: '',
  chatWallpaperName: '',
  chatWallpaperDim: 42
};
const DEFAULT_VOICE_QUALITY = {
  label: 'Idle',
  rttMs: 0,
  jitterMs: 0,
  packetLossPercent: 0,
  inboundKbps: 0,
  outboundKbps: 0,
  usingRelay: false,
  speaking: false
};
const REPORT_REASONS = ['Harassment', 'Spam', 'Illegal content', 'Impersonation', 'Other'];
const MEDIA_PLAY_EVENT = 'webcord:media-play';

function getNativeBridge() {
  const existingBridge = window.webcordDesktop || window.webcordWindow || window.electronAPI;
  if (existingBridge) return existingBridge;

  const tauri = window.__TAURI__;
  const appWindow = tauri?.window?.getCurrentWindow?.();
  if (!tauri || !appWindow) return null;

  const notifications = tauri.notification;
  const opener = tauri.opener;
  const deepLink = tauri.deepLink || tauri.deep_link || tauri.deepLinking;

  return {
    platform: 'tauri',
    minimize: () => appWindow.minimize(),
    maximize: () => appWindow.toggleMaximize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
    notify: async (payload = {}) => {
      if (notifications?.isPermissionGranted && notifications?.requestPermission && notifications?.sendNotification) {
        let allowed = await notifications.isPermissionGranted();
        if (!allowed) {
          allowed = (await notifications.requestPermission()) === 'granted';
        }
        if (allowed) notifications.sendNotification({ title: payload.title || 'WebCord', body: payload.body || '' });
        return allowed;
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(payload.title || 'WebCord', { body: payload.body || '' });
        return true;
      }

      return false;
    },
    checkUpdates: () => (opener?.openUrl ? opener.openUrl(DOWNLOAD_PAGE_URL) : window.open(DOWNLOAD_PAGE_URL, '_blank', 'noopener,noreferrer')),
    setBadge: (count = 0) => Promise.resolve(Math.max(0, Number(count) || 0)),
    onDeepLink: (callback) => {
      let closed = false;
      const unlisteners = [];
      const handleUrls = (urls) => {
        const list = Array.isArray(urls) ? urls : [urls];
        list.filter(Boolean).forEach((url) => callback(String(url)));
      };

      deepLink?.getCurrent?.().then((urls) => {
        if (!closed && urls) handleUrls(urls);
      }).catch(() => {});

      deepLink?.onOpenUrl?.((urls) => {
        if (!closed) handleUrls(urls);
      }).then((unlisten) => unlisteners.push(unlisten)).catch(() => {});

      appWindow.listen?.('deep-link', (event) => {
        if (!closed) handleUrls(event.payload);
      }).then((unlisten) => unlisteners.push(unlisten)).catch(() => {});

      return () => {
        closed = true;
        unlisteners.forEach((unlisten) => unlisten?.());
      };
    }
  };
}

function getDisplayName(user) {
  return user?.displayName?.trim() || user?.username || 'User';
}

function getUsernameTag(user) {
  return user?.username ? `@${user.username}` : '@webcord';
}

function splitTrackTitle(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return { title: 'Profile track', artist: 'WebCord' };
  const parts = clean.split(/\s+-\s+|\s+–\s+/).map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
  return { title: clean, artist: 'Profile playlist' };
}

function getStoryMusicLabel(story = {}) {
  const title = String(story.musicTitle || '').trim();
  const artist = String(story.musicArtist || '').trim();
  const attachment = String(story.musicAttachment || '').trim();
  if (artist && title) return `${artist} - ${title}`;
  if (title) return title;
  if (artist) return artist;
  return attachment || 'Story music';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function getConversationTitle(conversation = {}) {
  if (conversation.type === 'GROUP') return conversation.title || 'Group chat';
  return getDisplayName(conversation.user);
}

function getConversationSubtitle(conversation = {}) {
  if (conversation.type === 'GROUP') {
    const count = Number(conversation.memberCount || conversation.members?.length || 0);
    return `${count || 1} members`;
  }
  return getUsernameTag(conversation.user);
}

function normalizeProfileAccent(value) {
  const next = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(next) ? next.toLowerCase() : DEFAULT_PROFILE_ACCENT;
}

function getProfileStyle(profile = {}) {
  const safeProfile = profile || {};
  return { '--profile-accent': normalizeProfileAccent(safeProfile.accentColor) };
}

function getProfileBannerStyle(profile = {}) {
  const safeProfile = profile || {};
  return {
    ...getProfileStyle(safeProfile),
    backgroundImage: safeProfile.bannerUrl ? `url(${getAttachmentUrl(safeProfile.bannerUrl)})` : undefined
  };
}

function getGuildCoverStyle(guild = {}) {
  const safeGuild = guild || {};
  const accent = normalizeProfileAccent(safeGuild.accentColor);
  return {
    '--guild-accent': accent,
    backgroundImage: safeGuild.bannerUrl ? `url(${getAttachmentUrl(safeGuild.bannerUrl)})` : undefined
  };
}

function createProfileDraft(user = {}) {
  return {
    displayName: user.displayName || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    bannerUrl: user.bannerUrl || '',
    statusText: user.statusText || 'Online',
    favoriteTrack: user.favoriteTrack || '',
    favoriteTrackUrl: user.favoriteTrackUrl || '',
    favoriteTrackName: user.favoriteTrackName || '',
    accentColor: normalizeProfileAccent(user.accentColor)
  };
}

function normalizeUserRole(value) {
  const role = String(value || 'USER').trim().toUpperCase();
  return ['USER', 'ADMIN', 'OWNER'].includes(role) ? role : 'USER';
}

function canManageChannels(user) {
  return ['ADMIN', 'OWNER'].includes(normalizeUserRole(user?.role)) || Boolean(user?.isAdmin);
}

function canManageUserRoles(user) {
  return normalizeUserRole(user?.role) === 'OWNER' || Boolean(user?.canManageRoles);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function mapDownloads(downloads = []) {
  return Object.fromEntries(
    (Array.isArray(downloads) ? downloads : []).map((download) => [download.platform, download])
  );
}

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

function createVoiceAudioConstraints(deviceId = '', includeVoiceTuning = true) {
  const constraints = includeVoiceTuning ? { ...VOICE_AUDIO_CONSTRAINTS } : {};
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}

function isMediaPermissionDenied(error) {
  return error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
}

function createCircleVideoConstraints(deviceId = '', facingMode = 'user', includeQuality = true) {
  const constraints = includeQuality
    ? {
        width: { ideal: 720 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 1 },
        frameRate: { ideal: 30 },
        facingMode: { ideal: facingMode }
      }
    : { facingMode: { ideal: facingMode } };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}

async function requestVoiceAudioStream(deviceId = '') {
  const attempts = [
    { audio: createVoiceAudioConstraints(deviceId, true), video: false },
    { audio: createVoiceAudioConstraints('', true), video: false },
    { audio: true, video: false }
  ];
  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (isMediaPermissionDenied(error)) break;
    }
  }

  throw lastError || new Error('Could not access the microphone');
}

async function requestCircleRecordingStream({ micDeviceId = '', cameraDeviceId = '', facingMode = 'user' } = {}) {
  const attempts = [
    {
      audio: createVoiceAudioConstraints(micDeviceId, true),
      video: createCircleVideoConstraints(cameraDeviceId, facingMode, true)
    },
    {
      audio: createVoiceAudioConstraints('', true),
      video: createCircleVideoConstraints('', facingMode, true)
    },
    {
      audio: true,
      video: createCircleVideoConstraints('', facingMode, false)
    },
    {
      audio: false,
      video: createCircleVideoConstraints('', facingMode, false)
    }
  ];
  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not access the camera');
}

async function requestCameraStream(cameraDeviceId = '', facingMode = 'user') {
  const attempts = [
    { video: createCircleVideoConstraints(cameraDeviceId, facingMode, true), audio: false },
    { video: createCircleVideoConstraints('', facingMode, true), audio: false },
    { video: true, audio: false }
  ];
  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not access the camera');
}

async function requestMediaDeviceProbe({ micDeviceId = '', cameraDeviceId = '' } = {}) {
  const attempts = [
    {
      audio: createVoiceAudioConstraints(micDeviceId, true),
      video: createCircleVideoConstraints(cameraDeviceId, 'user', false)
    },
    { audio: true, video: true },
    { audio: true, video: false },
    { audio: false, video: true }
  ];
  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not access media devices');
}

function readClientSettings() {
  try {
    return { ...DEFAULT_CLIENT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEYS.settings) || '{}') || {}) };
  } catch {
    return DEFAULT_CLIENT_SETTINGS;
  }
}

function uniqueStringList(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => String(item)).filter(Boolean))];
}

function getFolderOwnerKey(user = {}) {
  return String(user?.id || user?.username || 'local');
}

function getCustomFoldersKey(user = {}) {
  return `${KEYS.folders}:${getFolderOwnerKey(user)}`;
}

function normalizeCustomFolder(folder = {}) {
  const name = String(folder.name || '').trim().slice(0, 32);
  return {
    id: String(folder.id || `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name,
    channelIds: uniqueStringList(folder.channelIds),
    friendIds: uniqueStringList(folder.friendIds)
  };
}

function readCustomFolders(user = {}) {
  try {
    const list = JSON.parse(localStorage.getItem(getCustomFoldersKey(user)) || '[]');
    return (Array.isArray(list) ? list : []).map(normalizeCustomFolder).filter((folder) => folder.name);
  } catch {
    return [];
  }
}

function writeCustomFolders(user = {}, folders = []) {
  localStorage.setItem(getCustomFoldersKey(user), JSON.stringify(folders.map(normalizeCustomFolder).filter((folder) => folder.name)));
}

function createCustomFolder(name) {
  return normalizeCustomFolder({
    id: `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    channelIds: [],
    friendIds: []
  });
}

function getIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrls = String(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (turnUrls.length > 0) {
    const username = import.meta.env.VITE_TURN_USERNAME || '';
    const credential = import.meta.env.VITE_TURN_CREDENTIAL || '';
    servers.push(username || credential ? { urls: turnUrls, username, credential } : { urls: turnUrls });
  }

  return servers;
}

function getScopeKey(type, id) {
  return `${type}:${id || 'none'}`;
}

function readStoredObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function renderRichInline(value, keyPrefix = 'rich') {
  return String(value || '').split(/(\*\*[^*]+\*\*|`[^`]+`|\|\|[^|]+\|\|)/g).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('||') && part.endsWith('||')) return <span className="message-spoiler" tabIndex="0" key={key}>{part.slice(2, -2)}</span>;
    return part;
  });
}

function RichMessageText({ content }) {
  const blocks = String(content || '').split(/```/);
  return (
    <div className="message-rich-text">
      {blocks.map((block, index) => index % 2
        ? <pre key={`code-${index}`}><code>{block.trim()}</code></pre>
        : block.split('\n').map((line, lineIndex) => line.startsWith('>')
          ? <blockquote key={`quote-${index}-${lineIndex}`}>{renderRichInline(line.replace(/^>\s?/, ''), `quote-${index}-${lineIndex}`)}</blockquote>
          : <p key={`line-${index}-${lineIndex}`}>{renderRichInline(line, `line-${index}-${lineIndex}`)}</p>))}
    </div>
  );
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

function openRecordingDraftStore() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open('webcord-recording-drafts', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('drafts')) {
        request.result.createObjectStore('drafts', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeRecordingDraft(draft) {
  const db = await openRecordingDraftStore();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put({ id: 'latest', ...draft });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readRecordingDraft() {
  const db = await openRecordingDraftStore();
  if (!db) return null;
  const draft = await new Promise((resolve, reject) => {
    const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('latest');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return draft;
}

async function clearRecordingDraft() {
  const db = await openRecordingDraftStore();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').delete('latest');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
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
  if (!res.ok) {
    const error = new Error(payload?.error || 'Request failed');
    error.status = res.status;
    error.code = payload?.code || '';
    throw error;
  }
  return payload;
}

function uploadFormDataWithProgress(path, formData, token, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    request.open('POST', `${API_URL}${path}`);
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText || 'null');
      } catch {
        // A non-JSON response is handled as a regular upload failure below.
      }
      if (request.status >= 200 && request.status < 300) {
        signal?.removeEventListener?.('abort', abort);
        onProgress?.(100);
        resolve(payload);
        return;
      }
      const error = new Error(payload?.error || 'Upload failed');
      error.status = request.status;
      error.code = payload?.code || '';
      reject(error);
    });
    request.addEventListener('error', () => {
      signal?.removeEventListener?.('abort', abort);
      reject(new Error('Upload failed because the network connection was interrupted'));
    });
    request.addEventListener('abort', () => {
      signal?.removeEventListener?.('abort', abort);
      reject(new Error('Upload was cancelled'));
    });
    request.send(formData);
  });
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function syncWebPushSubscription(token, settings, enabled) {
  if (!token || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { enabled: false, reason: 'unsupported' };
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!enabled) {
    if (subscription) {
      await apiFetch('/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }, token).catch(() => {});
      await subscription.unsubscribe();
    }
    return { enabled: false };
  }

  const vapid = await apiFetch('/push/vapid-public-key', {}, token);
  if (!vapid?.enabled || !vapid.publicKey) return { enabled: false, reason: 'server-disabled' };
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { enabled: false, reason: 'permission' };
  }
  subscription ||= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey)
  });
  await apiFetch('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      preferences: {
        notificationMode: settings.notificationMode,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
        timezoneOffset: new Date().getTimezoneOffset()
      }
    })
  }, token);
  return { enabled: true };
}

function normalizeAppPath(pathname = window.location.pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '');
  return normalized || '/';
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

function isWithinQuietHours(settings, now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(settings.quietHoursStart);
  const end = toMinutes(settings.quietHoursEnd);
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
}

function showClientNotification(title, body, { direct = false, mention = false, muted = false } = {}) {
  const settings = readClientSettings();
  if (!settings.notificationsEnabled || muted || isWithinQuietHours(settings)) return;
  if (settings.notificationMode === 'mentions' && !mention && !direct) return;
  if (!IS_NATIVE_CLIENT || !document.hidden) return;
  const bridge = getNativeBridge();
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
  return [...list].filter((message) => !message?.deletedAt).sort((left, right) => {
    const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDiff || Number(left.id) - Number(right.id);
  });
}

function mergeMessage(list, item) {
  if (!item?.id) return list;
  if (item.deletedAt) return list.filter((entry) => String(entry.id) !== String(item.id));
  if (list.some((entry) => String(entry.id) === String(item.id))) return list;
  return sortMessages([...list, item]);
}

function replaceMessage(list, item) {
  if (!item?.id) return list;
  if (item.deletedAt) return list.filter((entry) => String(entry.id) !== String(item.id));
  if (!list.some((entry) => String(entry.id) === String(item.id))) return mergeMessage(list, item);
  return sortMessages(list.map((entry) => (String(entry.id) === String(item.id) ? { ...entry, ...item } : entry)));
}

function getAuthorColorIndex(author) {
  const source = String(author?.id || author?.username || author?.displayName || 'webcord');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 12;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥', '👏', '😮'];

function isEmojiOnlyMessage(content = '') {
  const value = String(content).trim();
  if (!value || value.length > 24 || /\s/.test(value)) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D)+$/u.test(value);
}

function getFirstMessageUrl(content = '') {
  const match = String(content).match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    return new URL(match[0]);
  } catch {
    return null;
  }
}

function getMessageCopyText(message) {
  return [message?.content, message?.transcript, message?.attachmentUrl]
    .filter(Boolean)
    .join('\n');
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
  if (isMediaPermissionDenied(error)) {
    return 'Microphone or camera permission is blocked. Click the icon in the address bar and allow access.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No matching media device was found';
  }
  if (error?.name === 'NotReadableError') {
    return 'The media device is already in use';
  }
  if (error?.name === 'OverconstrainedError') {
    return 'The selected media device is unavailable. Refresh devices or use the default device.';
  }
  return fallback;
}

const AUDIO_RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const VIDEO_RECORDER_MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function getSupportedRecorderMimeType(candidates) {
  if (!window.MediaRecorder?.isTypeSupported) return '';
  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) || '';
}

function getAttachmentKind(message = {}) {
  const type = String(message.attachmentType || '').toUpperCase();
  const name = String(message.attachmentName || message.attachmentUrl || '').toLowerCase();

  if (type === 'IMAGE') return 'IMAGE';
  if (type === 'AUDIO') return 'AUDIO';
  if (type === 'CIRCLE_VIDEO') return 'CIRCLE_VIDEO';
  if (type === 'VIDEO') {
    return /circle-video|round-video|video-note|video_message|video-message|webcord-circle/.test(name)
      ? 'CIRCLE_VIDEO'
      : 'VIDEO';
  }
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(name)) return 'IMAGE';
  if (/\.(mp3|m4a|ogg|oga|wav|webm)$/i.test(name) && /voice|audio/.test(name)) return 'AUDIO';
  if (/\.(mp4|webm|mov|m4v)$/i.test(name)) return /circle|round|note/.test(name) ? 'CIRCLE_VIDEO' : 'VIDEO';
  return 'FILE';
}

function getAttachmentBadge(kind) {
  return {
    IMAGE: 'IMG',
    VIDEO: 'VID',
    AUDIO: 'VOICE',
    CIRCLE_VIDEO: 'CIRCLE',
    FILE: 'FILE'
  }[kind] || 'FILE';
}

function formatShortDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60).toString().padStart(2, '0');
  const rest = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatMediaDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function isAudioFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return Boolean(file?.type?.startsWith('audio/')) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(name);
}

function isStoryFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return Boolean(file?.type?.startsWith('image/') || file?.type?.startsWith('video/')) || /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|m4v)$/i.test(name);
}

function getStoryMediaType(fileOrUrl = '') {
  const type = String(fileOrUrl?.type || '').toLowerCase();
  const name = String(fileOrUrl?.name || fileOrUrl || '').toLowerCase();
  return type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(name) ? 'VIDEO' : 'IMAGE';
}

function tuneOpusDescription(description) {
  if (!description?.sdp) return description;

  const lines = description.sdp.split('\r\n');
  const opusLineIndex = lines.findIndex((line) => line.toLowerCase().includes('opus/48000'));
  if (opusLineIndex === -1) return description;

  const payloadType = lines[opusLineIndex].match(/^a=rtpmap:(\d+)/)?.[1];
  if (!payloadType) return description;

  const desiredParams = {
    minptime: '10',
    useinbandfec: '1',
    usedtx: '0',
    maxaveragebitrate: '64000',
    maxplaybackrate: '48000',
    stereo: '0',
    'sprop-stereo': '0'
  };
  const fmtpIndex = lines.findIndex((line) => line.startsWith(`a=fmtp:${payloadType}`));
  const toFmtpValue = (line = '') => {
    const [, value = ''] = line.split(/\s+(.+)/);
    const params = new Map();
    value
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const [key, rawValue = ''] = item.split('=');
        if (key) params.set(key, rawValue);
      });
    Object.entries(desiredParams).forEach(([key, value]) => params.set(key, value));
    return [...params.entries()].map(([key, value]) => `${key}=${value}`).join(';');
  };

  if (fmtpIndex >= 0) {
    lines[fmtpIndex] = `a=fmtp:${payloadType} ${toFmtpValue(lines[fmtpIndex])}`;
  } else {
    lines.splice(opusLineIndex + 1, 0, `a=fmtp:${payloadType} ${toFmtpValue()}`);
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

function ThemeSystemCard({ name, preset, active, onSelect }) {
  return (
    <button
      className={active ? 'theme-system-card active' : 'theme-system-card'}
      type="button"
      style={{
        '--preset-bg': preset.bg,
        '--preset-panel': preset.panel,
        '--preset-accent': preset.accent,
        '--preset-text': preset.text
      }}
      onClick={() => onSelect(preset)}
      aria-pressed={active}
      data-preview-mode={preset.mode}
    >
      <span className="theme-system-visual" aria-hidden="true">
        <span className="theme-system-rail"><AppIcon name="menu" size={17} family={preset.iconFamily} /></span>
        <span className="theme-system-list"><i /><i /><i /></span>
        <span className="theme-system-chat"><i /><i /></span>
      </span>
      <span className="theme-system-copy">
        <span className="theme-system-title"><AppIcon name="zap" size={17} family={preset.iconFamily} /><strong>{name}</strong></span>
        <small>{preset.description}</small>
        <span className="theme-system-traits">
          <em>{preset.iconFamily} icons</em><em>{preset.motion} motion</em><em>{preset.surface}</em>
        </span>
      </span>
      <span className="theme-system-check" aria-hidden="true"><AppIcon name={active ? 'check' : 'plus'} size={16} family={preset.iconFamily} /></span>
    </button>
  );
}

function ColorModePicker({ value, onChange }) {
  return (
    <div className="color-mode-picker" role="group" aria-label="Color mode">
      {COLOR_MODES.map((mode) => (
        <button
          key={mode}
          className={value === mode ? 'active' : ''}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          <AppIcon name={mode === 'system' ? 'browser' : mode === 'light' ? 'sun' : 'moon'} size={17} />
          {mode[0].toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ThemeModal({ open, theme, colorMode, onClose, onThemeChange, onColorModeChange, onReset }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop theme-studio-backdrop" onClick={onClose}>
      <div className="modal-card theme-studio-drawer" role="dialog" aria-modal="true" aria-label="Theme Studio" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Theme Studio</h3>
            <p className="muted">Icons, motion, geometry and behavior apply together.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>

        <div className="theme-system-grid compact">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <ThemeSystemCard
              key={name}
              name={name}
              preset={preset}
              active={theme.id === preset.id || theme.mode === preset.mode}
              onSelect={onThemeChange}
            />
          ))}
        </div>

        <div className="theme-studio-section">
          <span>Interface brightness</span>
          <ColorModePicker value={colorMode} onChange={onColorModeChange} />
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

function BrandLogo({ className = '', tone = 'auto' }) {
  return (
    <span className={`${className ? `brand-logo ${className}` : 'brand-logo'} brand-logo-${tone}`} aria-hidden="true">
      <img className="brand-logo-image-light" src={getPublicAssetUrl('/icons/webcord-white.png')} alt="" />
      <img className="brand-logo-image-dark" src={getPublicAssetUrl('/icons/webcord-black.png')} alt="" />
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 3v10.4" />
      <path d="m7.8 9.7 4.2 4.2 4.2-4.2" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 5.7 10.9 4.8v6.6H4V5.7Z" />
      <path d="M12.6 4.6 20 3.6v7.8h-7.4V4.6Z" />
      <path d="M4 12.9h6.9v6.7L4 18.6v-5.7Z" />
      <path d="M12.6 12.9H20v7.5l-7.4-1v-6.5Z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="m8 6-1.6-2.4" />
      <path d="M16 6l1.6-2.4" />
      <path d="M6.5 10.2h11" />
      <path d="M7 10.2A5 5 0 0 1 12 5a5 5 0 0 1 5 5.2v6.3a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 16.5v-6.3Z" />
      <path d="M5 11.5v4.2" />
      <path d="M19 11.5v4.2" />
      <path d="M10 18.1v2.3" />
      <path d="M14 18.1v2.3" />
      <path d="M10 8.2h.01" />
      <path d="M14 8.2h.01" />
    </svg>
  );
}

function IOSIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10 5h4" />
      <circle cx="12" cy="18.5" r=".8" />
    </svg>
  );
}

function BrowserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M4 9h16" />
      <path d="M8 7h.01M11 7h.01" />
      <path d="M9 14h6" />
    </svg>
  );
}

const APP_ICONS = {
  arrowLeft: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  browser: <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M4 9h16" /><path d="M8 7h.01M11 7h.01" /><path d="M9 14h6" /></>,
  camera: <><path d="M15 10.5 20 7v10l-5-3.5" /><rect x="4" y="6" width="11" height="12" rx="2" /></>,
  cameraOff: <><path d="m3 3 18 18" /><path d="M15 10.5 20 7v9.2" /><path d="M13.2 18H6a2 2 0 0 1-2-2V8.8" /><path d="M8.8 6H13a2 2 0 0 1 2 2v2.2" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>,
  hash: <><path d="M5 9h14" /><path d="M5 15h14" /><path d="M10 3 8 21" /><path d="m16 3-2 18" /></>,
  hand: <><path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10" /><path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" /><path d="M13 10V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M16 11V8.5a1.5 1.5 0 0 1 3 0V15c0 4-2.7 7-7 7-3.2 0-5.1-1.6-6.5-3.9L3.3 14.5a1.6 1.6 0 0 1 2.6-1.8L7 14" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  more: <><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></>,
  mic: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
  micOff: <><path d="m3 3 18 18" /><path d="M9 9v3a3 3 0 0 0 5.1 2.1" /><path d="M15 9.3V6a3 3 0 0 0-5.1-2.1" /><path d="M19 10v2a7 7 0 0 1-.7 3" /><path d="M5 10v2a7 7 0 0 0 10 6.3" /><path d="M12 19v3" /></>,
  minus: <path d="M5 12h14" />,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  paperclip: <><path d="m21.4 11.6-8.6 8.6a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7L10 17.4a2 2 0 0 1-2.8-2.8l8.6-8.6" /></>,
  pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 18.7 18.7 0 0 1-5.8-5.8 19 19 0 0 1-3-8.3A2 2 0 0 1 4.7 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.7 9.8a15 15 0 0 0 5.5 5.5l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></>,
  phoneOff: <><path d="m3 3 18 18" /><path d="M14.5 14.5a15 15 0 0 1-5.8-5.8" /><path d="M8.7 9.8 7.5 11A2 2 0 0 0 7 13.1a19 19 0 0 0 8.3 8.3 2 2 0 0 0 2.1-.5l1.2-1.2" /><path d="M5.8 2H4.7a2 2 0 0 0-2 2.2 19 19 0 0 0 3 8.3" /><path d="M16.3 14.3c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v1.1" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="m9 11 3-3 3 3" /><path d="M12 8v7" /><path d="M8 21h8" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
  settings: <><circle cx="12" cy="12" r="3.4" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2.1 2.1 0 0 1-3 3l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V22h-3.4v-.7a1.8 1.8 0 0 0-1.1-1.7 1.8 1.8 0 0 0-2 .4l-.1.1a2.1 2.1 0 0 1-3-3l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H2v-3.4h.7a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1a2.1 2.1 0 0 1 3-3l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1.1-1.7V2h3.4v.7a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1a2.1 2.1 0 0 1 3 3l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.7 1.1H22v3.4h-.7a1.8 1.8 0 0 0-1.9 1.5Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>,
  shrink: <><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.4 2 4 2 4-2 4-2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  story: <><path d="M7 3.5a9 9 0 0 1 10 0" /><path d="M4.2 7.2a9 9 0 0 0 0 9.6" /><path d="M19.8 7.2a9 9 0 0 1 0 9.6" /><path d="M7 20.5a9 9 0 0 0 10 0" /><circle cx="12" cy="12" r="4" /></>,
  switchCamera: <><path d="M17 2v4h-4" /><path d="M7 22v-4h4" /><path d="M19 9a7 7 0 0 0-11.7-4.9L5 6.4" /><path d="M5 15a7 7 0 0 0 11.7 4.9l2.3-2.3" /></>,
  volume: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  volumeOff: <><path d="m3 3 18 18" /><path d="M11 5 6 9H3v6h3l5 4v-7" /><path d="M16 9.5a5 5 0 0 1 1.1 5.5" /></>,
  wave: <><path d="M4 12h2" /><path d="M8 8v8" /><path d="M12 5v14" /><path d="M16 8v8" /><path d="M20 12h-2" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" />
};

const ICON_FAMILIES = {
  telegram: {
    arrowLeft: TbArrowLeft, bookmark: TbBookmark, browser: TbBrowser, camera: TbVideo, cameraOff: TbVideoOff,
    check: TbCircleCheck, copy: TbCopy, hand: TbHandStop,
    close: TbX, expand: TbArrowsMaximize, hash: TbHash, menu: TbMenu2, more: TbDotsVertical,
    mic: TbMicrophone, micOff: TbMicrophoneOff, minus: TbMinus, music: TbMusic,
    paperclip: TbPaperclip, pause: TbPlayerPause, phone: TbPhone, phoneOff: TbPhoneOff,
    pin: TbPinned, play: TbPlayerPlay, plus: TbPlus, screen: TbScreenShare, send: TbSend2,
    settings: TbSettings, search: TbSearch, shrink: TbArrowsMinimize, smile: TbMoodSmile,
    stop: TbPlayerStop, story: TbCircleDashed, switchCamera: TbCameraRotate,
    volume: TbVolume, volumeOff: TbVolumeOff, wave: TbWaveSine, zap: TbBolt,
    shield: TbShield, sun: TbSun, moon: TbMoon, theme: TbPalette
  },
  material: {
    arrowLeft: MdArrowBackIosNew, bookmark: MdBookmarkBorder, browser: MdOutlinePublic, camera: MdOutlineVideocam,
    cameraOff: MdOutlineVideocamOff, check: MdOutlineCheckCircle, copy: MdContentCopy, close: MdClose, hand: MdOutlineBackHand,
    expand: MdFullscreen, hash: MdOutlineTag, menu: MdMenu, more: MdMoreVert,
    mic: MdOutlineMic, micOff: MdOutlineMicOff, minus: MdRemove,
    music: MdOutlineMusicNote, paperclip: MdOutlineAttachFile, pause: MdPause,
    phone: MdOutlineCall, phoneOff: MdOutlineCallEnd, pin: MdOutlinePushPin, play: MdPlayArrow,
    plus: MdAdd, screen: MdOutlineScreenShare, send: MdOutlineSend,
    settings: MdOutlineSettings, search: MdOutlineSearch, shrink: MdFullscreenExit,
    smile: MdOutlineSentimentSatisfiedAlt, stop: MdStop, story: MdOutlineAutoStories,
    switchCamera: MdOutlineCameraswitch, volume: MdOutlineVolumeUp,
    volumeOff: MdOutlineVolumeOff, wave: MdOutlineGraphicEq, zap: MdOutlineBolt,
    wallpaper: MdOutlineWallpaper, theme: MdOutlinePalette,
    shield: MdOutlineShield, sun: MdOutlineLightMode, moon: MdOutlineDarkMode
  },
  atmosphere: {
    arrowLeft: PiArrowLeft, bookmark: PiBookmarkSimple, browser: PiBrowser, camera: PiVideoCamera,
    check: PiCheckCircle, copy: PiCopy, cameraOff: PiVideoCameraSlash, close: PiX, hand: PiHand,
    expand: PiCornersOut, hash: PiHash, menu: PiList, more: PiDotsThreeVertical,
    mic: PiMicrophone, micOff: PiMicrophoneSlash, minus: PiMinus,
    music: PiMusicNotes, paperclip: PiPaperclip, pause: PiPause, pin: PiPushPin,
    phone: PiPhoneCall, phoneOff: PiPhoneSlash, play: PiPlay, plus: PiPlus,
    screen: PiMonitorArrowUp, send: PiPaperPlaneTilt, settings: PiGear,
    search: PiMagnifyingGlass, shrink: PiCornersIn, smile: PiSmiley, stop: PiStop,
    story: PiImagesSquare, switchCamera: PiCameraRotate, volume: PiSpeakerHigh,
    volumeOff: PiSpeakerSlash, wave: PiWaveform, zap: PiPalette,
    channels: PiHash, friends: PiUsersThree, direct: PiChatCircleDots,
    profile: PiUserCircle, wallpaper: PiImageSquare, logout: PiSignOut,
    shield: PiShield, sun: PiSun, moon: PiMoon
  }
};

function AppIcon({ name, size = 20, className = '', family }) {
  const currentFamily = React.useContext(IconFamilyContext);
  const iconFamily = family || currentFamily || 'telegram';
  const IconComponent = ICON_FAMILIES[iconFamily]?.[name] || ICON_FAMILIES.telegram[name] || TbWaveSine;
  return (
    <IconComponent
      aria-hidden="true"
      className={`app-icon icon-family-${iconFamily}${className ? ` ${className}` : ''}`}
      size={size}
      focusable="false"
    />
  );
}

const LANDING_FEATURES = [
  {
    icon: 'send',
    title: 'Каналы без хаоса',
    text: 'Разделяйте темы, команды и проекты так, чтобы новые сообщения не превращались в поток всего подряд.'
  },
  {
    icon: 'story',
    title: 'Личные чаты рядом',
    text: 'Переключайтесь между сообществом и DM без лишних окон, вкладок и потери контекста.'
  },
  {
    icon: 'wave',
    title: 'Голос без подготовки',
    text: 'Зашли в комнату, обсудили, вернулись к чату. Подходит для игр, созвонов и быстрых решений.'
  },
  {
    icon: 'settings',
    title: 'Тёмный режим как основа',
    text: 'Интерфейс не спорит с контентом: мягкий контраст, чистые карточки и приятные ночные акценты.'
  }
];

const LANDING_QUALITY = [
  { title: 'быстро', text: 'мгновенные переходы между чатами' },
  { title: 'тихо', text: 'интерфейс не перетягивает внимание' },
  { title: 'везде', text: 'браузер, Windows и Android' },
  { title: 'своё', text: 'контроль над пространством общения' }
];

const LANDING_DETAIL_CARDS = [
  {
    icon: 'zap',
    title: 'Быстрые состояния и живые статусы',
    text: 'Видно, кто онлайн, где идёт голос, и в какой комнате сейчас живёт разговор.'
  },
  {
    icon: 'story',
    title: 'Пространство, которое принадлежит вам',
    text: 'Серверы, роли и каналы помогают держать общение внутри понятных границ.'
  },
  {
    icon: 'paperclip',
    title: 'Файлы и ссылки не теряются',
    text: 'Передавайте материалы в личных и групповых обсуждениях без ощущения тяжёлого рабочего комбайна.'
  }
];

const LANDING_USE_CASES = [
  {
    title: 'Друзья',
    text: 'Общий чат, игровые комнаты, мемы и быстрые созвоны без лишней организации.'
  },
  {
    title: 'Команды',
    text: 'Проекты, обсуждения, быстрые решения голосом и отдельные каналы под каждую тему.'
  },
  {
    title: 'Сообщества',
    text: 'Постоянные участники, тематические каналы и понятная структура для новых людей.'
  },
  {
    title: 'Разработчики',
    text: 'Свой стек, понятная инфраструктура и пространство, которое можно развивать дальше.'
  }
];

function LandingPage({
  mode,
  setMode,
  username,
  setUsername,
  password,
  setPassword,
  error,
  onSubmit
}) {
  const [authOpen, setAuthOpen] = useState(false);
  const [downloadState, setDownloadState] = useState({ status: 'loading', items: {} });

  const landingRef = useRef(null);
  const usernameInputRef = useRef(null);

  useGSAP(() => {
    const root = landingRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches;
    if (!root || reduceMotion) return undefined;

    const intro = gsap.timeline({
      defaults: { duration: 0.78, ease: 'power3.out' }
    });
    intro
      .from('.landing-header', { autoAlpha: 0, y: -24 })
      .from('.landing-copy > *', { autoAlpha: 0, y: 28, stagger: 0.075 }, '-=0.46')
      .from('.landing-showcase', { autoAlpha: 0, x: 36, scale: 0.975 }, '-=0.7');

    const sections = gsap.utils.toArray('.landing-section');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        gsap.fromTo(
          entry.target.children,
          { autoAlpha: 0, y: 38 },
          { autoAlpha: 1, y: 0, duration: 0.82, stagger: 0.1, ease: 'power3.out', clearProps: 'transform' }
        );
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });
    sections.forEach((section) => observer.observe(section));

    const showcase = root.querySelector('.landing-showcase');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let onPointerMove;
    if (showcase && finePointer) {
      const moveX = gsap.quickTo(showcase, 'x', { duration: 0.8, ease: 'power3.out' });
      const moveY = gsap.quickTo(showcase, 'y', { duration: 0.8, ease: 'power3.out' });
      onPointerMove = (event) => {
        moveX((event.clientX / window.innerWidth - 0.5) * 14);
        moveY((event.clientY / window.innerHeight - 0.5) * 10);
      };
      root.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    return () => {
      observer.disconnect();
      if (onPointerMove) root.removeEventListener('pointermove', onPointerMove);
    };
  }, { scope: landingRef });

  useEffect(() => {
    let closed = false;
    apiFetch('/downloads')
      .then((payload) => {
        if (!closed) setDownloadState({ status: 'ready', items: mapDownloads(payload?.downloads) });
      })
      .catch(() => {
        if (!closed) setDownloadState({ status: 'error', items: {} });
      });
    return () => {
      closed = true;
    };
  }, []);

  function openAuth(nextMode = 'login') {
    setMode(nextMode);
    setAuthOpen(true);
    window.setTimeout(() => usernameInputRef.current?.focus(), 80);
  }

  function renderDownloadLink(platform, label, className = '') {
    const download = downloadState.items[platform] || {};
    const hasDownloadRecord = Object.prototype.hasOwnProperty.call(downloadState.items, platform);
    const knownMissing = downloadState.status === 'ready' && hasDownloadRecord && !download.available;

    return (
      <a
        className={'landing-cta ' + className + (knownMissing ? ' disabled' : '')}
        href={DOWNLOAD_URLS[platform]}
        aria-disabled={knownMissing}
        onClick={(event) => {
          if (knownMissing) event.preventDefault();
        }}
      >
        {platform === 'windows' ? <WindowsIcon /> : platform === 'ios' ? <IOSIcon /> : <AndroidIcon />}
        <span>{knownMissing ? label + ' скоро' : label}</span>
      </a>
    );
  }

  return (
    <main ref={landingRef} className="landing-page design-draft-a">
      <div className="landing-aurora" aria-hidden="true" />

      <header className="landing-header">

        <a className="landing-brand" href="/" aria-label="WebCord home">
          <BrandLogo className="landing-brand-logo" />
          <span>WebCord</span>
        </a>
        <nav className="landing-nav" aria-label="Главная навигация">
          <a href="#download">Загрузить</a>
          <a href="#features">Возможности</a>
          <a href="#quality">Качество</a>
          <a href="#use-cases">Сценарии</a>
        </nav>
        <button className="landing-login-btn" type="button" onClick={() => openAuth('login')}>Вход</button>
      </header>

      <section className="landing-hero" id="download" aria-label="WebCord">
        <div className="landing-copy">
          <p className="landing-kicker"><AppIcon name="wave" size={14} /> комфортный мессенджер для своих</p>
          <h1>WebCord — мессенджер без шума</h1>
          <p>
            Общайтесь в каналах, личных чатах и голосовых комнатах без хаоса. WebCord берёт лучшее от Telegram и Discord — и делает общение спокойнее, быстрее и приятнее.
          </p>
          <div className="landing-actions">
            <button className="landing-cta landing-cta-primary" type="button" onClick={() => openAuth('login')}>
              <BrowserIcon />
              <span>Открыть в браузере</span>
            </button>
            {renderDownloadLink('windows', 'Windows', 'landing-cta-light')}
            {renderDownloadLink('android', 'Android', 'landing-cta-glass')}
            {renderDownloadLink('ios', 'iOS · unsigned IPA', 'landing-cta-glass')}
          </div>
          <div className="landing-hero-meta" aria-label="Коротко о WebCord">
            <span><i /> браузерный доступ</span>
            <span>каналы · DM · голос · файлы</span>
          </div>
        </div>

        <div className="landing-showcase" aria-hidden="true">
          <div className="landing-voice-pill"><AppIcon name="wave" size={18} /> voice online</div>
          <div className="landing-mock-window">
            <div className="landing-window-bar">
              <span />
              <span />
              <span />
              <strong>WebCord</strong>
            </div>
            <div className="landing-mock-body">
              <aside>
                <strong>Calm server</strong>
                <span className="active"># общий</span>
                <span># команда</span>
                <span>◦ voice room</span>
              </aside>
              <section>
                <div className="landing-message-row">
                  <i />
                  <div><span /><span /></div>
                </div>
                <div className="landing-message-row accent">
                  <i />
                  <div><span /><span /></div>
                </div>
                <div className="landing-composer">Написать сообщение...</div>
              </section>
            </div>
          </div>
          <div className="landing-phone-card">
            <div>
              <i />
              <i />
            </div>
            <div>
              <i />
              <i />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
        <div className="landing-section-head centered">
          <p className="landing-section-label">Почему WebCord ощущается спокойнее</p>
          <h2 id="features-title">Всё для общения — без лишнего шума</h2>
          <p>WebCord собирает привычные сценарии мессенджеров в чистый интерфейс: меньше отвлекающих слоёв, понятнее структура, быстрее переход от текста к голосу.</p>
        </div>
        <div className="landing-card-grid">
          {LANDING_FEATURES.map((feature) => (
            <article className="landing-feature-card" key={feature.title}>
              <span className="landing-icon"><AppIcon name={feature.icon} size={21} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-quality" id="quality" aria-labelledby="quality-title">
        <article className="landing-quality-main">
          <p className="landing-section-label">Качество в деталях</p>
          <h2 id="quality-title">Меньше трения между “написать” и “договориться”</h2>
          <p>WebCord проектируется как ежедневный инструмент: быстрый запуск, аккуратные состояния, понятные комнаты и мягкий визуальный ритм, который не утомляет после часа общения.</p>
          <div className="landing-quality-grid">
            {LANDING_QUALITY.map((item) => (
              <div key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </article>
        <div className="landing-detail-list">
          {LANDING_DETAIL_CARDS.map((item) => (
            <article className="landing-detail-card" key={item.title}>
              <span className="landing-icon"><AppIcon name={item.icon} size={22} /></span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-use-cases" id="use-cases" aria-labelledby="use-cases-title">
        <div className="landing-section-head">
          <p className="landing-section-label">Для разных ритмов общения</p>
          <h2 id="use-cases-title">Один дом для чатов, голосов и рабочих комнат</h2>
        </div>
        <div className="landing-card-grid">
          {LANDING_USE_CASES.map((item) => (
            <article className="landing-feature-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-final" aria-labelledby="final-title">
        <div className="landing-final-card">
          <BrandLogo className="landing-final-logo" />
          <h2 id="final-title">Попробуйте WebCord там, где вам удобно</h2>
          <p>Откройте мессенджер в браузере или установите приложение. Каналы, личные сообщения и голосовые комнаты уже собраны в одном спокойном пространстве.</p>
          <div className="landing-actions final-actions">
            <button className="landing-cta landing-cta-primary" type="button" onClick={() => openAuth('login')}>
              <BrowserIcon />
              <span>Открыть WebCord</span>
            </button>
            <a className="landing-cta landing-cta-light" href="#download">
              <DownloadIcon />
              <span>Скачать приложение</span>
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <a href="/">WebCord © 2026</a>
        <a href="#features">Мессенджер для комфортного общения</a>
      </footer>

      {authOpen ? (
        <div className="landing-auth-overlay" role="dialog" aria-modal="true" aria-label="Вход в WebCord" onClick={() => setAuthOpen(false)}>
          <form className="auth-card landing-auth-card" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="landing-auth-top">
              <span className="hero-badge brand-badge"><BrandLogo /> WebCord</span>
              <button className="landing-auth-close" type="button" aria-label="Закрыть форму входа" onClick={() => setAuthOpen(false)}><AppIcon name="close" /></button>
            </div>
            <h2>{mode === 'login' ? 'Добро пожаловать обратно' : 'Создать аккаунт'}</h2>
            <p className="muted">{mode === 'login' ? 'Войдите, чтобы перейти к каналам и друзьям.' : 'Зарегистрируйтесь и сразу откройте свой WebCord.'}</p>
            <div className="auth-switch">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Вход</button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button>
            </div>
            <input ref={usernameInputRef} placeholder="Имя пользователя" value={username} onChange={(event) => setUsername(event.target.value)} required />
            <input type="password" placeholder="Пароль" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error ? <p className="error">{error}</p> : null}
            <button type="submit">{mode === 'login' ? 'Войти в WebCord' : 'Создать аккаунт'}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function CustomAudioPlayer({ src, title = 'Audio', variant = 'voice' }) {
  const audioRef = useRef(null);
  const idRef = useRef(`audio-${Math.random().toString(16).slice(2)}`);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setPlaybackRate(1);
  }, [src]);

  useEffect(() => {
    const onOtherMediaPlay = (event) => {
      if (event.detail?.id !== idRef.current) {
        audioRef.current?.pause();
      }
    };
    window.addEventListener(MEDIA_PLAY_EVENT, onOtherMediaPlay);
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, onOtherMediaPlay);
  }, []);

  async function togglePlayback() {
    const node = audioRef.current;
    if (!node) return;

    if (node.paused) {
      window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { id: idRef.current } }));
      await node.play().catch(() => {});
    } else {
      node.pause();
    }
  }

  function seek(event) {
    const node = audioRef.current;
    if (!node) return;
    const nextTime = Number(event.target.value) || 0;
    node.currentTime = nextTime;
    setCurrent(nextTime);
  }

  function cyclePlaybackRate() {
    const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = safeDuration ? Math.min(100, Math.max(0, (current / safeDuration) * 100)) : 0;

  return (
    <div className={`custom-audio-player ${variant}`} style={{ '--media-progress': `${progress}%` }}>
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        muted={muted}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <button className="media-round-btn" type="button" aria-label={playing ? `Pause ${title}` : `Play ${title}`} title={playing ? 'Pause' : 'Play'} onClick={togglePlayback}>
        <AppIcon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <div className="voice-waveform-wrap">
        <span className="voice-waveform" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <i key={index} style={{ '--wave-height': `${24 + ((index * 17) % 58)}%` }} />
          ))}
        </span>
        <input className="media-range" type="range" min="0" max={safeDuration || 0} step="0.01" value={Math.min(current, safeDuration || current)} aria-label={`Seek ${title}`} onChange={seek} />
      </div>
      <span className="media-time">{formatMediaDuration(current)} / {formatMediaDuration(safeDuration)}</span>
      <button className="media-speed-btn" type="button" aria-label={`Playback speed ${playbackRate}x`} title="Playback speed" onClick={cyclePlaybackRate}>
        {playbackRate}×
      </button>
      <button className="media-speaker-btn" type="button" aria-label={muted ? `Unmute ${title}` : `Mute ${title}`} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((value) => !value)}>
        <AppIcon name={muted ? 'volumeOff' : 'volume'} size={17} />
      </button>
    </div>
  );
}

function ProfileTrackPlayer({ profile, compact = false }) {
  const trackUrl = profile?.favoriteTrackUrl ? getAttachmentUrl(profile.favoriteTrackUrl) : '';
  const title = profile?.favoriteTrack?.trim() || profile?.favoriteTrackName || 'Profile track';
  const track = splitTrackTitle(title);

  if (!trackUrl && !profile?.favoriteTrack) return null;

  if (compact) {
    return (
      <div className="profile-track-player compact" style={getProfileStyle(profile)}>
        <div className="profile-track-title">
          <span><AppIcon name="music" size={16} /></span>
          <div>
            <small>Profile track</small>
            <strong>{title}</strong>
          </div>
        </div>
        {trackUrl ? <CustomAudioPlayer src={trackUrl} title={title} variant="track" /> : null}
      </div>
    );
  }

  return (
    <div className="profile-playlist-panel" style={getProfileStyle(profile)}>
      <div className="profile-playlist-heading">
        <h3>Ваш плейлист</h3>
        <div className="profile-playlist-actions" aria-hidden="true">
          <span><AppIcon name="plus" size={22} /></span>
          <span><AppIcon name="search" size={22} /></span>
        </div>
      </div>
      <div className="profile-playlist-list">
        <div className="profile-playlist-row active">
          <span className="profile-playlist-cover" style={getProfileStyle(profile)}>
            {profile?.avatarUrl ? <img src={getAttachmentUrl(profile.avatarUrl)} alt="" aria-hidden="true" /> : <AppIcon name="music" size={20} />}
            <i><AppIcon name="pause" size={16} /></i>
          </span>
          <div>
            <strong>{track.title}</strong>
            <small>{track.artist}</small>
          </div>
          <span className="profile-playlist-drag"><AppIcon name="menu" size={20} /></span>
        </div>
      </div>
      {trackUrl ? (
        <div className="profile-playlist-now">
          <div>
            <strong>{track.title}</strong>
            <small>{track.artist}</small>
          </div>
          {profile?.avatarUrl ? <img src={getAttachmentUrl(profile.avatarUrl)} alt="" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {trackUrl ? <CustomAudioPlayer src={trackUrl} title={title} variant="track" /> : (
        <div>
          <p className="muted">Track title is attached to the profile. Upload an audio file in settings to make it playable.</p>
        </div>
      )}
    </div>
  );
}

function CircleVideoPlayer({ src, title = 'Video circle', onOpen, large = false }) {
  const videoRef = useRef(null);
  const idRef = useRef(`circle-${Math.random().toString(16).slice(2)}`);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const onOtherMediaPlay = (event) => {
      if (event.detail?.id !== idRef.current) {
        videoRef.current?.pause();
      }
    };
    window.addEventListener(MEDIA_PLAY_EVENT, onOtherMediaPlay);
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, onOtherMediaPlay);
  }, []);

  async function togglePlayback() {
    const node = videoRef.current;
    if (!node) return;

    if (node.paused) {
      window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { id: idRef.current } }));
      await node.play().catch(() => {});
    } else {
      node.pause();
    }
  }

  async function holdToPreview() {
    const node = videoRef.current;
    if (!node || !node.paused) return;
    window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { id: idRef.current } }));
    await node.play().catch(() => {});
  }

  function releasePreview() {
    videoRef.current?.pause();
  }

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = safeDuration ? Math.min(100, Math.max(0, (current / safeDuration) * 100)) : 0;

  return (
    <div className={large ? 'circle-video-note large' : 'circle-video-note'} style={{ '--circle-progress': `${progress * 3.6}deg` }}>
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        src={src}
        muted={muted}
        onPointerDown={holdToPreview}
        onPointerUp={releasePreview}
        onPointerCancel={releasePreview}
        onPointerLeave={(event) => {
          if (event.buttons) releasePreview();
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <span className="circle-progress-ring" aria-hidden="true" />
      <button className="circle-main-control" type="button" aria-label={playing ? `Pause ${title}` : `Play ${title}`} title={playing ? 'Pause' : 'Play'} onClick={togglePlayback}>
        <AppIcon name={playing ? 'pause' : 'play'} size={large ? 28 : 22} />
      </button>
      <div className="circle-video-hud">
        <span>{formatMediaDuration(current || safeDuration)}</span>
        <button type="button" aria-label={muted ? 'Unmute circle' : 'Mute circle'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((value) => !value)}>
          <AppIcon name={muted ? 'volumeOff' : 'volume'} size={15} />
        </button>
        {onOpen ? (
          <button type="button" aria-label={`Open ${title}`} title="Open" onClick={onOpen}>
            <AppIcon name="expand" size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StreamPreviewVideo({ stream, className = '' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const node = videoRef.current;
    if (node && stream && node.srcObject !== stream) {
      node.srcObject = stream;
    }
    return () => {
      if (node?.srcObject === stream) node.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} className={className} autoPlay playsInline muted />;
}

function createPreviewVideoElement(stream) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const done = () => resolve(video);
    video.onloadedmetadata = done;
    video.play?.().then(done).catch(done);
    window.setTimeout(done, 250);
  });
}

function drawCoverVideo(ctx, video, size) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    ctx.fillStyle = '#07101a';
    ctx.fillRect(0, 0, size, size);
    return;
  }

  const scale = Math.max(size / video.videoWidth, size / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  ctx.drawImage(video, x, y, width, height);
}

async function createSwitchableCircleRecorder({ micDeviceId = '', cameraDeviceId = '', facingMode = 'user' } = {}) {
  const canvas = document.createElement('canvas');
  const capture = canvas.captureStream?.bind(canvas);
  if (!capture) throw new Error('Realtime camera switching is not supported in this browser');

  const size = 720;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not prepare video recorder');

  const initialStream = await requestCircleRecordingStream({ micDeviceId, cameraDeviceId, facingMode });
  const audioTracks = initialStream.getAudioTracks();
  const recordStream = capture(30);
  audioTracks.forEach((track) => recordStream.addTrack(track));

  let activePreviewStream = initialStream;
  let activeVideo = await createPreviewVideoElement(activePreviewStream);
  let rafId = 0;
  let stopped = false;

  const draw = () => {
    if (stopped) return;
    ctx.save();
    ctx.fillStyle = '#07101a';
    ctx.fillRect(0, 0, size, size);
    drawCoverVideo(ctx, activeVideo, size);
    ctx.restore();
    rafId = window.requestAnimationFrame(draw);
  };
  draw();

  return {
    recordStream,
    get previewStream() {
      return activePreviewStream;
    },
    async switchCamera(nextFacingMode) {
      const nextVideoStream = await requestCameraStream(cameraDeviceId, nextFacingMode);
      const nextPreviewStream = new MediaStream([
        ...nextVideoStream.getVideoTracks(),
        ...audioTracks.filter((track) => track.readyState !== 'ended')
      ]);
      const nextVideo = await createPreviewVideoElement(nextPreviewStream);

      activePreviewStream.getVideoTracks().forEach((track) => track.stop());
      activeVideo.pause?.();
      activeVideo.srcObject = null;
      activePreviewStream = nextPreviewStream;
      activeVideo = nextVideo;
      return activePreviewStream;
    },
    stop() {
      stopped = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      activePreviewStream.getTracks().forEach((track) => track.stop());
      recordStream.getTracks().forEach((track) => track.stop());
      activeVideo.pause?.();
      activeVideo.srcObject = null;
    }
  };
}

function CircleRecordingOverlay({
  stream,
  phase,
  elapsed,
  countdown,
  uploadProgress,
  paused,
  torchEnabled,
  facingMode,
  cameraSwitching,
  onCancel,
  onSend,
  onPauseToggle,
  onTorchToggle,
  onSwitchCamera
}) {
  const onCancelRef = useRef(onCancel);
  const recordingProgress = phase === 'uploading'
    ? Math.max(0, Math.min(100, uploadProgress))
    : Math.max(0, Math.min(100, (elapsed / CIRCLE_RECORDING_MAX_SECONDS) * 100));

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const historyMarker = `circle-recording-${Date.now()}`;
    const previousHistoryState = window.history.state;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    const handlePopState = () => onCancelRef.current();

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.history.pushState({ ...(previousHistoryState || {}), webcordOverlay: historyMarker }, '', window.location.href);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState, { once: true });

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.webcordOverlay === historyMarker) {
        window.history.back();
      }
    };
  }, []);

  return createPortal((
    <div className="circle-recording-overlay" role="dialog" aria-modal="true">
      <div className="circle-recording-backdrop" aria-hidden="true" />
      <div className="circle-recording-stage">
        <div
          className={`circle-recording-preview-shell phase-${phase}`}
          role="progressbar"
          aria-label={phase === 'uploading' ? 'Uploading video circle' : 'Video circle recording progress'}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(recordingProgress)}
        >
          <svg className="circle-recording-progress" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="circle-recording-progress-track" cx="50" cy="50" r="47" pathLength="100" />
            <circle
              className="circle-recording-progress-value"
              cx="50"
              cy="50"
              r="47"
              pathLength="100"
              style={{ strokeDashoffset: 100 - recordingProgress }}
            />
          </svg>
          <div className="circle-recording-preview">
            {stream ? <StreamPreviewVideo stream={stream} /> : <span className="circle-recording-empty"><AppIcon name="camera" size={42} /></span>}
            {countdown > 0 ? <strong className="circle-recording-countdown" aria-live="assertive">{countdown}</strong> : null}
            {phase === 'uploading' ? (
              <div className="circle-recording-upload" aria-live="polite">
                <span>Uploading circle</span>
                <strong>{uploadProgress}%</strong>
                <progress max="100" value={uploadProgress} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="circle-recording-side-actions">
          <button type="button" aria-label="Pause recording" title={paused ? 'Resume recording' : 'Pause recording'} onClick={onPauseToggle}>
            <AppIcon name={paused ? 'play' : 'pause'} size={22} />
          </button>
        </div>
        <div className="circle-recording-tools">
          <button type="button" aria-label="Switch camera" title={`Switch to ${facingMode === 'user' ? 'rear camera' : 'front camera'}`} onClick={onSwitchCamera} disabled={cameraSwitching}>
            <AppIcon name="switchCamera" size={22} />
          </button>
          <button type="button" aria-label="Toggle torch" title={torchEnabled ? 'Turn torch off' : 'Turn torch on'} onClick={onTorchToggle}>
            <AppIcon name="zap" size={22} />
          </button>
        </div>
        <div className="circle-recording-bottom">
          <div className="circle-recording-timer">
            <span className="recording-dot" />
            <strong>{phase === 'requesting' ? 'Checking camera' : phase === 'countdown' ? 'Get ready' : phase === 'uploading' ? 'Securing draft' : formatShortDuration(elapsed)}</strong>
          </div>
          <button className="circle-recording-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="circle-recording-send" type="button" aria-label="Attach video circle" title="Attach video circle" onClick={onSend} disabled={phase !== 'recording' && phase !== 'paused'}>
            <AppIcon name="send" size={34} />
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function MobileHomePanel({
  title,
  user,
  stories,
  uploading,
  activeFolder,
  customFolders = [],
  search,
  onCreateStory,
  onOpenStory,
  onFolderChange,
  onSearchChange,
  onOpenSettings
}) {
  const groups = stories.reduce((acc, story) => {
    const authorId = String(story.author?.id || story.authorId || 'unknown');
    if (!acc.has(authorId)) acc.set(authorId, []);
    acc.get(authorId).push(story);
    return acc;
  }, new Map());
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftOwn = String(left[0]?.author?.id) === String(user?.id);
    const rightOwn = String(right[0]?.author?.id) === String(user?.id);
    if (leftOwn !== rightOwn) return leftOwn ? -1 : 1;
    return new Date(right[0]?.createdAt || 0).getTime() - new Date(left[0]?.createdAt || 0).getTime();
  });
  return (
    <div className="mobile-home-panel">
      <div className="mobile-home-top">
        <div className="mobile-home-title">
          <BrandLogo />
          <span>
            <h1>{title}</h1>
            <small>Чаты, каналы и звонки</small>
          </span>
        </div>
        <button className="icon-btn mobile-home-more" type="button" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
          <AppIcon name="settings" />
        </button>
      </div>
      <section className="mobile-home-stories" aria-label="Stories">
        <button className="mobile-story-item add" type="button" onClick={onCreateStory}>
          <span className="mobile-story-ring">
            <UserAvatar user={user} />
            <i><AppIcon name="plus" size={14} /></i>
          </span>
          <strong>{uploading ? 'Загрузка' : 'Моя история'}</strong>
        </button>
        {orderedGroups.slice(0, 8).map((group) => {
          const firstStory = group[0];
          const unread = group.some((story) => !story.viewed);
          return (
            <button key={firstStory.author?.id || firstStory.id} className={unread ? 'mobile-story-item unread' : 'mobile-story-item'} type="button" onClick={() => onOpenStory(firstStory)}>
              <span className="mobile-story-ring">
                <UserAvatar user={firstStory.author} />
              </span>
              <strong>{getDisplayName(firstStory.author)}</strong>
            </button>
          );
        })}
      </section>
      <label className="mobile-chat-search">
        <AppIcon name="search" size={22} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Поиск чатов" />
      </label>
      {customFolders.length > 0 ? (
        <div className="mobile-folder-tabs" role="tablist" aria-label="Custom folders">
          {customFolders.map((folder) => {
            const isActive = activeFolder === folder.id;
            const count = uniqueStringList(folder.channelIds).length + uniqueStringList(folder.friendIds).length;
            return (
              <button key={folder.id} className={isActive ? 'active' : ''} type="button" role="tab" aria-selected={isActive} onClick={() => onFolderChange(folder.id)}>
                {folder.name}<span>{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StoriesPanel({ stories, user, loading, uploading, onCreateStory, onOpenStory, onRefresh }) {
  const groups = stories.reduce((acc, story) => {
    const authorId = String(story.author?.id || story.authorId || 'unknown');
    if (!acc.has(authorId)) acc.set(authorId, []);
    acc.get(authorId).push(story);
    return acc;
  }, new Map());
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftOwn = String(left[0]?.author?.id) === String(user?.id);
    const rightOwn = String(right[0]?.author?.id) === String(user?.id);
    if (leftOwn !== rightOwn) return leftOwn ? -1 : 1;
    return new Date(right[0]?.createdAt || 0).getTime() - new Date(left[0]?.createdAt || 0).getTime();
  });

  return (
    <div className="stories-workspace">
      <section className="stories-strip" aria-label="Stories">
        <button className="story-bubble add" type="button" onClick={onCreateStory}>
          <span className="story-avatar-ring">
            <UserAvatar user={user} />
            <i><AppIcon name="plus" size={13} /></i>
          </span>
          <strong>{uploading ? 'Uploading' : 'Your story'}</strong>
        </button>

        {orderedGroups.map((group) => {
          const firstStory = group[0];
          const unread = group.some((story) => !story.viewed);
          return (
            <button key={firstStory.author?.id || firstStory.id} className={unread ? 'story-bubble unread' : 'story-bubble'} type="button" onClick={() => onOpenStory(firstStory)}>
              <span className="story-avatar-ring">
                <UserAvatar user={firstStory.author} />
              </span>
              <strong>{getDisplayName(firstStory.author)}</strong>
            </button>
          );
        })}
      </section>

      <section className="stories-board">
        <div className="stories-board-top">
          <div>
            <span className="section-label">Stories</span>
            <h3>Moments from your WebCord circle</h3>
          </div>
          <div className="stories-actions">
            <button className="ghost-btn" type="button" onClick={onRefresh}>Refresh</button>
            <button type="button" onClick={onCreateStory}><AppIcon name="story" size={16} />New Story</button>
          </div>
        </div>

        {loading ? <p className="muted">Loading stories...</p> : null}
        {!loading && stories.length === 0 ? (
          <div className="empty-state">
            <h3>No stories yet</h3>
            <p className="muted">Add an image or video. It will live here for 24 hours.</p>
          </div>
        ) : null}

        <div className="story-card-grid">
          {stories.map((story) => {
            const url = getAttachmentUrl(story.mediaUrl);
            const isVideo = String(story.mediaType || '').toUpperCase() === 'VIDEO';
            return (
              <button key={story.id} className={story.viewed ? 'story-card viewed' : 'story-card'} type="button" onClick={() => onOpenStory(story)}>
                <span className="story-card-media">
                  {isVideo ? <video muted playsInline preload="metadata" src={url} /> : <img src={url} alt={story.caption || `${getDisplayName(story.author)} story`} />}
                </span>
                <span className="story-card-copy">
                  <strong>{getDisplayName(story.author)}</strong>
                  {story.caption ? <small className="story-card-caption">{story.caption}</small> : null}
                  {story.musicUrl ? <small className="story-card-music"><AppIcon name="music" size={12} />{getStoryMusicLabel(story)}</small> : null}
                  <small>{new Date(story.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}{story.viewed ? ' · viewed' : ''}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StoryViewer({ story, stories, onClose, onNext, onPrev }) {
  if (!story) return null;

  const url = getAttachmentUrl(story.mediaUrl);
  const isVideo = String(story.mediaType || '').toUpperCase() === 'VIDEO';
  const storyIndex = stories.findIndex((item) => String(item.id) === String(story.id));

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="story-viewer-shell" onClick={(event) => event.stopPropagation()}>
        <div className="story-progress-row" aria-hidden="true">
          {stories.map((item, index) => (
            <span key={item.id} className={index <= storyIndex ? 'active' : ''} />
          ))}
        </div>
        <div className="story-viewer-top">
          <UserAvatar user={story.author} />
          <div>
            <strong>{getDisplayName(story.author)}</strong>
            <span>{new Date(story.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <button className="icon-btn" type="button" aria-label="Close story" title="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>

        <button className="story-nav prev" type="button" aria-label="Previous story" onClick={onPrev}><AppIcon name="arrowLeft" /></button>
        <button className="story-nav next" type="button" aria-label="Next story" onClick={onNext}><AppIcon name="arrowLeft" /></button>

        <div className="story-viewer-media">
          {isVideo ? <video autoPlay controls playsInline src={url} /> : <img src={url} alt={story.caption || `${getDisplayName(story.author)} story`} />}
        </div>
        {story.caption ? <p className="story-caption">{story.caption}</p> : null}
        {story.musicUrl ? (
          <div className="story-music-player">
            <span><AppIcon name="music" size={16} />{getStoryMusicLabel(story)}</span>
            <audio controls src={getAttachmentUrl(story.musicUrl)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StoryComposerModal({
  open,
  draft,
  uploading,
  onClose,
  onDraftChange,
  onPickMedia,
  onPickMusic,
  onPublish
}) {
  if (!open) return null;
  return (
    <div className="story-composer-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="story-composer" onClick={(event) => event.stopPropagation()}>
        <div className="story-composer-top">
          <div>
            <span className="section-label">New story</span>
            <h3>Moment with music</h3>
          </div>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        <label>
          Description
          <textarea
            value={draft.caption}
            maxLength={180}
            rows={3}
            placeholder="Short text for the story"
            onChange={(event) => onDraftChange({ ...draft, caption: event.target.value.slice(0, 180) })}
          />
        </label>
        <div className="story-composer-grid">
          <label>
            Music title
            <input
              value={draft.musicTitle}
              maxLength={96}
              placeholder="Track name"
              onChange={(event) => onDraftChange({ ...draft, musicTitle: event.target.value.slice(0, 96) })}
            />
          </label>
          <label>
            Artist
            <input
              value={draft.musicArtist}
              maxLength={96}
              placeholder="Artist"
              onChange={(event) => onDraftChange({ ...draft, musicArtist: event.target.value.slice(0, 96) })}
            />
          </label>
        </div>
        <div className="story-file-picks">
          <button type="button" onClick={onPickMedia}><AppIcon name="story" size={16} />{draft.mediaFile ? draft.mediaFile.name : 'Choose photo/video'}</button>
          <button className="ghost-btn" type="button" onClick={onPickMusic}><AppIcon name="music" size={16} />{draft.musicFile ? draft.musicFile.name : 'Attach music'}</button>
        </div>
        <div className="settings-actions-row">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-btn" type="button" disabled={uploading || !draft.mediaFile} onClick={onPublish}>
            {uploading ? 'Publishing...' : 'Publish story'}
          </button>
        </div>
      </section>
    </div>
  );
}

function MessageAttachment({ message, onOpenMedia }) {
  if (!message.attachmentUrl) return null;

  const kind = getAttachmentKind(message);
  const url = getAttachmentUrl(message.attachmentUrl);
  const title = message.attachmentName || 'Attachment';

  if (kind === 'IMAGE') {
    return (
      <button className="message-media-button" type="button" onClick={() => onOpenMedia?.(message)}>
        <img className="message-media" src={url} alt={title} />
      </button>
    );
  }

  if (kind === 'VIDEO') {
    return (
      <button className="message-media-button" type="button" onClick={() => onOpenMedia?.(message)}>
        <video className="message-media" muted playsInline preload="metadata" src={url} />
        <span className="media-play-chip">Play video</span>
      </button>
    );
  }

  if (kind === 'CIRCLE_VIDEO') {
    return (
      <CircleVideoPlayer src={url} title={title} onOpen={() => onOpenMedia?.(message)} />
    );
  }

  if (kind === 'AUDIO') {
    return (
      <div className="voice-message">
        <CustomAudioPlayer src={url} title={title} variant="voice" />
      </div>
    );
  }

  return <a className="file-link" href={url} download>{title}</a>;
}

function MediaViewer({ message, items = [], onNavigate, onClose }) {
  const currentIndex = items.findIndex((item) => String(item.id) === String(message?.id));
  const previous = currentIndex >= 0 ? items[currentIndex - 1] : null;
  const next = currentIndex >= 0 ? items[currentIndex + 1] : null;

  useEffect(() => {
    if (!message) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft' && previous) onNavigate?.(previous);
      if (event.key === 'ArrowRight' && next) onNavigate?.(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, previous, next, onNavigate, onClose]);

  if (!message?.attachmentUrl) return null;

  const kind = getAttachmentKind(message);
  const url = getAttachmentUrl(message.attachmentUrl);
  const title = message.attachmentName || 'Attachment';

  return (
    <div className="media-viewer-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={kind === 'CIRCLE_VIDEO' ? 'media-viewer-card circle' : 'media-viewer-card'} onClick={(event) => event.stopPropagation()}>
        <div className="media-viewer-top">
          <strong>{title}</strong>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        <div className="media-viewer-stage">
          {previous ? <button className="media-viewer-nav previous" type="button" aria-label="Previous media" onClick={() => onNavigate?.(previous)}><AppIcon name="arrowLeft" /></button> : null}
          {kind === 'IMAGE' ? <img src={url} alt={title} /> : null}
          {kind === 'VIDEO' ? <video controls autoPlay playsInline src={url} /> : null}
          {kind === 'CIRCLE_VIDEO' ? <CircleVideoPlayer src={url} title={title} large /> : null}
          {kind === 'AUDIO' ? <CustomAudioPlayer src={url} title={title} variant="viewer" /> : null}
          {next ? <button className="media-viewer-nav next" type="button" aria-label="Next media" onClick={() => onNavigate?.(next)}><AppIcon name="arrowLeft" /></button> : null}
        </div>
        <div className="media-viewer-actions">
          {currentIndex >= 0 ? <span>{currentIndex + 1} / {items.length}</span> : null}
          <a className="ghost-btn" href={url} download>Download</a>
        </div>
      </div>
    </div>
  );
}

function PollCard({ poll, currentUserId, onVote }) {
  const [pending, setPending] = useState(false);
  const options = poll.options.map((option) => ({
    ...option,
    voteCount: option.voteCount ?? option.votes?.length ?? 0,
    selected: option.selected ?? option.votes?.some((vote) => String(vote.userId) === String(currentUserId)) ?? false
  }));
  const totalVoters = poll.totalVoters ?? new Set(poll.options.flatMap((option) => (option.votes || []).map((vote) => vote.userId))).size;
  const selectedIds = options.filter((option) => option.selected).map((option) => option.id);
  const maxVotes = Math.max(1, ...options.map((option) => option.voteCount || 0));

  async function choose(optionId) {
    if (poll.closed || pending) return;
    const alreadySelected = selectedIds.includes(optionId);
    const optionIds = poll.allowsMultiple
      ? alreadySelected
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId]
      : alreadySelected ? [] : [optionId];
    setPending(true);
    try {
      await onVote?.(poll, optionIds);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="poll-card" aria-label={`Poll: ${poll.question}`}>
      <div className="poll-heading">
        <span className="poll-kicker">Poll</span>
        <strong>{poll.question}</strong>
        <small>{poll.allowsMultiple ? 'Multiple choice' : 'Single choice'}{poll.anonymous ? ' · Anonymous' : ''}</small>
      </div>
      <div className="poll-options">
        {options.map((option) => {
          const percentage = totalVoters ? Math.round((option.voteCount / totalVoters) * 100) : 0;
          return (
            <button
              className={option.selected ? 'poll-option selected' : 'poll-option'}
              type="button"
              key={option.id}
              disabled={poll.closed || pending}
              onClick={() => choose(option.id)}
            >
              <span className="poll-option-fill" style={{ transform: `scaleX(${option.voteCount / maxVotes})` }} />
              <span className="poll-option-check">{option.selected ? '✓' : ''}</span>
              <strong>{option.label}</strong>
              <span>{percentage}%</span>
            </button>
          );
        })}
      </div>
      <footer>{totalVoters} {totalVoters === 1 ? 'vote' : 'votes'}{poll.closed ? ' · Closed' : ''}</footer>
    </section>
  );
}

function formatRelativeDate(value) {
  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absolute < 60) return formatter.format(deltaSeconds, 'second');
  if (absolute < 3_600) return formatter.format(Math.round(deltaSeconds / 60), 'minute');
  if (absolute < 86_400) return formatter.format(Math.round(deltaSeconds / 3_600), 'hour');
  if (absolute < 604_800) return formatter.format(Math.round(deltaSeconds / 86_400), 'day');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function MessageItem({ message, currentUserId, workspace, grouped = false, groupedWithNext = false, showDateDivider = false, showUnreadDivider = false, canModerateMessages = false, selected = false, highlighted = false, onAvatarClick, onReply, onNavigateToReply, onEdit, onDelete, onReport, onOpenMedia, onToggleReaction, onPollVote, onOpenThread, onCopy, onShare, onPin, onBookmark, onHistory, onForward, onSelect }) {
  const isOwn = String(message.author?.id) === String(currentUserId);
  const canDelete = isOwn || canModerateMessages;
  const pointerStartRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const authorColorClass = `author-color-${getAuthorColorIndex(message.author)}`;
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt));
  const emojiOnly = isEmojiOnlyMessage(message.content) && !message.attachmentUrl;
  const firstUrl = getFirstMessageUrl(message.content);
  const reactions = Object.values((message.reactions || []).reduce((groups, reaction) => {
    const emoji = String(reaction?.emoji || '');
    if (!emoji) return groups;
    groups[emoji] ||= { emoji, userIds: [] };
    groups[emoji].userIds.push(reaction.userId);
    return groups;
  }, {}));

  useEffect(() => {
    if (!contextOpen) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target.closest?.('.message-context-menu')) return;
      setContextOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextOpen]);

  useEffect(() => () => window.clearTimeout(longPressTimerRef.current), []);

  function handlePointerDown(event) {
    if (event.pointerType !== 'touch' || event.target.closest('button, a, input, video')) return;
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setContextOpen(true);
      navigator.vibrate?.(14);
    }, 440);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    if (Math.abs(event.clientX - start.x) > 12 || Math.abs(event.clientY - start.y) > 12) {
      window.clearTimeout(longPressTimerRef.current);
    }
    setSwipeOffset(Math.min(72, Math.max(0, event.clientX - start.x)));
  }

  function handlePointerEnd(event) {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    window.clearTimeout(longPressTimerRef.current);
    pointerStartRef.current = null;
    if (swipeOffset >= 52) onReply?.(message);
    setSwipeOffset(0);
  }

  function handleDoubleClick(event) {
    if (event.target.closest('button, a, input, video, audio')) return;
    onToggleReaction?.(message, '❤️');
  }

  function runContextAction(action) {
    setContextOpen(false);
    action?.();
  }

  return (
    <>
      {showDateDivider ? (
        <div className="message-date-divider">
          {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(new Date(message.createdAt))}
        </div>
      ) : null}
      {showUnreadDivider ? <div className="message-unread-divider"><span>Unread messages</span></div> : null}
      <article
        className={`${isOwn ? 'message-card own' : 'message-card incoming'} ${authorColorClass}${grouped ? ' grouped' : ''}${groupedWithNext ? ' grouped-next' : ''}${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}${emojiOnly ? ' emoji-only' : ''}${message.pinnedAt ? ' pinned' : ''}${message.bookmarked ? ' bookmarked' : ''}`}
        data-message-id={message.id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextOpen(true);
        }}
      >
        <span className="message-swipe-reply" aria-hidden="true" style={{ opacity: swipeOffset / 52 }}>
          <AppIcon name="arrowLeft" size={18} />
        </span>
        {!isOwn && !groupedWithNext ? (
          <button className="avatar-chip avatar-button message-avatar" type="button" style={getProfileStyle(message.author)} onClick={() => onAvatarClick?.(message.author)}>
            {message.author?.avatarUrl ? <img src={getAttachmentUrl(message.author.avatarUrl)} alt={getDisplayName(message.author)} /> : getDisplayName(message.author).slice(0, 1).toUpperCase()}
          </button>
        ) : !isOwn ? <span className="message-avatar-spacer" aria-hidden="true" /> : null}
        <div className="message-bubble" style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined }}>
          {selected ? <span className="message-selected-check" aria-label="Selected">✓</span> : null}
          {!isOwn && !grouped ? (
            <button className="message-author" type="button" onClick={() => onAvatarClick?.(message.author)}>
              {getDisplayName(message.author)}
            </button>
          ) : null}
          {message.forwardedFromName ? (
            <div className="forwarded-label">
              <AppIcon name="arrowLeft" size={13} />
              Forwarded from {message.forwardedFromName}
            </div>
          ) : null}
          {message.replyTo && !message.replyTo.deletedAt ? (
            <button className="reply-snippet" type="button" onClick={() => onNavigateToReply?.(message.replyTo)}>
              <strong>{getDisplayName(message.replyTo.author) || 'Reply'}</strong>
              <span>{message.replyTo.content || message.replyTo.attachmentName || 'Attachment'}</span>
            </button>
          ) : null}
          {message.content ? <RichMessageText content={message.content} /> : null}
          {message.poll ? <PollCard poll={message.poll} currentUserId={currentUserId} onVote={onPollVote} /> : null}
          {firstUrl ? (
            <a className="message-link-preview" href={firstUrl.href} target="_blank" rel="noreferrer">
              <span>{firstUrl.hostname.replace(/^www\./, '')}</span>
              <strong>{firstUrl.pathname === '/' ? firstUrl.hostname : decodeURIComponent(firstUrl.pathname).slice(0, 90)}</strong>
              <small>{firstUrl.href}</small>
            </a>
          ) : null}
          <MessageAttachment message={message} onOpenMedia={onOpenMedia} />
          {message.transcript ? (
            <details className="message-transcript">
              <summary>Transcript</summary>
              <p>{message.transcript}</p>
            </details>
          ) : null}
          {reactions.length > 0 ? (
            <div className="message-reactions" aria-label="Message reactions">
              {reactions.map((reaction) => {
                const reacted = reaction.userIds.some((id) => String(id) === String(currentUserId));
                return (
                  <button
                    className={reacted ? 'message-reaction reacted' : 'message-reaction'}
                    type="button"
                    key={reaction.emoji}
                    aria-label={`${reaction.emoji} reaction, ${reaction.userIds.length}`}
                    onClick={() => onToggleReaction?.(message, reaction.emoji)}
                  >
                    <span>{reaction.emoji}</span>
                    <strong>{reaction.userIds.length}</strong>
                  </button>
                );
              })}
            </div>
          ) : null}
          {(message.threadReplyCount || message._count?.replies) ? (
            <button className="thread-link" type="button" onClick={() => onOpenThread?.(message)}>
              <span className="thread-avatars" aria-hidden="true"><AppIcon name="browser" size={15} /></span>
              <strong>{message.threadReplyCount || message._count?.replies} replies</strong>
              <span>Open thread</span>
            </button>
          ) : null}
          <div className="message-footer">
            {message.queued ? <span className="message-queued">queued</span> : message.optimistic ? <span>sending</span> : null}
            {message.pinnedAt ? <span className="message-pinned-mark" title="Pinned">◆</span> : null}
            {message.bookmarked ? <AppIcon name="bookmark" size={12} /> : null}
            {message.editedAt ? <button className="message-history-link" type="button" onClick={() => onHistory?.(message)}>edited</button> : null}
            <time dateTime={message.createdAt}>{timeLabel}</time>
            {workspace === 'dm' && isOwn ? (
              <span className={`message-delivery-check ${message.readAt ? 'is-read' : 'is-delivered'}`} aria-label={message.readAt ? 'Read' : 'Delivered'}>
                {message.readAt ? '✓✓' : '✓'}
              </span>
            ) : null}
          </div>
          <div className="message-actions">
            <button type="button" aria-label="React with heart" title="React with heart" onClick={() => onToggleReaction?.(message, '❤️')}>❤️</button>
            <button type="button" aria-label="Message menu" title="Message menu" onClick={() => setContextOpen((value) => !value)}><AppIcon name="more" size={16} /></button>
          </div>
          {contextOpen ? (
            <div className="message-context-menu" role="menu">
              <div className="message-context-reactions">
                {QUICK_REACTIONS.map((emoji) => (
                  <button type="button" key={emoji} aria-label={`React ${emoji}`} onClick={() => runContextAction(() => onToggleReaction?.(message, emoji))}>{emoji}</button>
                ))}
              </div>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onReply?.(message))}>Reply</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onOpenThread?.(message))}>Open thread</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onCopy?.(message))}>Copy</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onShare?.(message))}>Share</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onForward?.(message))}>Forward</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onPin?.(message))}>{message.pinnedAt ? 'Unpin' : 'Pin'}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onBookmark?.(message))}>{message.bookmarked ? 'Remove from Saved' : 'Save message'}</button>
              {message.editedAt ? <button type="button" role="menuitem" onClick={() => runContextAction(() => onHistory?.(message))}>Edit history</button> : null}
              <button type="button" role="menuitem" onClick={() => runContextAction(() => onSelect?.(message))}>{selected ? 'Unselect' : 'Select'}</button>
              {isOwn && message.content ? <button type="button" role="menuitem" onClick={() => runContextAction(() => onEdit?.(message))}>Edit</button> : null}
              {!isOwn ? <button type="button" role="menuitem" onClick={() => runContextAction(() => onReport?.(message))}>Report</button> : null}
              {canDelete ? <button className="danger-text" type="button" role="menuitem" onClick={() => runContextAction(() => onDelete?.(message))}>Delete</button> : null}
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}

function ForwardMessagesModal({ messages, channels, conversations, onSend, onClose }) {
  if (!messages?.length) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card forward-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Forward {messages.length === 1 ? 'message' : `${messages.length} messages`}</h3>
            <p className="muted">Choose a destination. Attachments and attribution will be preserved.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        <div className="forward-targets">
          <p className="section-label">Channels</p>
          {channels.map((channel) => (
            <button type="button" key={`channel-${channel.id}`} onClick={() => onSend({ type: 'channel', id: channel.id })}>
              <AppIcon name="hash" size={17} />
              <span>{channel.name}</span>
            </button>
          ))}
          <p className="section-label">Direct messages</p>
          {conversations.map((conversation) => (
            <button type="button" key={`dm-${conversation.id}`} onClick={() => onSend({ type: 'dm', id: conversation.id })}>
              <AppIcon name="hash" size={17} />
              <span>{getConversationTitle(conversation)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SavedMessagesModal({ open, loading, bookmarks, onOpen, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card saved-messages-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Saved messages</h3>
            <p className="muted">Your private cross-device bookmarks.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close saved messages" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        <div className="saved-message-list">
          {loading ? <p className="muted">Loading saved messages…</p> : null}
          {!loading && bookmarks.length === 0 ? <p className="muted">Nothing saved yet. Open a message menu and choose Save message.</p> : null}
          {bookmarks.map((bookmark) => (
            <button type="button" key={bookmark.id} onClick={() => onOpen(bookmark)}>
              <UserAvatar user={bookmark.message.author} />
              <span>
                <strong>{bookmark.type === 'channel' ? `#${bookmark.message.channel?.name || 'channel'}` : getConversationTitle(bookmark.conversation)}</strong>
                <small>{bookmark.message.content || bookmark.message.attachmentName || 'Attachment'}</small>
              </span>
              <time>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(bookmark.createdAt))}</time>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageHistoryModal({ payload, loading, onClose }) {
  if (!payload && !loading) return null;
  const history = payload?.history || [];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card message-history-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Edit history</h3>
            <p className="muted">Previous versions are read-only.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close edit history" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        {loading ? <p className="muted">Loading history…</p> : (
          <div className="message-history-list">
            <article className="current">
              <strong>Current version</strong>
              <p>{payload?.message?.content || 'Empty message'}</p>
            </article>
            {history.map((entry) => (
              <article key={entry.id}>
                <span>
                  <strong>{getDisplayName(entry.editor)}</strong>
                  <time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time>
                </span>
                <p>{entry.previousContent}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatListRow({ conversation, preference, draft, selected, unread, onSelect, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const preview = draft
    ? <><strong className="chat-draft-label">Draft:</strong> {draft}</>
    : conversation.lastMessage?.content || conversation.lastMessage?.attachmentName || getConversationSubtitle(conversation);
  return (
    <div className={`chat-list-row-wrap${menuOpen ? ' menu-open' : ''}`}>
      <button
        className={`${selected ? 'chat-list-row active' : 'chat-list-row'}${unread ? ' unread' : ''}`}
        type="button"
        onClick={onSelect}
        onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') timerRef.current = window.setTimeout(() => setMenuOpen(true), 460);
        }}
        onPointerUp={() => window.clearTimeout(timerRef.current)}
        onPointerCancel={() => window.clearTimeout(timerRef.current)}
      >
        <UserAvatar user={conversation.user} />
        <span className="chat-list-copy">
          <span className="chat-list-title">
            <strong>{getConversationTitle(conversation)}</strong>
            <time>{conversation.lastMessage?.createdAt ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(conversation.lastMessage.createdAt)) : ''}</time>
          </span>
          <span className="chat-list-preview">{preview}</span>
        </span>
        <span className="chat-list-flags">
          {preference.muted ? <AppIcon name="volumeOff" size={14} /> : null}
          {preference.pinned ? <AppIcon name="pin" size={14} /> : null}
          {unread ? <b>{conversation.unreadCount || '•'}</b> : null}
        </span>
      </button>
      {menuOpen ? (
        <div className="chat-row-menu" role="menu">
          <button type="button" onClick={() => { onToggle('pinned'); setMenuOpen(false); }}>{preference.pinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" onClick={() => { onToggle('muted'); setMenuOpen(false); }}>{preference.muted ? 'Unmute' : 'Mute'}</button>
          <button type="button" onClick={() => { onToggle('archived'); setMenuOpen(false); }}>{preference.archived ? 'Restore' : 'Archive'}</button>
          <button type="button" onClick={() => setMenuOpen(false)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}

function ChatInfoPanel({ open, conversation, channel, messages, mediaItems = [], mediaLoading = false, mediaHasMore = false, pinnedMessages, muted, onToggleMute, onLoadMoreMedia, onOpenMessage, onClose }) {
  if (!open) return null;
  const loadedMedia = messages.filter((message) => /^(IMAGE|VIDEO|CIRCLE_VIDEO)$/i.test(message.attachmentType || ''));
  const media = mediaItems.length > 0 ? mediaItems : loadedMedia;
  const files = messages.filter((message) => message.attachmentUrl && !/^(IMAGE|VIDEO|CIRCLE_VIDEO)$/i.test(message.attachmentType || ''));
  const links = messages.flatMap((message) => {
    const match = String(message.content || '').match(/https?:\/\/[^\s]+/g) || [];
    return match.map((url) => ({ url, message }));
  });
  return (
    <aside className="chat-info-panel" aria-label="Chat information">
      <div className="chat-info-header">
        <strong>Chat info</strong>
        <button className="icon-btn" type="button" aria-label="Close chat info" onClick={onClose}><AppIcon name="close" /></button>
      </div>
      <div className="chat-info-profile">
        {conversation?.user ? <UserAvatar user={conversation.user} /> : <span className="channel-icon"><AppIcon name="hash" /></span>}
        <h3>{conversation ? getConversationTitle(conversation) : channel?.name || 'Channel'}</h3>
        <p>{conversation ? getConversationSubtitle(conversation) : 'Shared workspace channel'}</p>
      </div>
      <div className="chat-info-actions">
        <button type="button" onClick={onToggleMute}><AppIcon name={muted ? 'volume' : 'volumeOff'} size={17} />{muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" onClick={() => document.querySelector('[aria-label="Search"]')?.click()}><AppIcon name="search" size={17} />Search</button>
      </div>
      <div className="chat-info-stats">
        <span><strong>{media.length}</strong> media</span>
        <span><strong>{files.length}</strong> files</span>
        <span><strong>{links.length}</strong> links</span>
        <span><strong>{pinnedMessages.length}</strong> pinned</span>
      </div>
      <section>
        <p className="section-label">Shared media</p>
        <div className="chat-media-grid">
          {media.map((message) => {
            const kind = getAttachmentKind(message);
            const url = getAttachmentUrl(message.attachmentUrl);
            return (
              <button type="button" key={message.id} onClick={() => onOpenMessage(message)}>
                {kind === 'IMAGE'
                  ? <img src={url} alt={message.attachmentName || 'Shared media'} loading="lazy" />
                  : <video src={url} aria-label={message.attachmentName || 'Shared video'} preload="metadata" muted playsInline />}
                {kind === 'CIRCLE_VIDEO' ? <span className="chat-media-kind"><AppIcon name="circleVideo" size={14} /></span> : null}
              </button>
            );
          })}
          {media.length === 0 ? <p className="muted">No shared media yet.</p> : null}
        </div>
        {mediaLoading ? <p className="muted">Loading media…</p> : null}
        {mediaHasMore && !mediaLoading ? <button className="ghost-btn chat-media-more" type="button" onClick={onLoadMoreMedia}>Load older media</button> : null}
      </section>
      <section>
        <p className="section-label">Recent links and files</p>
        {[...links.slice(-4).map(({ url, message }) => ({ label: url, message })), ...files.slice(-4).map((message) => ({ label: message.attachmentName || 'Attachment', message }))].map((item, index) => (
          <button className="chat-info-item" type="button" key={`${item.message.id}-${index}`} onClick={() => onOpenMessage(item.message)}>{item.label}</button>
        ))}
      </section>
    </aside>
  );
}

function GlobalSearchPalette({ open, query, scope, loading, results, onQueryChange, onScopeChange, onOpenResult, onClose }) {
  if (!open) return null;
  const users = results?.users || [];
  const channels = results?.channels || [];
  const conversations = results?.conversations || [];
  const channelMessages = results?.channelMessages || [];
  const directMessages = results?.directMessages || [];
  const resultCount = users.length + channels.length + conversations.length + channelMessages.length + directMessages.length;
  const empty = query.trim().length >= 2 && !loading && resultCount === 0;
  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="global-search-palette" role="dialog" aria-modal="true" aria-label="Search WebCord">
        <div className="global-search-input">
          <AppIcon name="search" />
          <input autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="People, chats and messages" />
          <kbd>Esc</kbd>
        </div>
        <nav className="global-search-scopes" aria-label="Search scope">
          {[
            ['all', 'All'],
            ['people', 'People'],
            ['channels', 'Channels'],
            ['dm', 'Chats'],
            ['files', 'Files']
          ].map(([id, label]) => (
            <button key={id} className={scope === id ? 'active' : ''} type="button" onClick={() => onScopeChange(id)}>{label}</button>
          ))}
        </nav>
        <div className="global-search-results">
          {query.trim().length < 2 ? <p className="muted">Type at least two characters. Press Ctrl K anywhere to return here.</p> : null}
          {loading ? <p className="muted">Searching across WebCord…</p> : null}
          {users.length ? <h4>People</h4> : null}
          {users.map((profile) => (
            <button type="button" key={`user-${profile.id}`} onClick={() => onOpenResult({ type: 'user', profile })}>
              <UserAvatar user={profile} />
              <span><strong>{getDisplayName(profile)}</strong><small>{getUsernameTag(profile)}</small></span>
            </button>
          ))}
          {channels.length ? <h4>Channels</h4> : null}
          {channels.map((channel) => (
            <button type="button" key={`channel-target-${channel.id}`} onClick={() => onOpenResult({ type: 'channel', channel })}>
              <AppIcon name={channel.type === 'VOICE' ? 'wave' : 'hash'} />
              <span><strong>{channel.name}</strong><small>{channel.type === 'VOICE' ? 'Voice channel' : 'Text channel'}</small></span>
            </button>
          ))}
          {conversations.length ? <h4>Chats</h4> : null}
          {conversations.map((conversation) => (
            <button type="button" key={`conversation-${conversation.id}`} onClick={() => onOpenResult({ type: 'conversation', conversation })}>
              <UserAvatar user={conversation.user || conversation.members?.[0]} />
              <span><strong>{getConversationTitle(conversation)}</strong><small>{getConversationSubtitle(conversation)}</small></span>
            </button>
          ))}
          {channelMessages.length ? <h4>Messages in channels</h4> : null}
          {channelMessages.map((message) => (
            <button type="button" key={`channel-${message.id}`} onClick={() => onOpenResult({ type: 'channel-message', message })}>
              <AppIcon name="hash" />
              <span><strong>{message.channel?.name || 'Channel'}</strong><small>{message.content || message.attachmentName || 'Attachment'}</small></span>
            </button>
          ))}
          {directMessages.length ? <h4>Direct messages</h4> : null}
          {directMessages.map((message) => (
            <button type="button" key={`dm-${message.id}`} onClick={() => onOpenResult({ type: 'direct-message', message })}>
              <UserAvatar user={message.author} />
              <span><strong>{getDisplayName(message.author)}</strong><small>{message.content || message.attachmentName || 'Attachment'}</small></span>
            </button>
          ))}
          {empty ? <p className="muted">Nothing matched this search.</p> : null}
        </div>
      </section>
    </div>
  );
}

function UserProfileModal({ open, profile, relationshipLabel, canAddFriend, isBlocked, onAddFriend, onReport, onBlock, onUnblock, onClose }) {
  if (!open || !profile) return null;
  const displayName = getDisplayName(profile);
  const canUseSafetyActions = relationshipLabel !== 'This is you';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-banner" style={getProfileBannerStyle(profile)} />
        <div className="profile-modal-body">
          <div className="profile-avatar-wrap">
            <UserAvatar user={profile} label={displayName} className="large" />
          </div>

          <div className="modal-header">
            <div>
              <div className="profile-title-row">
                <h3>{displayName}</h3>
                <span className="profile-accent-dot" style={getProfileStyle(profile)} />
              </div>
              <p className="profile-username">{getUsernameTag(profile)}</p>
              <p className="profile-status-line">{profile.statusText || 'Online'}</p>
              <p className="muted">{profile.bio || 'No bio yet.'}</p>
            </div>
            <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
          </div>

          <ProfileTrackPlayer profile={profile} />

          <div className="viewer-actions">
            <span className="request-pill">{relationshipLabel}</span>
            {canAddFriend ? <button type="button" onClick={onAddFriend}>Add friend</button> : null}
            {canUseSafetyActions ? <button className="ghost-btn" type="button" onClick={onReport}>Report</button> : null}
            {canUseSafetyActions && isBlocked ? (
              <button className="ghost-btn" type="button" onClick={onUnblock}>Unblock</button>
            ) : null}
            {canUseSafetyActions && !isBlocked ? (
              <button className="danger" type="button" onClick={onBlock}>Block</button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');

  if (!target) return null;

  const title = target.targetType === 'USER'
    ? `Report ${getDisplayName(target.user)}`
    : 'Report message';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form
        className="modal-card report-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ ...target, reason, details });
        }}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">Reports go to the admin moderation queue.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
        </div>
        <label>
          Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {REPORT_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Details
          <textarea value={details} maxLength={700} rows={4} onChange={(event) => setDetails(event.target.value)} placeholder="Optional context for moderators" />
        </label>
        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button type="submit">Send report</button>
        </div>
      </form>
    </div>
  );
}

function ProfileAccentPicker({ value, onChange }) {
  const normalized = normalizeProfileAccent(value);

  return (
    <div className="profile-accent-field">
      <span>Accent color</span>
      <div className="profile-accent-row">
        {PROFILE_ACCENTS.map((accent) => (
          <button
            key={accent}
            className={normalized === accent ? 'accent-swatch active' : 'accent-swatch'}
            type="button"
            title={accent}
            aria-label={`Use accent ${accent}`}
            style={{ background: accent }}
            onClick={() => onChange(accent)}
          />
        ))}
        <input
          className="profile-accent-input"
          type="color"
          value={normalized}
          onChange={(event) => onChange(event.target.value)}
        />
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
  const previewUser = { ...user, ...draft, accentColor: normalizeProfileAccent(draft.accentColor) };
  const displayName = getDisplayName(previewUser);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-banner" style={getProfileBannerStyle(previewUser)}>
          <button className="ghost-btn floating-action" type="button" onClick={onUploadBanner}>
            {bannerUploading ? 'Uploading...' : 'Change banner'}
          </button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-avatar-wrap">
            <UserAvatar user={previewUser} label={displayName} className="large" />
            <button className="ghost-btn" type="button" onClick={onUploadAvatar}>
              {avatarUploading ? 'Uploading...' : 'Change avatar'}
            </button>
          </div>

          <div className="modal-header">
            <div>
              <h3>Profile Studio</h3>
              <p className="muted">Profile identity, media and personalization are synced from the backend.</p>
            </div>
            <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>
          </div>

          <div className="channel-form">
            <input value={draft.displayName} onChange={(e) => onChange({ ...draft, displayName: e.target.value.slice(0, 40) })} placeholder="Display name" maxLength={40} />
            <input value={draft.statusText} onChange={(e) => onChange({ ...draft, statusText: e.target.value.slice(0, 80) })} placeholder="Status" maxLength={80} />
            <input value={draft.favoriteTrack} onChange={(e) => onChange({ ...draft, favoriteTrack: e.target.value.slice(0, 120) })} placeholder="Favorite track" maxLength={120} />
            <ProfileAccentPicker value={draft.accentColor} onChange={(accentColor) => onChange({ ...draft, accentColor })} />
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
  const displayLabel = label || getDisplayName(user);

  return (
    <span className={`profile-avatar ${className}`} style={getProfileStyle(user)}>
      {user?.avatarUrl ? <img src={getAttachmentUrl(user.avatarUrl)} alt={displayLabel} /> : displayLabel.slice(0, 1).toUpperCase()}
    </span>
  );
}

function VoiceParticipantTile({ participant, compact = false, volume = 100, onVolumeChange, onOpenProfile }) {
  const isSelf = participant.socketId === 'self';

  return (
    <div className={compact ? 'voice-person compact' : 'voice-person'}>
      <button
        className="voice-profile-button"
        type="button"
        aria-label={`Open ${participant.username} profile`}
        title={`Open ${participant.username} profile`}
        onClick={() => onOpenProfile?.(participant.user)}
      >
        <UserAvatar user={participant.user} label={participant.username} className="voice-avatar" />
      </button>
      <div className="voice-person-copy">
        <strong>{participant.username}</strong>
        <span>{participant.status}</span>
      </div>
      {participant.handRaised ? <span className="voice-chip hand"><AppIcon name="hand" size={14} />Hand raised</span> : null}
      {participant.muted ? <span className="voice-chip">Muted</span> : null}
      {!isSelf ? (
        <label className="voice-volume-control">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="200"
            value={volume}
            onChange={(event) => onVolumeChange?.(participant.socketId, Number(event.target.value))}
          />
          <em>{volume}%</em>
        </label>
      ) : null}
    </div>
  );
}

function VoiceQualityPill({ quality = DEFAULT_VOICE_QUALITY }) {
  const loss = Number(quality.packetLossPercent || 0);
  const tone = quality.label === 'Good' ? 'good' : quality.label === 'Fair' ? 'fair' : quality.label === 'Poor' ? 'poor' : 'idle';
  return (
    <div className={`voice-quality-pill ${tone}`} title={`RTT ${quality.rttMs}ms, jitter ${quality.jitterMs}ms, loss ${loss.toFixed(1)}%, route ${quality.usingRelay ? 'relay' : 'direct'}`}>
      <span>{quality.speaking ? <AppIcon name="wave" size={14} /> : <AppIcon name="phone" size={14} />}</span>
      <strong>{quality.label}</strong>
      <em>{quality.rttMs}ms</em>
      <em>{quality.jitterMs}j</em>
      <em>{loss.toFixed(loss >= 10 ? 0 : 1)}% loss</em>
      <em>{quality.inboundKbps}/{quality.outboundKbps} kbps</em>
      <em>{quality.usingRelay ? 'relay' : 'direct'}</em>
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
  onToggleHand,
  onToggleScreen,
  onToggleCamera,
  onToggleExpanded,
  micMuted,
  handRaised,
  screenSharing,
  cameraEnabled,
  expanded,
  participants,
  remoteStreams,
  voiceParticipants,
  voiceStatus,
  voiceQuality,
  participantVolumes,
  onParticipantVolumeChange,
  onParticipantProfileOpen
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
          <VoiceQualityPill quality={voiceQuality} />
        </div>
        <div className="voice-actions">
          <span className="live-pill">Noise {noiseSuppressionEnabled ? 'on' : 'off'}</span>
          <button type="button" onClick={onToggleMic}><AppIcon name={micMuted ? 'micOff' : 'mic'} size={16} />{micMuted ? 'Unmute' : 'Mute'}</button>
          <button className={handRaised ? 'active' : ''} type="button" aria-pressed={handRaised} onClick={onToggleHand}><AppIcon name="hand" size={16} />{handRaised ? 'Lower hand' : 'Raise hand'}</button>
          <button type="button" onClick={onToggleScreen}><AppIcon name="screen" size={16} />{screenSharing ? 'Stop share' : 'Share'}</button>
          <button type="button" onClick={onToggleCamera}><AppIcon name={cameraEnabled ? 'cameraOff' : 'camera'} size={16} />{cameraEnabled ? 'Camera off' : 'Camera'}</button>
          <button type="button" onClick={onToggleExpanded}><AppIcon name={expanded ? 'shrink' : 'expand'} size={16} />{expanded ? 'Compact' : 'Expand'}</button>
          <button className="danger" type="button" onClick={onLeave}><AppIcon name="phoneOff" size={16} />Leave</button>
        </div>
      </div>

      {spotlight ? (
        <div className="share-layout">
          <div className="share-frame">
            <video
              autoPlay
              playsInline
              muted
              ref={(node) => {
                if (node && node.srcObject !== spotlight.stream) node.srcObject = spotlight.stream;
              }}
            />
            <div className="share-caption">
              <strong>{spotlight.username}</strong>
              <span>{spotlight.label}</span>
              {'pictureInPictureEnabled' in document ? (
                <button
                  type="button"
                  onClick={(event) => {
                    const video = event.currentTarget.closest('.share-frame')?.querySelector('video');
                    if (!video) return;
                    if (document.pictureInPictureElement) document.exitPictureInPicture?.().catch(() => {});
                    else video.requestPictureInPicture?.().catch(() => {});
                  }}
                >Picture in picture</button>
              ) : null}
            </div>
          </div>
          <div className="voice-filmstrip">
            {participants.map((participant) => (
              <VoiceParticipantTile
                key={participant.socketId}
                participant={participant}
                compact
                volume={participantVolumes[participant.socketId] ?? 100}
                onVolumeChange={onParticipantVolumeChange}
                onOpenProfile={onParticipantProfileOpen}
              />
            ))}
            {videoEntries.slice(1).map((entry) => (
              <div className="voice-mini-video" key={entry.socketId}>
                <video
                  autoPlay
                  playsInline
                  muted
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
          {participants.map((participant) => (
            <VoiceParticipantTile
              key={participant.socketId}
              participant={participant}
              volume={participantVolumes[participant.socketId] ?? 100}
              onVolumeChange={onParticipantVolumeChange}
              onOpenProfile={onParticipantProfileOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DesktopTitleBar({ user, onOpenSettings, onWindowAction }) {
  return (
    <div className="desktop-titlebar">
      <div className="titlebar-drag" data-tauri-drag-region>
        <span className="titlebar-mark"><BrandLogo /></span>
        <span className="titlebar-name">WebCord</span>
        <span className="titlebar-channel">{user ? getDisplayName(user) : 'Desktop'}</span>
      </div>
      <div className="titlebar-actions">
        <button type="button" title="Settings" aria-label="Settings" onClick={onOpenSettings}><AppIcon name="settings" size={16} /></button>
        <button type="button" title="Minimize" aria-label="Minimize" onClick={() => onWindowAction('minimize')}><AppIcon name="minus" size={16} /></button>
        <button type="button" title="Maximize" aria-label="Maximize" onClick={() => onWindowAction('maximize')}><AppIcon name="expand" size={16} /></button>
        <button className="titlebar-close" type="button" title="Close" aria-label="Close" onClick={() => onWindowAction('close')}><AppIcon name="close" size={16} /></button>
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
  colorMode,
  inputVolume,
  outputVolume,
  micMuted,
  cameraEnabled,
  cameraTesting,
  cameraPreviewStream,
  noiseSuppressionEnabled,
  mediaDevices,
  clientSettings,
  channels = [],
  friends = [],
  customFolders = [],
  newFolderName = '',
  avatarUploading,
  bannerUploading,
  trackUploading,
  onClose,
  onSectionChange,
  onDraftChange,
  onUploadAvatar,
  onUploadBanner,
  onUploadTrack,
  onRemoveTrack,
  onSaveProfile,
  onThemeChange,
  onColorModeChange,
  onThemeReset,
  onInputVolumeChange,
  onOutputVolumeChange,
  onToggleMic,
  onToggleCamera,
  onTestCamera,
  onToggleCameraPreview,
  onClientSettingChange,
  onRefreshDevices,
  onToggleNotifications,
  onCheckUpdates,
  onToggleNoiseSuppression,
  onNewFolderNameChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolderChannel,
  onToggleFolderFriend,
  onUploadChatWallpaper,
  onClearChatWallpaper,
  onChatWallpaperDimChange,
  apiUrl,
  token,
  onLogout
}) {
  if (!open) return null;
  const accountName = getDisplayName(user);
  const draftProfile = { ...user, ...draft, accentColor: normalizeProfileAccent(draft?.accentColor) };
  const draftName = getDisplayName(draftProfile);
  const textChannels = (channels || []).filter((channel) => channel.type === 'TEXT');
  const voiceChannels = (channels || []).filter((channel) => channel.type === 'VOICE');

  const navItems = [
    ['account', 'Account'],
    ['profile', 'Profile'],
    ['folders', 'Folders'],
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
            <strong>{accountName}</strong>
            <span>{user?.statusText || user?.bio || 'Customize your client'}</span>
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
        <button className="settings-close" type="button" aria-label="Close" title="Close" onClick={onClose}><AppIcon name="close" /></button>

        {activeSection === 'account' ? (
          <div className="settings-page">
            <h2>My Account</h2>
            <div className="account-hero" style={getProfileBannerStyle(user)}>
              <UserAvatar user={user} className="account-avatar" />
              <div>
                <h3>{accountName}</h3>
                <p className="profile-username">{getUsernameTag(user)}</p>
                <p>{user?.statusText || 'Online'}</p>
                {user?.favoriteTrack ? <p className="profile-track-inline">{user.favoriteTrack}</p> : null}
              </div>
              <button type="button" onClick={() => onSectionChange('profile')}>Edit Profile</button>
            </div>
            <div className="settings-card-list">
              <div className="settings-row"><span>Username</span><strong>{user?.username}</strong></div>
              <div className="settings-row"><span>Display name</span><strong>{accountName}</strong></div>
              <div className="settings-row"><span>Status</span><strong>{user?.statusText || 'Online'}</strong></div>
              <div className="settings-row"><span>Favorite track</span><strong>{user?.favoriteTrack || 'Not set'}</strong></div>
              <div className="settings-row"><span>Accent</span><strong className="settings-accent-value"><i style={{ background: normalizeProfileAccent(user?.accentColor) }} />{normalizeProfileAccent(user?.accentColor)}</strong></div>
            </div>
          </div>
        ) : null}

        {activeSection === 'profile' ? (
          <div className="settings-page">
            <h2>Profile</h2>
            <div className="profile-editor">
              <div className="profile-preview">
                <div className="profile-banner" style={getProfileBannerStyle(draftProfile)} />
                <div className="profile-preview-body">
                  <UserAvatar user={draftProfile} className="account-avatar" />
                  <div className="profile-title-row">
                    <h3>{draftName}</h3>
                    <span className="profile-accent-dot" style={getProfileStyle(draftProfile)} />
                  </div>
                  <span className="profile-username">{getUsernameTag(user)}</span>
                  <p className="profile-status-line">{draft.statusText || 'Online'}</p>
                  <ProfileTrackPlayer profile={draftProfile} compact />
                  <p>{draft.bio || 'Write a short bio so friends know what you are up to.'}</p>
                </div>
              </div>
              <div className="settings-form-grid">
                <label>Display name<input value={draft.displayName} onChange={(e) => onDraftChange({ ...draft, displayName: e.target.value.slice(0, 40) })} maxLength={40} placeholder={user?.username || 'WebCord user'} /></label>
                <label>Status<input value={draft.statusText} onChange={(e) => onDraftChange({ ...draft, statusText: e.target.value.slice(0, 80) })} maxLength={80} placeholder="Online" /></label>
                <label>Favorite track<input value={draft.favoriteTrack} onChange={(e) => onDraftChange({ ...draft, favoriteTrack: e.target.value.slice(0, 120) })} maxLength={120} placeholder="Artist - Track" /></label>
                <div className="track-upload-row">
                  <ProfileTrackPlayer profile={draftProfile} compact />
                  <div className="settings-actions-row">
                    <button type="button" onClick={onUploadTrack}>{trackUploading ? 'Uploading...' : draft.favoriteTrackUrl ? 'Replace Track' : 'Attach Track'}</button>
                    {draft.favoriteTrackUrl ? <button className="ghost-btn" type="button" onClick={onRemoveTrack}>Remove Track File</button> : null}
                  </div>
                </div>
                <ProfileAccentPicker value={draft.accentColor} onChange={(accentColor) => onDraftChange({ ...draft, accentColor })} />
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

        {activeSection === 'folders' ? (
          <div className="settings-page">
            <h2>Folders</h2>
            <form className="folder-create-row" onSubmit={onCreateFolder}>
              <input value={newFolderName} onChange={(e) => onNewFolderNameChange(e.target.value)} maxLength={32} placeholder="New folder name" />
              <button className="primary-btn" type="submit"><AppIcon name="plus" size={16} />Create</button>
            </form>
            {customFolders.length === 0 ? (
              <div className="settings-card-list folder-empty">
                <div className="settings-row"><span>No folders yet. Create one, then choose channels and friends for it.</span></div>
              </div>
            ) : (
              <div className="folder-editor-list">
                {customFolders.map((folder) => {
                  const selectedChannelIds = new Set(folder.channelIds || []);
                  const selectedFriendIds = new Set(folder.friendIds || []);
                  return (
                    <article className="folder-editor-card" key={folder.id}>
                      <div className="folder-editor-top">
                        <input value={folder.name} onChange={(e) => onRenameFolder(folder.id, e.target.value)} maxLength={32} aria-label="Folder name" />
                        <button className="ghost-btn danger-text" type="button" onClick={() => onDeleteFolder(folder.id)}>Delete</button>
                      </div>
                      <div className="folder-picker-grid">
                        <section>
                          <p className="section-label">Text channels</p>
                          <div className="folder-pick-list">
                            {textChannels.length === 0 ? <p className="muted">No text channels.</p> : textChannels.map((channel) => (
                              <label className="folder-check-row" key={channel.id}>
                                <input type="checkbox" checked={selectedChannelIds.has(String(channel.id))} onChange={() => onToggleFolderChannel(folder.id, channel.id)} />
                                <span># {channel.name}</span>
                              </label>
                            ))}
                          </div>
                        </section>
                        <section>
                          <p className="section-label">Voice channels</p>
                          <div className="folder-pick-list">
                            {voiceChannels.length === 0 ? <p className="muted">No voice channels.</p> : voiceChannels.map((channel) => (
                              <label className="folder-check-row" key={channel.id}>
                                <input type="checkbox" checked={selectedChannelIds.has(String(channel.id))} onChange={() => onToggleFolderChannel(folder.id, channel.id)} />
                                <span><AppIcon name="wave" size={14} />{channel.name}</span>
                              </label>
                            ))}
                          </div>
                        </section>
                        <section>
                          <p className="section-label">Friends</p>
                          <div className="folder-pick-list">
                            {(friends || []).length === 0 ? <p className="muted">No friends yet.</p> : (friends || []).map((friend) => (
                              <label className="folder-check-row" key={friend.id}>
                                <input type="checkbox" checked={selectedFriendIds.has(String(friend.user?.id))} onChange={() => onToggleFolderFriend(folder.id, friend.user?.id)} />
                                <span>{getDisplayName(friend.user)}</span>
                              </label>
                            ))}
                          </div>
                        </section>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {activeSection === 'voice' ? (
          <div className="settings-page">
            <h2>Voice & Video</h2>
            <div className="settings-card-list">
              <label>Input Device<select value={clientSettings.micDeviceId} onChange={(e) => onClientSettingChange('micDeviceId', e.target.value)}><option value="">Default microphone</option>{mediaDevices.audioinput.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</option>)}</select></label>
              <label>Camera<select value={clientSettings.cameraDeviceId} onChange={(e) => onClientSettingChange('cameraDeviceId', e.target.value)}><option value="">Default camera</option>{mediaDevices.videoinput.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Camera ${device.deviceId.slice(0, 5)}`}</option>)}</select></label>
              <label>Output Device<select value={clientSettings.outputDeviceId} onChange={(e) => onClientSettingChange('outputDeviceId', e.target.value)}><option value="">Default output</option>{mediaDevices.audiooutput.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Output ${device.deviceId.slice(0, 5)}`}</option>)}</select></label>
              <label className="settings-slider">Input Volume<span>{inputVolume}%</span><input type="range" min="0" max="200" value={inputVolume} onChange={(e) => onInputVolumeChange(Number(e.target.value))} /></label>
              <label className="settings-slider">Output Volume<span>{outputVolume}%</span><input type="range" min="0" max="200" value={outputVolume} onChange={(e) => onOutputVolumeChange(Number(e.target.value))} /></label>
              {cameraPreviewStream ? (
                <div className="camera-preview">
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(node) => {
                      if (node && node.srcObject !== cameraPreviewStream) node.srcObject = cameraPreviewStream;
                    }}
                  />
                </div>
              ) : null}
              <div className="settings-actions-row">
                <button type="button" onClick={onToggleMic}>{micMuted ? 'Unmute Microphone' : 'Mute Microphone'}</button>
                <button type="button" onClick={onToggleCamera}>{cameraEnabled ? 'Turn Camera Off' : 'Turn Camera On'}</button>
                <button type="button" onClick={onTestCamera}>{cameraTesting ? 'Testing Camera...' : 'Test Camera'}</button>
                <button type="button" onClick={onToggleCameraPreview}>{cameraPreviewStream ? 'Stop Preview' : 'Preview Camera'}</button>
                <button className="ghost-btn" type="button" onClick={onRefreshDevices}>Grant / Refresh Devices</button>
                <button className="ghost-btn" type="button" onClick={onToggleNoiseSuppression}>Noise Suppression: {noiseSuppressionEnabled ? 'On' : 'Off'}</button>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'appearance' ? (
          <div className="settings-page">
            <h2>Appearance</h2>
            <div className="settings-card-list color-mode-settings">
              <div className="settings-row color-mode-row">
                <span>Interface brightness</span>
                <ColorModePicker value={colorMode} onChange={onColorModeChange} />
              </div>
            </div>
            <div className="theme-preview theme-system-summary" style={{ background: theme.panel }}>
              <span style={{ background: theme.accent }}><AppIcon name="zap" size={18} family={theme.iconFamily} /></span>
              <div><strong>{Object.entries(PRESETS).find(([, preset]) => preset.id === theme.id)?.[0] || 'Custom system'}</strong><p>{theme.behavior || 'A coordinated WebCord interface system.'}</p></div>
            </div>
            <div className="theme-system-grid">
              {Object.entries(PRESETS).map(([name, preset]) => (
                <ThemeSystemCard
                  key={name}
                  name={name}
                  preset={preset}
                  active={theme.id === preset.id || theme.mode === preset.mode}
                  onSelect={onThemeChange}
                />
              ))}
            </div>
            <div className="color-grid">
              {['bg', 'panel', 'accent', 'text'].map((key) => (
                <label key={key}>{key}<input type="color" value={theme[key]} onChange={(e) => onThemeChange({ ...theme, [key]: e.target.value })} /></label>
              ))}
            </div>
            <div className="settings-card-list wallpaper-settings">
              <div className="settings-row">
                <span>Chat wallpaper</span>
                <strong>{clientSettings.chatWallpaperName || 'Not set'}</strong>
              </div>
              <label className="settings-slider">
                Wallpaper dim
                <span>{Number(clientSettings.chatWallpaperDim ?? 42)}%</span>
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={Number(clientSettings.chatWallpaperDim ?? 42)}
                  onChange={(e) => onChatWallpaperDimChange(Number(e.target.value))}
                />
              </label>
              <div className="settings-actions-row">
                <button type="button" onClick={onUploadChatWallpaper}>Choose Wallpaper</button>
                <button className="ghost-btn" type="button" onClick={onClearChatWallpaper}>Clear Wallpaper</button>
              </div>
            </div>
            <button className="ghost-btn" type="button" onClick={onThemeReset}>Reset Theme</button>
          </div>
        ) : null}

        {activeSection === 'privacy' ? <StaticSettingsPage title="Privacy" rows={['Friend requests use the existing backend flow.', 'Profile cards expose username, display name, avatar, banner, bio, status, favorite track and accent.', 'No extra tracking settings are stored by this client.']} /> : null}
        {activeSection === 'notifications' ? (
          <div className="settings-page">
            <h2>Notifications</h2>
            <div className="settings-card-list">
              <div className="settings-row"><span>Client notifications</span><button type="button" onClick={onToggleNotifications}>{clientSettings.notificationsEnabled ? 'Enabled' : 'Disabled'}</button></div>
              <label className="settings-row">
                <span>Notify me about</span>
                <select value={clientSettings.notificationMode || 'all'} onChange={(event) => onClientSettingChange('notificationMode', event.target.value)}>
                  <option value="all">All messages</option>
                  <option value="mentions">Mentions and direct messages</option>
                </select>
              </label>
              <div className="settings-row">
                <span>Quiet hours</span>
                <button type="button" onClick={() => onClientSettingChange('quietHoursEnabled', !clientSettings.quietHoursEnabled)}>
                  {clientSettings.quietHoursEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              {clientSettings.quietHoursEnabled ? (
                <div className="settings-time-range">
                  <label>From<input type="time" value={clientSettings.quietHoursStart || '22:00'} onChange={(event) => onClientSettingChange('quietHoursStart', event.target.value)} /></label>
                  <label>Until<input type="time" value={clientSettings.quietHoursEnd || '08:00'} onChange={(event) => onClientSettingChange('quietHoursEnd', event.target.value)} /></label>
                </div>
              ) : null}
              <div className="settings-row"><span>Browser permission</span><strong>{'Notification' in window ? Notification.permission : 'Unsupported'}</strong></div>
              <div className="settings-row"><span>Desktop updates</span><button type="button" onClick={onCheckUpdates}>Check Releases</button></div>
            </div>
          </div>
        ) : null}
        {activeSection === 'devices' ? (
          <div className="settings-page">
            <h2>Devices and desktop</h2>
            <div className="settings-card-list">
              <div className="settings-row"><span>Microphones detected</span><strong>{mediaDevices.audioinput.length}</strong></div>
              <div className="settings-row"><span>Cameras detected</span><strong>{mediaDevices.videoinput.length}</strong></div>
              <div className="settings-row"><span>Outputs detected</span><strong>{mediaDevices.audiooutput.length}</strong></div>
              <div className="settings-row"><span>Launch with Windows</span><button type="button" onClick={() => onClientSettingChange('launchAtLogin', !clientSettings.launchAtLogin)}>{clientSettings.launchAtLogin ? 'Enabled' : 'Disabled'}</button></div>
              <div className="settings-row"><span>Close to tray</span><button type="button" onClick={() => onClientSettingChange('minimizeToTray', !clientSettings.minimizeToTray)}>{clientSettings.minimizeToTray ? 'Enabled' : 'Disabled'}</button></div>
              <div className="settings-row"><span>Media cache</span><button type="button" onClick={() => onClientSettingChange('autoDownloadMedia', !clientSettings.autoDownloadMedia)}>{clientSettings.autoDownloadMedia ? 'Automatic' : 'On demand'}</button></div>
            </div>
            <Suspense fallback={<div className="session-center-loading">Loading security center...</div>}>
              <SessionCenter apiUrl={apiUrl} token={token} onCurrentRevoked={onLogout} />
            </Suspense>
          </div>
        ) : null}
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

function AdminPanel({
  user,
  overview,
  status,
  error,
  roleUpdating,
  moderationUpdating,
  downloadUploading,
  onRefresh,
  onOpenApp,
  onLogout,
  onChangeUserRole,
  onModerateUser,
  onUpdateReport,
  onResolveClientError,
  onUploadDownload,
  onDeleteDownload
}) {
  const [downloadFiles, setDownloadFiles] = useState({});
  const denied = status === 'denied';
  const loading = status === 'checking' || status === 'idle';
  const stats = overview?.stats || {};
  const canEditRoles = Boolean(overview?.canManageRoles || canManageUserRoles(overview?.admin || user));
  const downloads = overview?.downloads || [];
  const downloadAccept = {
    windows: '.zip,.exe,.msi',
    android: '.apk,.aab',
    ios: '.ipa'
  };
  const statCards = [
    ['Users', stats.users],
    ['Text channels', stats.textChannels],
    ['Voice channels', stats.voiceChannels],
    ['Messages', stats.messages],
    ['DM threads', stats.directConversations],
    ['DM messages', stats.directMessages],
    ['Pending requests', stats.pendingFriendRequests],
    ['Voice rooms', stats.voiceRooms],
    ['Open reports', stats.openReports],
    ['Muted users', stats.mutedUsers],
    ['Banned users', stats.bannedUsers]
  ];

  async function handleDownloadSubmit(event, platform) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await onUploadDownload(platform, downloadFiles[platform]);
    if (ok) {
      setDownloadFiles((prev) => ({ ...prev, [platform]: null }));
      form.reset();
    }
  }

  return (
    <main className="admin-shell">
      <section className="admin-hero">
        <div>
          <span className="hero-badge brand-badge"><BrandLogo /> WebCord Admin</span>
          <h1>{denied ? 'Access denied' : 'Control Center'}</h1>
          <p className="muted">{denied ? 'This account is not allowed to open the admin panel.' : `Signed in as @${overview?.admin?.username || user?.username || 'admin'}`}</p>
        </div>
        <div className="admin-actions">
          {!denied ? <button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</button> : null}
          <button className="ghost-btn" type="button" onClick={onOpenApp}>Open WebCord</button>
          <button className="danger" type="button" onClick={onLogout}>Logout</button>
        </div>
      </section>

      {loading ? (
        <section className="admin-state">
          <h2>Checking access</h2>
          <p className="muted">Waiting for the server.</p>
        </section>
      ) : null}

      {denied ? (
        <section className="admin-state denied">
          <h2>Forbidden</h2>
          <p className="muted">{error || 'Your username is not in the admin allowlist.'}</p>
        </section>
      ) : null}

      {!loading && !denied && error ? (
        <section className="admin-state denied">
          <h2>Admin panel unavailable</h2>
          <p className="muted">{error}</p>
        </section>
      ) : null}

      {!loading && !denied && overview ? (
        <>
          <section className="admin-grid">
            {statCards.map(([label, value]) => (
              <div className="admin-stat-card" key={label}>
                <span>{label}</span>
                <strong>{Number(value || 0).toLocaleString()}</strong>
              </div>
            ))}
          </section>

          <section className="admin-columns">
            <div className="admin-panel-card">
              <p className="section-label">Recent users</p>
              {(overview.recentUsers || []).length === 0 ? <p className="muted">No users yet.</p> : overview.recentUsers.map((item) => (
                <div className="admin-user-row" key={item.id}>
                  <UserAvatar user={item} />
                  <div>
                    <strong>@{item.username}</strong>
                    <span>{normalizeUserRole(item.role)} - {item.bio || 'No bio'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="admin-panel-card">
              <p className="section-label">Admins</p>
              <div className="admin-chip-list">
                {(overview.roleUsers || []).map((item) => <span className="live-pill" key={item.id}>@{item.username} - {normalizeUserRole(item.role)}</span>)}
                {(overview.allowedAdmins || []).map((item) => <span className="live-pill" key={item}>env @{item}</span>)}
                {(overview.roleUsers || []).length === 0 && (overview.allowedAdmins || []).length === 0 ? <span className="muted">No admins configured.</span> : null}
              </div>
              <div className="admin-runtime">
                <span>Runtime</span>
                <strong>{overview.runtime?.nodeEnv || 'unknown'}</strong>
                <span>Uptime</span>
                <strong>{Math.floor((overview.runtime?.uptimeSeconds || 0) / 60)} min</strong>
              </div>
            </div>
          </section>

          <section className="admin-panel-card">
            <p className="section-label">Client downloads</p>
            <div className="admin-download-list">
              {downloads.map((download) => {
                const busy = downloadUploading === download.platform;
                return (
                  <form className="admin-download-row" key={download.platform} onSubmit={(event) => handleDownloadSubmit(event, download.platform)}>
                    <div className="admin-download-info">
                      <strong>{download.label}</strong>
                      <span>{download.available ? `${download.fileName} - ${formatFileSize(download.size)}` : 'No file uploaded'}</span>
                      {download.sha256 ? <code title={download.sha256}>SHA256 {download.sha256.slice(0, 16)}...</code> : null}
                    </div>
                    <div className="admin-download-actions">
                      {download.available ? <a className="ghost-btn" href={download.url}>Download</a> : null}
                      <input
                        type="file"
                        accept={downloadAccept[download.platform] || ''}
                        disabled={busy}
                        onChange={(event) => setDownloadFiles((prev) => ({ ...prev, [download.platform]: event.target.files?.[0] || null }))}
                      />
                      <button type="submit" disabled={busy || !downloadFiles[download.platform]}>{busy ? 'Uploading' : 'Upload'}</button>
                      {download.available ? (
                        <button className="danger" type="button" disabled={busy} onClick={() => onDeleteDownload(download.platform)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </form>
                );
              })}
            </div>
          </section>

          <section className="admin-panel-card">
            <p className="section-label">Role management</p>
            <div className="admin-user-list">
              {(overview.manageableUsers || []).map((item) => (
                <div className="admin-user-row admin-role-row" key={item.id}>
                  <UserAvatar user={item} />
                  <div>
                    <strong>@{item.username}</strong>
                    <span>{item.displayName || item.statusText || 'WebCord user'}</span>
                  </div>
                  <select
                    aria-label={`Role for ${item.username}`}
                    value={normalizeUserRole(item.role)}
                    disabled={!canEditRoles || roleUpdating === item.id}
                    onChange={(event) => onChangeUserRole(item.id, event.target.value)}
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                  <div className="admin-inline-actions">
                    <button type="button" disabled={moderationUpdating === `${item.id}:MUTE`} onClick={() => onModerateUser(item.id, 'MUTE', 60, 'Quick mute from admin panel')}>Mute 1h</button>
                    {item.isMuted ? <button type="button" onClick={() => onModerateUser(item.id, 'UNMUTE')}>Unmute</button> : null}
                    <button className="danger" type="button" disabled={moderationUpdating === `${item.id}:BAN`} onClick={() => onModerateUser(item.id, 'BAN', 1440, 'Quick ban from admin panel')}>Ban 24h</button>
                    {item.isBanned ? <button type="button" onClick={() => onModerateUser(item.id, 'UNBAN')}>Unban</button> : null}
                  </div>
                </div>
              ))}
            </div>
            {!canEditRoles ? <p className="muted">Only owners can assign admins.</p> : null}
          </section>

          <section className="admin-panel-card">
            <p className="section-label">Moderation reports</p>
            {(overview.recentReports || []).length === 0 ? <p className="muted">No reports yet.</p> : (
              <div className="admin-user-list">
                {(overview.recentReports || []).map((report) => (
                  <div className="admin-report-row" key={report.id}>
                    <div>
                      <strong>{report.targetType} - {report.reason}</strong>
                      <span>
                        by @{report.reporter?.username || 'user'}
                        {report.targetUser?.username ? ` about @${report.targetUser.username}` : ''}
                        {' - '}
                        {report.status}
                      </span>
                      {report.message?.content || report.directMessage?.content ? <p className="muted">{report.message?.content || report.directMessage?.content}</p> : null}
                      {report.details ? <p>{report.details}</p> : null}
                    </div>
                    {report.status === 'OPEN' ? (
                      <div className="admin-inline-actions">
                        <button type="button" disabled={moderationUpdating === `report:${report.id}`} onClick={() => onUpdateReport(report.id, 'REVIEWED')}>Reviewed</button>
                        <button type="button" disabled={moderationUpdating === `report:${report.id}`} onClick={() => onUpdateReport(report.id, 'RESOLVED')}>Resolved</button>
                        <button className="ghost-btn" type="button" disabled={moderationUpdating === `report:${report.id}`} onClick={() => onUpdateReport(report.id, 'DISMISSED')}>Dismiss</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="admin-panel-card">
            <p className="section-label">Client diagnostics</p>
            {(overview.clientErrors || []).length === 0 ? <p className="muted">No unresolved client errors.</p> : (
              <div className="admin-user-list">
                {(overview.clientErrors || []).map((report) => (
                  <div className="admin-report-row" key={`client-error-${report.id}`}>
                    <div>
                      <strong>{report.platform} {report.appVersion} · {report.message}</strong>
                      <span>@{report.user?.username || 'unknown'} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.createdAt))}</span>
                      {report.stack ? <details><summary>Stack trace</summary><pre>{report.stack}</pre></details> : null}
                    </div>
                    <button type="button" disabled={moderationUpdating === `client-error:${report.id}`} onClick={() => onResolveClientError(report.id)}>Resolve</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function ActivityCenter({ token, onNavigate }) {
  const [data, setData] = useState({ activities: [], unreadCount: 0 });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const suffix = filter ? `?kind=${encodeURIComponent(filter)}` : '';
      setData(await apiFetch(`/activity${suffix}`, {}, token));
    } catch (error) {
      setLoadError(error?.message || 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);

  async function markRead(ids) {
    await apiFetch('/activity/read', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }, token);
    setData((current) => ({
      unreadCount: ids?.length ? Math.max(0, current.unreadCount - ids.length) : 0,
      activities: current.activities.map((item) => (
        !ids?.length || ids.includes(item.id) ? { ...item, unread: false, readAt: new Date().toISOString() } : item
      ))
    }));
  }

  return (
    <div className="activity-workspace workspace-scroll">
      <header className="workspace-hero activity-hero">
        <div>
          <span className="workspace-eyebrow">Activity center</span>
          <h2>Everything that needs you</h2>
          <p>Mentions, replies, calls and updates—without mixing them into the chat list.</p>
        </div>
        <div className="hero-stat"><strong>{data.unreadCount}</strong><span>unread</span></div>
      </header>
      <nav className="activity-filters" aria-label="Activity filters">
        {[['', 'All'], ['MENTION', 'Mentions'], ['REPLY', 'Replies'], ['DIRECT_MESSAGE', 'Messages'], ['CALL', 'Calls'], ['EVENT', 'Events']].map(([id, label]) => (
          <button className={filter === id ? 'active' : ''} type="button" key={id || 'all'} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <button className="mark-read" type="button" disabled={!data.unreadCount} onClick={() => markRead([])}>Mark all read</button>
      </nav>
      <section className="activity-feed" aria-live="polite">
        {loading ? [...Array(5)].map((_, index) => <div className="activity-skeleton" key={index} />) : null}
        {!loading && loadError ? (
          <div className="workspace-empty workspace-error" role="alert"><AppIcon name="wave" size={30} /><h3>Activity is unavailable</h3><p>{loadError}</p><button type="button" onClick={refresh}>Try again</button></div>
        ) : null}
        {!loading && !loadError && data.activities.length === 0 ? (
          <div className="workspace-empty"><AppIcon name="check" size={30} /><h3>You’re all caught up</h3><p>New mentions and replies will appear here.</p></div>
        ) : null}
        {!loadError ? data.activities.map((activity) => (
          <button
            className={activity.unread ? 'activity-item unread' : 'activity-item'}
            type="button"
            key={activity.id}
            onClick={() => {
              if (activity.unread) markRead([activity.id]).catch(() => {});
              onNavigate?.(activity);
            }}
          >
            <UserAvatar user={activity.actor} />
            <span className={`activity-kind kind-${activity.kind.toLowerCase()}`}><AppIcon name={activity.kind === 'CALL' ? 'phone' : activity.kind === 'EVENT' ? 'story' : 'send'} size={14} /></span>
            <span className="activity-copy">
              <strong>{activity.title}</strong>
              <span>{activity.body || 'Open the related conversation'}</span>
              <time>{formatRelativeDate(activity.createdAt)}</time>
            </span>
            {activity.unread ? <span className="activity-unread-dot" /> : null}
          </button>
        )) : null}
      </section>
    </div>
  );
}

function SpacesWorkspace({ token, user, onOpenChannel }) {
  const [data, setData] = useState(null);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [eventOpen, setEventOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState({ title: '', description: '', location: '', startsAt: '' });
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState([]);
  const [members, setMembers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [managementError, setManagementError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [slowModeBusy, setSlowModeBusy] = useState(null);
  const [channelPermissions, setChannelPermissions] = useState({});
  const [spaceDraft, setSpaceDraft] = useState({ name: '', description: '' });
  const [spaceCreating, setSpaceCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [spaces, scheduledMessages] = await Promise.all([
        apiFetch('/spaces', {}, token),
        apiFetch('/scheduled-messages', {}, token)
      ]);
      setData({
        ...spaces,
        events: Array.isArray(spaces?.events) ? spaces.events : [],
        activePolls: Array.isArray(spaces?.activePolls) ? spaces.activePolls : [],
        activityCount: Number(spaces?.activityCount || 0),
        scheduledCount: Number(spaces?.scheduledCount || 0)
      });
      setScheduled(Array.isArray(scheduledMessages) ? scheduledMessages : []);
      const role = String(spaces?.membership?.role || 'MEMBER').toUpperCase();
      const roleRank = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 };
      if (spaces?.guild?.id) {
        try {
          const requests = [apiFetch(`/spaces/${spaces.guild.id}/members`, {}, token)];
          if ((roleRank[role] || 0) >= roleRank.MODERATOR) requests.push(apiFetch(`/spaces/${spaces.guild.id}/audit-log`, {}, token));
          if ((roleRank[role] || 0) >= roleRank.ADMIN) requests.push(apiFetch(`/invites?guildId=${spaces.guild.id}`, {}, token));
          const [memberItems, auditItems = [], inviteItems = []] = await Promise.all(requests);
          setMembers(Array.isArray(memberItems) ? memberItems : []);
          setAuditLog(Array.isArray(auditItems) ? auditItems : []);
          setInvites(Array.isArray(inviteItems) ? inviteItems : []);
          if ((roleRank[role] || 0) >= roleRank.ADMIN) {
            const permissionPayloads = await Promise.all((spaces.guild.channels || []).map((channel) => (
              apiFetch(`/channels/${channel.id}/permissions`, {}, token).catch(() => null)
            )));
            setChannelPermissions(Object.fromEntries(permissionPayloads.filter(Boolean).map((channel) => [channel.id, channel.permissions || []])));
          } else {
            setChannelPermissions({});
          }
          setManagementError('');
        } catch (error) {
          setManagementError(error?.message || 'Community controls did not load.');
        }
      }
    } catch (error) {
      setLoadError(error?.message || 'Could not load Spaces.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const membershipRole = String(data?.membership?.role || 'MEMBER').toUpperCase();
  const membershipRank = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 }[membershipRole] || 0;
  const canModerateSpace = membershipRank >= 1;
  const canAdminSpace = membershipRank >= 2;

  useEffect(() => { refresh(); }, [refresh]);

  async function createEvent(event) {
    event.preventDefault();
    if (!data?.guild?.id) return;
    setBusy(true);
    try {
      await apiFetch('/events', {
        method: 'POST',
        body: JSON.stringify({ ...eventDraft, guildId: data.guild.id })
      }, token);
      setEventOpen(false);
      setEventDraft({ title: '', description: '', location: '', startsAt: '' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rsvp(eventId, status) {
    await apiFetch(`/events/${eventId}/rsvp`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    }, token);
    await refresh();
  }

  async function createInvite() {
    if (!data?.guild?.id || inviteBusy) return;
    setInviteBusy(true);
    try {
      const invite = await apiFetch('/invites', {
        method: 'POST',
        body: JSON.stringify({ guildId: data.guild.id, expiresInHours: 168 })
      }, token);
      setInvites((current) => [invite, ...current]);
      setManagementError('');
    } catch (error) {
      setManagementError(error?.message || 'Could not create invite.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvite(invite) {
    const inviteUrl = `${window.location.origin}/?invite=${encodeURIComponent(invite.code)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setManagementError('');
    } catch {
      setManagementError(`Copy this invite manually: ${inviteUrl}`);
    }
  }

  async function revokeInvite(inviteId) {
    setInviteBusy(true);
    try {
      await apiFetch(`/invites/${inviteId}`, { method: 'DELETE' }, token);
      setInvites((current) => current.map((item) => item.id === inviteId ? { ...item, revokedAt: new Date().toISOString() } : item));
      setManagementError('');
    } catch (error) {
      setManagementError(error?.message || 'Could not revoke invite.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function updateSlowMode(channelId, seconds) {
    setSlowModeBusy(channelId);
    try {
      const channel = await apiFetch(`/channels/${channelId}/slow-mode`, {
        method: 'PATCH',
        body: JSON.stringify({ seconds: Number(seconds) })
      }, token);
      setData((current) => ({
        ...current,
        guild: {
          ...current.guild,
          channels: current.guild.channels.map((item) => item.id === channel.id ? channel : item)
        }
      }));
      setManagementError('');
    } catch (error) {
      setManagementError(error?.message || 'Could not update slow mode.');
    } finally {
      setSlowModeBusy(null);
    }
  }

  async function updateMemberRole(userId, role) {
    if (!data?.guild?.id) return;
    setInviteBusy(true);
    try {
      const member = await apiFetch(`/spaces/${data.guild.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      }, token);
      setMembers((current) => current.map((item) => item.userId === member.userId ? member : item));
      setManagementError('');
    } catch (error) {
      setManagementError(error?.message || 'Could not update member role.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeMember(userId) {
    if (!data?.guild?.id || !window.confirm('Remove this member from the community?')) return;
    setInviteBusy(true);
    try {
      await apiFetch(`/spaces/${data.guild.id}/members/${userId}`, { method: 'DELETE' }, token);
      setMembers((current) => current.filter((item) => item.userId !== userId));
      setManagementError('');
    } catch (error) {
      setManagementError(error?.message || 'Could not remove member.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function createSpace(event) {
    event.preventDefault();
    setSpaceCreating(true);
    setManagementError('');
    try {
      await apiFetch('/spaces', { method: 'POST', body: JSON.stringify(spaceDraft) }, token);
      setSpaceDraft({ name: '', description: '' });
      await refresh();
    } catch (error) {
      setManagementError(error?.message || 'Could not create community.');
    } finally {
      setSpaceCreating(false);
    }
  }

  async function updateChannelAccess(channel, patch) {
    setSlowModeBusy(channel.id);
    try {
      const updated = await apiFetch(`/channels/${channel.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({
          isPrivate: patch.isPrivate ?? channel.isPrivate,
          minimumRole: patch.minimumRole ?? channel.minimumRole ?? 'MEMBER'
        })
      }, token);
      setData((current) => ({
        ...current,
        guild: { ...current.guild, channels: current.guild.channels.map((item) => item.id === updated.id ? { ...item, ...updated } : item) }
      }));
    } catch (error) {
      setManagementError(error?.message || 'Could not update channel access.');
    } finally {
      setSlowModeBusy(null);
    }
  }

  async function toggleChannelMemberAccess(channel, member) {
    const current = channelPermissions[channel.id] || [];
    const existing = current.find((permission) => permission.userId === member.userId);
    try {
      if (existing) {
        await apiFetch(`/channels/${channel.id}/permissions/${member.userId}`, { method: 'DELETE' }, token);
        setChannelPermissions((value) => ({ ...value, [channel.id]: current.filter((permission) => permission.userId !== member.userId) }));
      } else {
        const permission = await apiFetch(`/channels/${channel.id}/permissions/${member.userId}`, {
          method: 'PUT',
          body: JSON.stringify({ canView: true, canPost: true })
        }, token);
        setChannelPermissions((value) => ({ ...value, [channel.id]: [...current, { ...permission, user: member.user }] }));
      }
    } catch (error) {
      setManagementError(error?.message || 'Could not update member channel access.');
    }
  }

  if (loading && !data) {
    return <div className="spaces-workspace workspace-scroll"><div className="spaces-skeleton" /><div className="spaces-card-grid">{[1, 2, 3].map((id) => <div className="spaces-card skeleton" key={id} />)}</div></div>;
  }

  if (loadError && !data) {
    return (
      <div className="spaces-workspace workspace-scroll">
        <div className="workspace-empty workspace-error" role="alert">
          <AppIcon name="wave" size={30} />
          <h3>Spaces did not load</h3>
          <p>{loadError}</p>
          <button type="button" onClick={refresh}>Try again</button>
        </div>
      </div>
    );
  }

  if (!data?.guild) {
    return (
      <div className="spaces-workspace workspace-scroll">
        <form className="workspace-empty space-create-card" onSubmit={createSpace}>
          <AppIcon name="zap" size={30} />
          <h3>Create your first community</h3>
          <p>Start with a ready-made text channel, voice lounge and owner permissions.</p>
          <input required minLength={2} maxLength={80} value={spaceDraft.name} onChange={(event) => setSpaceDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Community name" />
          <textarea maxLength={600} rows={3} value={spaceDraft.description} onChange={(event) => setSpaceDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="What is this space about?" />
          {managementError ? <p className="inline-error">{managementError}</p> : null}
          <button type="submit" disabled={spaceCreating}>{spaceCreating ? 'Creating...' : 'Create community'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="spaces-workspace workspace-scroll">
      <header className="workspace-hero spaces-hero" style={getGuildCoverStyle(data.guild)}>
        <div className="spaces-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <span className="workspace-eyebrow">WebCord Spaces</span>
          <h2>{data.guild.name}</h2>
          <p>{data.guild.description || 'One place for conversations, decisions and live moments.'}</p>
          <div className="spaces-hero-actions">
            <button type="button" onClick={() => onOpenChannel?.()}><AppIcon name="hash" size={16} /> Open chats</button>
            {canModerateSpace ? <button className="ghost-btn" type="button" onClick={() => setEventOpen(true)}><AppIcon name="plus" size={16} /> New event</button> : null}
            <span className="space-role-badge"><AppIcon name="shield" size={14} /> {membershipRole.toLowerCase()}</span>
          </div>
        </div>
        <div className="space-health">
          <span><strong>{data.activePolls.length}</strong> live polls</span>
          <span><strong>{data.events.length}</strong> events</span>
          <span><strong>{data.activityCount}</strong> updates</span>
          <span><strong>{members.length}</strong> members</span>
        </div>
      </header>

      <div className="spaces-card-grid">
        <section className="spaces-card events-card">
          <header><div><span className="workspace-eyebrow">Calendar</span><h3>Upcoming events</h3></div><button className="icon-btn" type="button" aria-label="Create event" onClick={() => setEventOpen(true)}><AppIcon name="plus" /></button></header>
          {data.events.length === 0 ? <p className="muted">No events yet. Schedule the first community moment.</p> : data.events.map((item) => (
            <article className="event-row" key={item.id}>
              <time><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(item.startsAt))}</span></time>
              <div><strong>{item.title}</strong><span>{item.location || new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(item.startsAt))}</span></div>
              <button className={item.rsvp === 'GOING' ? 'active' : ''} type="button" onClick={() => rsvp(item.id, item.rsvp === 'GOING' ? 'INTERESTED' : 'GOING')}>{item.rsvp === 'GOING' ? 'Going' : 'Join'}</button>
            </article>
          ))}
        </section>
        <section className="spaces-card polls-overview-card">
          <header><div><span className="workspace-eyebrow">Decisions</span><h3>Live polls</h3></div><span>{data.activePolls.length}</span></header>
          {data.activePolls.length === 0 ? <p className="muted">Polls from public channels will surface here.</p> : data.activePolls.slice(0, 4).map((poll) => (
            <div className="poll-overview-row" key={poll.id}><span className="poll-pulse" /><div><strong>{poll.question}</strong><span>{poll.totalVoters} voters · {poll.options.length} options</span></div></div>
          ))}
        </section>
        <section className="spaces-card scheduled-card">
          <header><div><span className="workspace-eyebrow">Outbox</span><h3>Scheduled</h3></div><span>{scheduled.length}</span></header>
          {scheduled.length === 0 ? <p className="muted">Long-press Send or use the composer menu to schedule a message.</p> : scheduled.slice(0, 5).map((item) => (
            <div className="scheduled-row" key={item.id}>
              <AppIcon name={item.silent ? 'volumeOff' : 'send'} size={16} />
              <div><strong>{item.content}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.sendAt))}</time></div>
              <button className="icon-btn" type="button" aria-label="Cancel scheduled message" onClick={async () => { await apiFetch(`/scheduled-messages/${item.id}`, { method: 'DELETE' }, token); await refresh(); }}><AppIcon name="close" size={16} /></button>
            </div>
          ))}
        </section>
        {canModerateSpace ? (
          <section className="spaces-card community-controls-card">
            <header><div><span className="workspace-eyebrow">Administration</span><h3>Community controls</h3></div>{canAdminSpace ? <button className="icon-btn" type="button" aria-label="Create invite link" disabled={inviteBusy} onClick={createInvite}><AppIcon name="plus" /></button> : null}</header>
            {managementError ? <p className="inline-error" role="alert">{managementError}</p> : null}
            {canAdminSpace ? <div className="community-control-section">
              <strong>Invite links</strong>
              {invites.filter((invite) => !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt) > new Date())).slice(0, 3).map((invite) => (
                <div className="invite-control-row" key={invite.id}>
                  <code>{invite.code}</code>
                  <span>{invite.uses}{invite.maxUses ? ` / ${invite.maxUses}` : ''} uses</span>
                  <button type="button" onClick={() => copyInvite(invite)} aria-label={`Copy invite ${invite.code}`}><AppIcon name="copy" size={15} /></button>
                  <button type="button" disabled={inviteBusy} onClick={() => revokeInvite(invite.id)} aria-label={`Revoke invite ${invite.code}`}><AppIcon name="close" size={15} /></button>
                </div>
              ))}
              {invites.filter((invite) => !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt) > new Date())).length === 0 ? <p className="muted">No active links. Create a seven-day invite.</p> : null}
            </div> : null}
            <div className="community-control-section">
              <strong>Channel slow mode</strong>
              {(data.guild.channels || []).filter((channel) => channel.type === 'TEXT').map((channel) => (
                <label className="slow-mode-row" key={channel.id}>
                  <span><AppIcon name="hash" size={15} />{channel.name}</span>
                  <select disabled={slowModeBusy === channel.id} value={channel.slowModeSeconds || 0} onChange={(event) => updateSlowMode(channel.id, event.target.value)}>
                    <option value="0">Off</option><option value="5">5 sec</option><option value="15">15 sec</option><option value="30">30 sec</option><option value="60">1 min</option><option value="300">5 min</option>
                  </select>
                </label>
              ))}
            </div>
            {canAdminSpace ? <div className="community-control-section">
              <strong>Channel privacy</strong>
              {(data.guild.channels || []).map((channel) => (
                <React.Fragment key={channel.id}>
                  <div className="channel-access-row">
                    <span><AppIcon name={channel.type === 'TEXT' ? 'hash' : 'volume'} size={15} />{channel.name}</span>
                    <button type="button" disabled={slowModeBusy === channel.id} onClick={() => updateChannelAccess(channel, { isPrivate: !channel.isPrivate })}>{channel.isPrivate ? 'Private' : 'Visible'}</button>
                    <select disabled={slowModeBusy === channel.id} value={channel.minimumRole || 'MEMBER'} onChange={(event) => updateChannelAccess(channel, { minimumRole: event.target.value })} aria-label={`Minimum role for ${channel.name}`}>
                      <option value="MEMBER">Everyone</option><option value="MODERATOR">Moderators</option><option value="ADMIN">Admins</option><option value="OWNER">Owners</option>
                    </select>
                  </div>
                  {channel.isPrivate ? <div className="channel-access-members" aria-label={`Members with access to ${channel.name}`}>
                    {members.filter((member) => !['MODERATOR', 'ADMIN', 'OWNER'].includes(member.role)).map((member) => {
                      const granted = (channelPermissions[channel.id] || []).some((permission) => permission.userId === member.userId && permission.canView);
                      return <button className={granted ? 'active' : ''} type="button" key={member.userId} onClick={() => toggleChannelMemberAccess(channel, member)}>{granted ? '✓ ' : '+ '}{getDisplayName(member.user)}</button>;
                    })}
                  </div> : null}
                </React.Fragment>
              ))}
              <p className="muted">Private channels require an explicit member grant. Moderators and above retain emergency access.</p>
            </div> : null}
            <div className="community-control-section">
              <strong>Members and roles</strong>
              <div className="space-member-list">
                {members.slice(0, 12).map((member) => (
                  <div className="space-member-row" key={member.id}>
                    <UserAvatar user={member.user} className="space-member-avatar" />
                    <div><strong>{getDisplayName(member.user)}</strong><span>@{member.user?.username}</span></div>
                    {canAdminSpace && member.userId !== user?.id ? (
                      <select disabled={inviteBusy} value={member.role} onChange={(event) => updateMemberRole(member.userId, event.target.value)} aria-label={`Role for ${member.user?.username}`}>
                        <option value="MEMBER">Member</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Admin</option>{membershipRole === 'OWNER' ? <option value="OWNER">Owner</option> : null}
                      </select>
                    ) : <span className="space-member-role">{member.role.toLowerCase()}</span>}
                    {canAdminSpace && member.userId !== user?.id && member.role !== 'OWNER' ? <button className="icon-btn" type="button" aria-label={`Remove ${member.user?.username}`} onClick={() => removeMember(member.userId)}><AppIcon name="close" size={15} /></button> : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="community-control-section">
              <strong>Recent moderation</strong>
              {auditLog.length ? auditLog.slice(0, 6).map((entry) => (
                <div className="space-audit-row" key={entry.id}>
                  <AppIcon name="shield" size={15} />
                  <div><strong>{String(entry.action || '').replaceAll('_', ' ').toLowerCase()}</strong><span>{entry.actor ? getDisplayName(entry.actor) : 'System'} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}</span></div>
                </div>
              )) : <p className="muted">No moderation actions yet.</p>}
            </div>
          </section>

        ) : null}
      </div>

      {eventOpen && canModerateSpace ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEventOpen(false)}>
          <form className="modal-card event-modal" onSubmit={createEvent} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="workspace-eyebrow">Community event</span><h3>Create a moment</h3></div><button className="icon-btn" type="button" aria-label="Close" onClick={() => setEventOpen(false)}><AppIcon name="close" /></button></div>
            <label>Title<input required maxLength={120} value={eventDraft.title} onChange={(event) => setEventDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="Design review" /></label>
            <label>Starts<input required type="datetime-local" value={eventDraft.startsAt} onChange={(event) => setEventDraft((draft) => ({ ...draft, startsAt: event.target.value }))} /></label>
            <label>Location<input maxLength={160} value={eventDraft.location} onChange={(event) => setEventDraft((draft) => ({ ...draft, location: event.target.value }))} placeholder="Voice room or a link" /></label>
            <label>Description<textarea rows={4} value={eventDraft.description} onChange={(event) => setEventDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="What should people know?" /></label>
            <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ThreadPanel({ thread, loading, currentUserId, workspace, onClose, onReply, onPollVote }) {
  if (!thread && !loading) return null;
  return (
    <aside className="thread-panel" aria-label="Message thread">
      <header><div><span className="workspace-eyebrow">Thread</span><h3>{thread?.replies?.length || 0} replies</h3></div><button className="icon-btn" type="button" aria-label="Close thread" onClick={onClose}><AppIcon name="close" /></button></header>
      {loading ? <div className="thread-loading"><span /><span /><span /></div> : (
        <div className="thread-messages">
          {[thread.root, ...thread.replies].filter(Boolean).map((message, index) => (
            <div className={index === 0 ? 'thread-message root' : 'thread-message'} key={message.id}>
              <UserAvatar user={message.author} />
              <div><span><strong>{getDisplayName(message.author)}</strong><time>{formatRelativeDate(message.createdAt)}</time></span>{message.content ? <RichMessageText content={message.content} /> : null}{message.poll ? <PollCard poll={message.poll} currentUserId={currentUserId} onVote={onPollVote} /> : null}</div>
            </div>
          ))}
        </div>
      )}
      {thread?.root ? <button className="thread-reply-cta" type="button" onClick={() => onReply(thread.root)}>Reply in thread <AppIcon name="send" size={15} /></button> : null}
    </aside>
  );
}

function PollComposerModal({ open, workspace, channelId, conversationId, token, onCreated, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const message = await apiFetch('/polls', {
        method: 'POST',
        body: JSON.stringify({
          question,
          options: options.map((item) => item.trim()).filter(Boolean),
          allowsMultiple,
          anonymous,
          ...(workspace === 'dm' ? { conversationId: Number(conversationId) } : { channelId: Number(channelId) })
        })
      }, token);
      onCreated(message);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="modal-card poll-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><span className="workspace-eyebrow">Interactive message</span><h3>Create poll</h3></div><button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><AppIcon name="close" /></button></div>
        <label>Question<input required maxLength={240} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should we choose?" /></label>
        <div className="poll-draft-options">
          {options.map((option, index) => (
            <label key={index}>Option {index + 1}<span><input required={index < 2} maxLength={120} value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Choice ${index + 1}`} />{options.length > 2 ? <button className="icon-btn" type="button" aria-label="Remove option" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><AppIcon name="close" size={15} /></button> : null}</span></label>
          ))}
        </div>
        {options.length < 10 ? <button className="ghost-btn add-poll-option" type="button" onClick={() => setOptions((current) => [...current, ''])}><AppIcon name="plus" size={15} /> Add option</button> : null}
        <label className="setting-row"><span><strong>Multiple answers</strong><small>People can select more than one option</small></span><input type="checkbox" checked={allowsMultiple} onChange={(event) => setAllowsMultiple(event.target.checked)} /></label>
        <label className="setting-row"><span><strong>Anonymous poll</strong><small>Hide individual voter identities</small></span><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /></label>
        <button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish poll'}</button>
      </form>
    </div>
  );
}

function ScheduleMessageModal({ open, content, workspace, channelId, conversationId, token, silent, onScheduled, onClose }) {
  const initial = new Date(Date.now() + 60 * 60 * 1000);
  const [sendAt, setSendAt] = useState(initial.toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/scheduled-messages', {
        method: 'POST',
        body: JSON.stringify({
          content,
          sendAt: new Date(sendAt).toISOString(),
          silent,
          ...(workspace === 'dm' ? { conversationId: Number(conversationId) } : { channelId: Number(channelId) })
        })
      }, token);
      onScheduled();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="modal-card schedule-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><span className="workspace-eyebrow">Send later</span><h3>Schedule message</h3></div><button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><AppIcon name="close" /></button></div>
        <blockquote>{content}</blockquote>
        <label>Delivery time<input required type="datetime-local" min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} value={sendAt} onChange={(event) => setSendAt(event.target.value)} /></label>
        <p className="muted">{silent ? 'This will arrive silently, without a push alert.' : 'The message will be delivered even if this client is closed.'}</p>
        <button type="submit" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule'}</button>
      </form>
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
  const [silentMessage, setSilentMessage] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [scheduleComposerOpen, setScheduleComposerOpen] = useState(false);
  const [activeThread, setActiveThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [pendingAttachmentQueue, setPendingAttachmentQueue] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [dmSearch, setDmSearch] = useState('');
  const [mobileChatSearch, setMobileChatSearch] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState('all');
  const [chatPreferences, setChatPreferences] = useState(() => readStoredObject(KEYS.chatPreferences));
  const [chatDrafts, setChatDrafts] = useState(() => readStoredObject(KEYS.chatDrafts));
  const [chatInfoOpen, setChatInfoOpen] = useState(false);
  const [chatInfoTab, setChatInfoTab] = useState('media');
  const [messageOutbox, setMessageOutbox] = useState(() => {
    const value = readStoredObject(KEYS.outbox);
    return Array.isArray(value.items) ? value.items : [];
  });
  const [activeMobileFolderId, setActiveMobileFolderId] = useState('');
  const [customFolders, setCustomFolders] = useState(() => readCustomFolders(JSON.parse(localStorage.getItem('webcord_user') || 'null') || {}));
  const [customFoldersOwnerKey, setCustomFoldersOwnerKey] = useState(() => getFolderOwnerKey(user));
  const [newFolderName, setNewFolderName] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showComposerTools, setShowComposerTools] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [viewedProfile, setViewedProfile] = useState(null);
  const [viewedMedia, setViewedMedia] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [trackUploading, setTrackUploading] = useState(false);
  const [storyUploading, setStoryUploading] = useState(false);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [stories, setStories] = useState([]);
  const [activeStoryId, setActiveStoryId] = useState(null);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [storyDraft, setStoryDraft] = useState({
    caption: '',
    musicTitle: '',
    musicArtist: '',
    mediaFile: null,
    musicFile: null
  });
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [circleRecording, setCircleRecording] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState('idle');
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingPreviewStream, setRecordingPreviewStream] = useState(null);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [circleTorchEnabled, setCircleTorchEnabled] = useState(false);
  const [circleFacingMode, setCircleFacingMode] = useState('user');
  const [circleCameraSwitching, setCircleCameraSwitching] = useState(false);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Voice idle');
  const [voiceQuality, setVoiceQuality] = useState(DEFAULT_VOICE_QUALITY);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [inputVolume, setInputVolume] = useState(100);
  const [outputVolume, setOutputVolume] = useState(100);
  const [cameraTesting, setCameraTesting] = useState(false);
  const [cameraPreviewStream, setCameraPreviewStream] = useState(null);
  const [mediaDevices, setMediaDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  const [clientSettings, setClientSettings] = useState(() => readClientSettings());
  const [clientStateReady, setClientStateReady] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadAnchorId, setUnreadAnchorId] = useState(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchScope, setGlobalSearchScope] = useState('all');
  const [globalSearchResults, setGlobalSearchResults] = useState({ users: [], channels: [], conversations: [], channelMessages: [], directMessages: [] });
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [savedMessagesOpen, setSavedMessagesOpen] = useState(false);
  const [savedMessagesLoading, setSavedMessagesLoading] = useState(false);
  const [savedMessages, setSavedMessages] = useState([]);
  const [messageHistory, setMessageHistory] = useState(null);
  const [messageHistoryLoading, setMessageHistoryLoading] = useState(false);
  const [chatMedia, setChatMedia] = useState([]);
  const [chatMediaCursor, setChatMediaCursor] = useState(null);
  const [chatMediaLoading, setChatMediaLoading] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [forwardingMessages, setForwardingMessages] = useState([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [recordingCountdown, setRecordingCountdown] = useState(0);
  const [recordingUploadProgress, setRecordingUploadProgress] = useState(0);
  const [recordingTranscript, setRecordingTranscript] = useState('');
  const [participantVolumes, setParticipantVolumes] = useState({});
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [voiceIceServers, setVoiceIceServers] = useState(getIceServers());
  const [error, setError] = useState('');
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false);
  const [socketStatus, setSocketStatus] = useState(() => (navigator.onLine === false ? 'offline' : 'disconnected'));
  const [lastRealtimeSync, setLastRealtimeSync] = useState(null);
  const [composerPhase, setComposerPhase] = useState('idle');
  const [colorMode, setColorMode] = useState(() => {
    const stored = localStorage.getItem(KEYS.colorMode);
    return COLOR_MODES.includes(stored) ? stored : 'system';
  });
  const [systemColorMode, setSystemColorMode] = useState(() => (
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ));
  const [theme, setTheme] = useState(() => {
    try {
      return hydrateTheme(JSON.parse(localStorage.getItem(KEYS.theme) || 'null'));
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [profileDraft, setProfileDraft] = useState(() => createProfileDraft());
  const [isDesktopShell] = useState(() => IS_TAURI_CLIENT || /\b(Electron|WebCordTauri)\b/i.test(navigator.userAgent) || Boolean(window.webcordDesktop || window.webcordWindow || window.electronAPI));
  const [currentPath, setCurrentPath] = useState(() => normalizeAppPath());
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminStatus, setAdminStatus] = useState('idle');
  const [adminError, setAdminError] = useState('');
  const [adminRoleUpdating, setAdminRoleUpdating] = useState(null);
  const [adminModerationUpdating, setAdminModerationUpdating] = useState(null);
  const [adminDownloadUploading, setAdminDownloadUploading] = useState(null);

  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadAbortControllerRef = useRef(null);
  const composerInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const trackInputRef = useRef(null);
  const storyInputRef = useRef(null);
  const storyMusicInputRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const rawLocalStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const messageRecorderRef = useRef(null);
  const messageRecordingChunksRef = useRef([]);
  const messageRecordingStreamRef = useRef(null);
  const messageRecordingCircleSessionRef = useRef(null);
  const messageRecordingKindRef = useRef('');
  const messageRecordingCancelledRef = useRef(false);
  const messageRecordingTimerRef = useRef(null);
  const messageRecordingStopWatchdogRef = useRef(null);
  const messageRecordingFinalizedRef = useRef(false);
  const messageRecordingRequestIdRef = useRef(0);
  const remoteAudioRef = useRef({});
  const remoteStreamsRef = useRef({});
  const cameraPreviewStreamRef = useRef(null);
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
  const voiceQualityRef = useRef(DEFAULT_VOICE_QUALITY);
  const voiceStatsTimerRef = useRef(null);
  const lastVoiceStatsRef = useRef({ at: 0, bytesReceived: 0, bytesSent: 0 });
  const micMutedRef = useRef(false);
  const handRaisedRef = useRef(false);
  const appShellRef = useRef(null);
  const composerPhaseTimerRef = useRef(null);
  const messageSearchTimerRef = useRef(null);
  const globalSearchTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const recordingTranscriptRef = useRef('');
  const recordingRecoveryAttemptedRef = useRef(false);
  const clientStateHydratedRef = useRef(false);
  const clientStateSyncTimerRef = useRef(null);
  const chatPreferencesRef = useRef(chatPreferences);
  const browserDeepLinkHandledRef = useRef(false);
  const browserInviteHandledRef = useRef(false);
  const reportedClientErrorsRef = useRef(new Set());

  const isAdminRoute = ADMIN_PATHS.has(currentPath);
  const isAuthed = Boolean(token && user);
  useEffect(() => {
    if (!isAuthed) return undefined;
    const submit = (reason, context = {}) => {
      const errorObject = reason instanceof Error ? reason : new Error(String(reason || 'Unknown client error'));
      const key = `${errorObject.message}\n${String(errorObject.stack || '').split('\n')[1] || ''}`;
      if (reportedClientErrorsRef.current.has(key)) return;
      reportedClientErrorsRef.current.add(key);
      if (reportedClientErrorsRef.current.size > 50) {
        reportedClientErrorsRef.current.delete(reportedClientErrorsRef.current.values().next().value);
      }
      apiFetch('/client-errors', {
        method: 'POST',
        body: JSON.stringify({
          message: errorObject.message,
          stack: errorObject.stack,
          platform: IS_TAURI_CLIENT ? 'WINDOWS' : /Android/i.test(navigator.userAgent) ? 'ANDROID' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'IOS' : 'WEB',
          appVersion: APP_VERSION,
          context: { workspace: workspaceRef.current, online: navigator.onLine !== false, ...context }
        })
      }, token).catch(() => {});
    };
    const onError = (event) => submit(event.error || event.message, { source: 'window.error' });
    const onRejection = (event) => submit(event.reason, { source: 'unhandledrejection' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [isAuthed, token]);
  useEffect(() => {
    if (!isAuthed || isAdminRoute) return undefined;
    let active = true;
    const refreshActivityBadge = () => apiFetch('/activity?limit=1', {}, token)
      .then((payload) => { if (active) setActivityUnreadCount(payload.unreadCount || 0); })
      .catch(() => {});
    refreshActivityBadge();
    const timer = window.setInterval(refreshActivityBadge, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAuthed, isAdminRoute, token]);
  const textChannels = channels.filter((item) => item.type === 'TEXT');
  const voiceChannels = channels.filter((item) => item.type === 'VOICE');
  const activeTextChannel = textChannels.find((item) => String(item.id) === String(channelId));
  const activeVoiceChannel = voiceChannels.find((item) => String(item.id) === String(voiceChannelId));
  const activeConversation = social.conversations.find((item) => String(item.id) === String(dmConversationId));
  const activeChatScopeKey = workspace === 'dm' ? `dm:${dmConversationId}` : `channel:${channelId}`;
  const getChatPreference = (scopeKey) => chatPreferences[scopeKey] || {};
  const visibleMessages = messageSearchOpen && messageSearchQuery.trim()
    ? messageSearchResults
    : messages;
  const mediaViewerItems = (chatMedia.length > 0 ? chatMedia : messages)
    .filter((message) => /^(IMAGE|VIDEO|CIRCLE_VIDEO|AUDIO)$/i.test(message.attachmentType || ''));
  const selectedMobileFolder = customFolders.find((folder) => String(folder.id) === String(activeMobileFolderId)) || null;
  const selectedMobileChannelIds = new Set(selectedMobileFolder?.channelIds || []);
  const selectedMobileFriendIds = new Set(selectedMobileFolder?.friendIds || []);
  const hasMobileFolderFilter = Boolean(selectedMobileFolder);
  const mobileQuery = mobileChatSearch.trim().toLowerCase();
  const channelMatchesMobileFolder = (channel) => !hasMobileFolderFilter || selectedMobileChannelIds.has(String(channel.id));
  const friendMatchesMobileFolder = (friendUserId) => !hasMobileFolderFilter || selectedMobileFriendIds.has(String(friendUserId));
  const filteredTextChannels = textChannels.filter((channel) => channelMatchesMobileFolder(channel) && (!mobileQuery || String(channel.name || '').toLowerCase().includes(mobileQuery)));
  const filteredVoiceChannels = voiceChannels.filter((channel) => channelMatchesMobileFolder(channel) && (!mobileQuery || String(channel.name || '').toLowerCase().includes(mobileQuery)));
  const filteredFriends = social.friends.filter((friend) => {
    const userInfo = friend.user || {};
    if (!friendMatchesMobileFolder(userInfo.id)) return false;
    if (!mobileQuery || !isMobile) return true;
    return `${getDisplayName(userInfo)} ${getUsernameTag(userInfo)} ${userInfo.statusText || ''}`.toLowerCase().includes(mobileQuery);
  });
  const filteredConversations = social.conversations.filter((conversation) => {
    const query = (isMobile ? mobileChatSearch : dmSearch).trim().toLowerCase();
    if (!friendMatchesMobileFolder(conversation.user?.id)) return false;
    const archived = Boolean(getChatPreference(`dm:${conversation.id}`).archived);
    if (sidebarFilter === 'archived' ? !archived : archived) return false;
    if (!query) return true;
    return `${getConversationTitle(conversation)} ${getConversationSubtitle(conversation)} ${conversation.user?.username || ''} ${conversation.user?.statusText || ''} ${conversation.lastMessage?.content || ''} ${conversation.lastMessage?.attachmentName || ''}`.toLowerCase().includes(query);
  }).sort((left, right) => {
    const leftPinned = Number(Boolean(getChatPreference(`dm:${left.id}`).pinned));
    const rightPinned = Number(Boolean(getChatPreference(`dm:${right.id}`).pinned));
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    return new Date(right.lastMessage?.createdAt || 0) - new Date(left.lastMessage?.createdAt || 0);
  });
  const activeStory = stories.find((story) => String(story.id) === String(activeStoryId)) || null;
  const chatWallpaperStyle = clientSettings.chatWallpaper
    ? {
        '--chat-wallpaper': `url("${clientSettings.chatWallpaper}")`,
        '--chat-wallpaper-dim': Math.min(0.9, Math.max(0, Number(clientSettings.chatWallpaperDim ?? 42) / 100))
      }
    : undefined;
  const incomingRequests = social.requests.filter((item) => item.direction === 'INCOMING' && item.status === 'PENDING');
  const outgoingRequests = social.requests.filter((item) => item.direction === 'OUTGOING' && item.status === 'PENDING');
  const peerConfig = useMemo(
    () => ({
      iceServers: voiceIceServers,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }),
    [voiceIceServers]
  );

  useGSAP(() => {
    const root = appShellRef.current;
    if (!root || !isAuthed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const navigationItems = root.querySelectorAll('.channel-btn, .conversation-btn');
    if (navigationItems.length) {
      gsap.fromTo(navigationItems, { autoAlpha: 0, x: -9 }, {
        autoAlpha: 1,
        x: 0,
        duration: 0.3,
        ease: 'power3.out',
        stagger: 0.018,
        clearProps: 'transform,visibility,opacity'
      });
    }
  }, { scope: appShellRef, dependencies: [isAuthed, workspace], revertOnUpdate: true });

  useGSAP(() => {
    const root = appShellRef.current;
    if (!root || !isAuthed) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const profile = {
      telegram: { duration: 0.2, ease: 'power2.out', y: 5, scale: 0.998, stagger: 0.012 },
      material: { duration: 0.52, ease: 'back.out(1.16)', y: 12, scale: 0.988, stagger: 0.035 },
      liquid: { duration: 0.72, ease: 'expo.out', y: 9, scale: 0.994, stagger: 0.026 }
    }[theme.mode] || { duration: 0.3, ease: 'power3.out', y: 8, scale: 0.995, stagger: 0.02 };

    if (!reducedMotion) {
      const chromeItems = root.querySelectorAll('.chat-header, .message-form, .mobile-bottom-nav');
      if (chromeItems.length) {
        gsap.fromTo(
          chromeItems,
          { autoAlpha: 0.72, y: profile.y, scale: profile.scale },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: profile.duration,
            ease: profile.ease,
            stagger: profile.stagger,
            clearProps: 'transform,visibility,opacity'
          }
        );
      }
    }

    const ambient = root.querySelector('.theme-ambient');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!ambient || theme.mode !== 'liquid' || !finePointer || reducedMotion) return undefined;

    const moveX = gsap.quickTo(ambient, 'x', { duration: 1.1, ease: 'power3.out' });
    const moveY = gsap.quickTo(ambient, 'y', { duration: 1.1, ease: 'power3.out' });
    const onPointerMove = (event) => {
      const bounds = root.getBoundingClientRect();
      moveX(((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 64);
      moveY(((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 48);
    };
    root.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => root.removeEventListener('pointermove', onPointerMove);
  }, { scope: appShellRef, dependencies: [isAuthed, theme.id], revertOnUpdate: true });

  useEffect(() => {
    const syncPath = () => setCurrentPath(normalizeAppPath());
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  useEffect(() => {
    if (isAdminRoute) setMode('login');
  }, [isAdminRoute]);

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminOverview(null);
      setAdminStatus('idle');
      setAdminError('');
      return;
    }

    setMobileSidebarOpen(false);
    setMobileChatOpen(false);
    setShowSettingsModal(false);
    setViewedProfile(null);
    cleanupVoice();
    setVoiceJoined(false);
    socketRef.current?.disconnect();

    if (!isAuthed) {
      setAdminOverview(null);
      setAdminStatus('idle');
      setAdminError('');
      return;
    }

    loadAdminOverview();
  }, [isAdminRoute, isAuthed, token]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const sync = (event) => setSystemColorMode(event.matches ? 'dark' : 'light');
    sync(media);
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const resolvedColorMode = colorMode === 'system' ? systemColorMode : colorMode;
    const palette = resolvedColorMode === 'light' ? (LIGHT_PALETTES[theme.mode] || LIGHT_PALETTES.telegram) : theme;
    Object.entries({
      '--bg-color': palette.bg,
      '--panel-color': palette.panel,
      '--accent-color': palette.accent,
      '--text-color': palette.text
    }).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    document.documentElement.dataset.themeMode = theme.mode || 'solid';
    document.documentElement.dataset.iconFamily = theme.iconFamily || 'telegram';
    document.documentElement.dataset.motionProfile = theme.motion || 'quick';
    document.documentElement.dataset.density = theme.density || 'comfortable';
    document.documentElement.dataset.surface = theme.surface || 'flat';
    document.documentElement.dataset.colorScheme = resolvedColorMode;
    document.documentElement.style.colorScheme = resolvedColorMode;
    localStorage.setItem(KEYS.theme, JSON.stringify(theme));
    localStorage.setItem(KEYS.colorMode, colorMode);
  }, [theme, colorMode, systemColorMode]);

  useEffect(() => () => window.clearTimeout(composerPhaseTimerRef.current), []);

  useEffect(() => {
    localStorage.setItem(KEYS.settings, JSON.stringify(clientSettings));
    const bridge = getNativeBridge();
    bridge?.setAutoLaunch?.(Boolean(clientSettings.launchAtLogin)).catch?.(() => {});
    bridge?.setCloseToTray?.(Boolean(clientSettings.minimizeToTray)).catch?.(() => {});
  }, [clientSettings]);

  useEffect(() => {
    if (!isAuthed || !token || isAdminRoute) {
      clientStateHydratedRef.current = false;
      setClientStateReady(false);
      return;
    }
    let cancelled = false;
    apiFetch('/me/client-state', {}, token).then((payload) => {
      if (cancelled) return;
      const state = payload?.state || {};
      if (state.chatPreferences && typeof state.chatPreferences === 'object') setChatPreferences(state.chatPreferences);
      if (state.chatDrafts && typeof state.chatDrafts === 'object') setChatDrafts(state.chatDrafts);
      if (Array.isArray(state.customFolders)) setCustomFolders(state.customFolders);
      if (state.clientSettings && typeof state.clientSettings === 'object') {
        setClientSettings((current) => ({ ...current, ...state.clientSettings }));
      }
      if (state.theme && typeof state.theme === 'object') setTheme(hydrateTheme(state.theme));
      if (COLOR_MODES.includes(state.colorMode)) setColorMode(state.colorMode);
      clientStateHydratedRef.current = true;
      setClientStateReady(true);
    }).catch(() => {
      clientStateHydratedRef.current = true;
      setClientStateReady(true);
    });
    return () => { cancelled = true; };
  }, [isAuthed, isAdminRoute, token, user?.id]);

  useEffect(() => {
    if (!isAuthed || !token || !clientStateHydratedRef.current || !clientStateReady || isAdminRoute) return undefined;
    window.clearTimeout(clientStateSyncTimerRef.current);
    clientStateSyncTimerRef.current = window.setTimeout(() => {
      apiFetch('/me/client-state', {
        method: 'PUT',
        body: JSON.stringify({
          state: {
            chatPreferences,
            chatDrafts,
            customFolders,
            clientSettings,
            theme,
            colorMode
          }
        })
      }, token).catch(() => {});
    }, 900);
    return () => window.clearTimeout(clientStateSyncTimerRef.current);
  }, [isAuthed, isAdminRoute, token, clientStateReady, chatPreferences, chatDrafts, customFolders, clientSettings, theme, colorMode]);

  useEffect(() => {
    if (!showSettingsModal) return;
    refreshMediaDevices({ silent: true }).catch(() => {});
  }, [showSettingsModal]);

  useEffect(() => {
    cameraPreviewStreamRef.current = cameraPreviewStream;
    return undefined;
  }, [cameraPreviewStream]);

  useEffect(() => () => {
    cameraPreviewStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => {
    cleanupMessageRecording({ cancel: true });
  }, []);

  useEffect(() => {
    if (!circleRecording && !voiceRecording) return undefined;
    const cancelOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cleanupMessageRecording({ cancel: true });
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [circleRecording, voiceRecording]);

  useEffect(() => {
    if (recordingPhase !== 'requesting') return undefined;
    const timeout = window.setTimeout(() => {
      cleanupMessageRecording({ cancel: true });
      reportError(new Error('Camera or microphone did not respond in time'), 'Recording cancelled safely');
    }, 20000);
    return () => window.clearTimeout(timeout);
  }, [recordingPhase]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('webcord_user', JSON.stringify(user));
      setProfileDraft(createProfileDraft(user));
    }
  }, [user]);

  useEffect(() => {
    setCustomFoldersOwnerKey(getFolderOwnerKey(user));
    setCustomFolders(readCustomFolders(user));
    setActiveMobileFolderId('');
  }, [user?.id, user?.username]);

  useEffect(() => {
    if (!isAuthed || customFoldersOwnerKey !== getFolderOwnerKey(user)) return;
    writeCustomFolders(user, customFolders);
  }, [customFolders, customFoldersOwnerKey, isAuthed, user?.id, user?.username]);

  useEffect(() => {
    if (activeMobileFolderId && !customFolders.some((folder) => String(folder.id) === String(activeMobileFolderId))) {
      setActiveMobileFolderId('');
    }
  }, [activeMobileFolderId, customFolders]);

  useEffect(() => { voiceJoinedRef.current = voiceJoined; }, [voiceJoined]);
  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);
  useEffect(() => { handRaisedRef.current = handRaised; }, [handRaised]);
  useEffect(() => { guildIdRef.current = guild?.id || null; }, [guild?.id]);
  useEffect(() => { channelIdRef.current = channelId; }, [channelId]);
  useEffect(() => { dmConversationIdRef.current = dmConversationId; }, [dmConversationId]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);
  useEffect(() => { voiceChannelIdRef.current = voiceChannelId; }, [voiceChannelId]);
  useEffect(() => { volumeRef.current = participantVolumes; }, [participantVolumes]);
  useEffect(() => { remoteStreamsRef.current = remoteStreams; }, [remoteStreams]);
  useEffect(() => { voiceQualityRef.current = voiceQuality; }, [voiceQuality]);
  useEffect(() => { chatPreferencesRef.current = chatPreferences; }, [chatPreferences]);
  useEffect(() => {
    scopeRef.current = workspace === 'dm'
      ? { type: 'dm', id: String(dmConversationId || '') }
      : workspace === 'server'
        ? { type: 'channel', id: String(channelId || '') }
        : { type: 'none', id: '' };
  }, [workspace, channelId, dmConversationId]);
  useEffect(() => {
    shouldStickToBottomRef.current = true;
    setUnreadAnchorId(null);
    setShowScrollToLatest(false);
  }, [workspace, channelId, dmConversationId]);
  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      setShowScrollToLatest(false);
      setUnreadAnchorId(null);
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setShowEmojiPicker(false);
        setShowComposerTools(false);
        setGlobalSearchOpen(false);
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
      if (!isAdminRoute) {
        socketRef.current?.connect();
        refreshCurrentMessages({ silent: true }).catch(() => {});
        refreshSocialData().catch(() => {});
      }
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
  }, [isAuthed, isAdminRoute, token, workspace, channelId, dmConversationId]);

  useEffect(() => {
    const bridge = getNativeBridge();
    if (typeof bridge?.onDeepLink !== 'function') return undefined;
    return bridge.onDeepLink((url) => {
      try {
        const parsed = new URL(url);
        const dmId = parsed.hostname === 'dm' ? parsed.pathname.replace('/', '') : '';
        const channel = parsed.hostname === 'channel' ? parsed.pathname.replace('/', '') : '';
        if (dmId) {
          setWorkspace('dm');
          setDmConversationId(String(dmId));
          setMobileChatOpen(true);
        }
        if (channel) {
          setWorkspace('server');
          setChannelId(String(channel));
          setMobileChatOpen(true);
        }
      } catch {
        pushToast('Could not open WebCord link', 'error');
      }
    });
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const bridge = getNativeBridge();
    if (typeof bridge?.setBadge === 'function') bridge.setBadge(unreadCount).catch?.(() => {});
  }, [unreadCount]);

  useEffect(() => {
    if (workspace === 'dm') setUnreadCount(0);
  }, [workspace, dmConversationId]);

  useEffect(() => {
    if (!isAuthed || isAdminRoute) {
      setGuild(null);
      setChannels([]);
      setSocial(EMPTY_SOCIAL);
      setMessages([]);
      setStories([]);
      setActiveStoryId(null);
      setSocketStatus(networkOnline ? 'disconnected' : 'offline');
      return;
    }
    bootstrapApp().catch((err) => setError(err.message));
  }, [isAuthed, isAdminRoute, networkOnline]);

  useEffect(() => {
    if (!isAuthed || !token || recordingRecoveryAttemptedRef.current) return;
    recordingRecoveryAttemptedRef.current = true;
    readRecordingDraft().then((draft) => {
      if (!draft?.blob || Date.now() - Number(draft.createdAt || 0) > 24 * 60 * 60 * 1000) {
        if (draft) clearRecordingDraft().catch(() => {});
        return;
      }
      pushToast('Recovering an unfinished recording');
      uploadRecordedAttachment(draft.blob, draft.kind, draft.transcript, { preserveDraft: true });
    }).catch(() => {});
  }, [isAuthed, token]);

  useEffect(() => {
    if (!isAuthed || isAdminRoute) return;
    if (!getCurrentMessagePath()) {
      setMessages([]);
      return;
    }
    const scopeKey = workspace === 'dm' ? getScopeKey('dm', dmConversationId) : getScopeKey('channel', channelId);
    const cachedMessages = readMessageCache()[scopeKey];
    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
      setMessages(sortMessages(cachedMessages));
    }
    refreshCurrentMessages().catch((err) => setError(err.message));
  }, [isAuthed, isAdminRoute, workspace, channelId, dmConversationId, token]);

  useEffect(() => {
    setMessageSearchOpen(false);
    setMessageSearchQuery('');
    setMessageSearchResults([]);
    setPinnedPanelOpen(false);
    setPinnedMessages([]);
    setSelectedMessageIds([]);
    setForwardingMessages([]);
    setChatInfoOpen(false);
  }, [workspace, channelId, dmConversationId]);

  useEffect(() => {
    localStorage.setItem(KEYS.chatPreferences, JSON.stringify(chatPreferences));
  }, [chatPreferences]);

  useEffect(() => {
    localStorage.setItem(KEYS.chatDrafts, JSON.stringify(chatDrafts));
  }, [chatDrafts]);

  useEffect(() => {
    localStorage.setItem(KEYS.outbox, JSON.stringify({ items: messageOutbox }));
  }, [messageOutbox]);

  useEffect(() => {
    if (!networkOnline || !token || messageOutbox.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const queued of messageOutbox) {
        if (cancelled) break;
        try {
          const created = queued.workspace === 'dm'
            ? await apiFetch(`/dms/${queued.scopeId}/messages`, { method: 'POST', body: JSON.stringify(queued.body) }, token)
            : await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ ...queued.body, channelId: Number(queued.scopeId) }) }, token);
          setMessages((current) => mergeMessage(current.filter((message) => String(message.id) !== String(queued.clientId)), created));
          setMessageOutbox((current) => current.filter((item) => item.clientId !== queued.clientId));
        } catch {
          break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [networkOnline, token, messageOutbox.length]);

  useEffect(() => {
    if (editingMessage) return;
    setNewMessage(chatDrafts[activeChatScopeKey] || '');
  }, [activeChatScopeKey]);

  useEffect(() => {
    if (!activeChatScopeKey || editingMessage) return;
    const draft = newMessage.trim() ? newMessage : '';
    setChatDrafts((current) => {
      if ((current[activeChatScopeKey] || '') === draft) return current;
      const next = { ...current };
      if (draft) next[activeChatScopeKey] = draft;
      else delete next[activeChatScopeKey];
      return next;
    });
  }, [newMessage, activeChatScopeKey, editingMessage]);

  useEffect(() => {
    window.clearTimeout(messageSearchTimerRef.current);
    if (!messageSearchOpen || !messageSearchQuery.trim()) {
      setMessageSearchResults([]);
      return undefined;
    }
    messageSearchTimerRef.current = window.setTimeout(() => {
      searchCurrentMessages(messageSearchQuery);
    }, 260);
    return () => window.clearTimeout(messageSearchTimerRef.current);
  }, [messageSearchOpen, messageSearchQuery, workspace, channelId, dmConversationId]);

  useEffect(() => {
    window.clearTimeout(globalSearchTimerRef.current);
    const query = globalSearchQuery.trim();
    if (!globalSearchOpen || query.length < 2 || !token) {
      setGlobalSearchResults({ users: [], channels: [], conversations: [], channelMessages: [], directMessages: [] });
      setGlobalSearchLoading(false);
      return undefined;
    }
    setGlobalSearchLoading(true);
    globalSearchTimerRef.current = window.setTimeout(() => {
      apiFetch(`/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(globalSearchScope)}`, {}, token)
        .then(setGlobalSearchResults)
        .catch((err) => reportError(err, 'Could not search WebCord'))
        .finally(() => setGlobalSearchLoading(false));
    }, 260);
    return () => window.clearTimeout(globalSearchTimerRef.current);
  }, [globalSearchOpen, globalSearchQuery, globalSearchScope, token]);

  useEffect(() => {
    if (pinnedPanelOpen) refreshPinnedMessages();
  }, [pinnedPanelOpen, workspace, channelId, dmConversationId]);

  useEffect(() => {
    setChatMedia([]);
    setChatMediaCursor(null);
    if (chatInfoOpen && (workspace === 'server' || workspace === 'dm')) {
      loadChatMedia({ reset: true });
    }
  }, [chatInfoOpen, workspace, channelId, dmConversationId]);

  useEffect(() => {
    if (!isAuthed || isAdminRoute) return undefined;
    const timeout = window.setTimeout(() => refreshSavedMessages(), 400);
    return () => window.clearTimeout(timeout);
  }, [isAuthed, isAdminRoute, workspace, channelId, dmConversationId]);

  useEffect(() => {
    if (!isAuthed || !clientStateReady || IS_NATIVE_CLIENT) return undefined;
    const timeout = window.setTimeout(() => {
      syncWebPushSubscription(token, clientSettings, clientSettings.notificationsEnabled).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [
    isAuthed,
    clientStateReady,
    token,
    clientSettings.notificationsEnabled,
    clientSettings.notificationMode,
    clientSettings.quietHoursEnabled,
    clientSettings.quietHoursStart,
    clientSettings.quietHoursEnd
  ]);

  useEffect(() => {
    if (!isAuthed || browserInviteHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (!inviteCode) return;
    browserInviteHandledRef.current = true;
    apiFetch(`/invites/${encodeURIComponent(inviteCode)}/accept`, { method: 'POST' }, token)
      .then(() => {
        setWorkspace('spaces');
        setMobileChatOpen(true);
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch((inviteError) => {
        setError(inviteError?.message || 'Could not join this community.');
      });
  }, [isAuthed, token]);

  useEffect(() => {
    if (!isAuthed || browserDeepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const targetWorkspace = params.get('workspace');
    const targetMessage = params.get('message');
    const targetConversation = params.get('conversation');
    const targetChannel = params.get('channel');
    if (!targetMessage || (targetWorkspace !== 'dm' && targetWorkspace !== 'server')) return;
    browserDeepLinkHandledRef.current = true;
    const open = async () => {
      try {
        if (targetWorkspace === 'dm' && targetConversation) {
          const payload = await apiFetch(`/dms/${targetConversation}/messages/${targetMessage}/context`, {}, token);
          setWorkspace('dm');
          setDmConversationId(String(targetConversation));
          setMessages(sortMessages(payload.messages || []));
        } else if (targetWorkspace === 'server' && targetChannel) {
          const payload = await apiFetch(`/messages/${targetChannel}/context/${targetMessage}`, {}, token);
          setWorkspace('server');
          setChannelId(String(targetChannel));
          setMessages(sortMessages(payload.messages || []));
        }
        setMobileChatOpen(true);
        setHighlightedMessageId(String(targetMessage));
        window.setTimeout(() => document.querySelector(`[data-message-id="${targetMessage}"]`)?.scrollIntoView({ block: 'center' }), 120);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        reportError(err, 'Could not open notification target');
      }
    };
    open();
  }, [isAuthed, token]);

  useEffect(() => {
    if (!isAuthed || isAdminRoute) return undefined;

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
        const resumeChannelId = voiceChannelIdRef.current;
        cleanupVoice({ emitLeave: false });
        setVoiceStatus('Restoring voice session…');
        window.setTimeout(() => {
          handleJoinVoice(resumeChannelId)
            .then(() => pushToast('Voice session restored', 'success'))
            .catch(() => setVoiceStatus('Could not restore voice automatically'));
        }, 240);
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
        if (!shouldStickToBottomRef.current && String(message.author?.id) !== String(user?.id)) {
          setUnreadAnchorId((current) => current || message.id);
          setShowScrollToLatest(true);
        }
        setMessages((prev) => mergeMessage(prev, message));
        if (String(message.author?.id) !== String(user?.id)) {
          showClientNotification(
            getDisplayName(message.author),
            message.content || message.attachmentName || 'New message',
            {
              mention: Boolean(user?.username && String(message.content || '').toLowerCase().includes(`@${user.username.toLowerCase()}`)),
              muted: Boolean(chatPreferencesRef.current[`channel:${message.channelId}`]?.muted)
            }
          );
        }
      }
    });
    socket.on('message:updated', (message) => {
      const scope = scopeRef.current;
      if (scope.type === 'channel' && String(message.channelId) === scope.id) {
        if (message.deletedAt) {
          setReplyTarget((current) => String(current?.id) === String(message.id) ? null : current);
          setEditingMessage((current) => String(current?.id) === String(message.id) ? null : current);
        }
        setMessages((prev) => replaceMessage(prev, message));
      }
    });
    socket.on('message:reaction', (payload) => {
      const scope = scopeRef.current;
      if (scope.type === 'channel' && String(payload?.channelId) === scope.id) {
        setMessages((prev) => prev.map((message) => (
          String(message.id) === String(payload.messageId)
            ? { ...message, reactions: payload.reactions || [] }
            : message
        )));
      }
    });
    socket.on('direct-message:new', (message) => {
      const scope = scopeRef.current;
      if (scope.type === 'dm' && String(message.conversationId) === scope.id) {
        if (!shouldStickToBottomRef.current && String(message.author?.id) !== String(user?.id)) {
          setUnreadAnchorId((current) => current || message.id);
          setShowScrollToLatest(true);
        }
        setMessages((prev) => mergeMessage(prev, message));
        if (String(message.author?.id) !== String(user?.id)) {
          if (document.hidden || workspaceRef.current !== 'dm') setUnreadCount((count) => count + 1);
          showClientNotification(
            getDisplayName(message.author),
            message.content || message.attachmentName || 'New direct message',
            {
              direct: true,
              muted: Boolean(chatPreferencesRef.current[`dm:${message.conversationId}`]?.muted)
            }
          );
        }
      }
    });
    socket.on('direct-message:updated', (message) => {
      const scope = scopeRef.current;
      if (scope.type === 'dm' && String(message.conversationId) === scope.id) {
        if (message.deletedAt) {
          setReplyTarget((current) => String(current?.id) === String(message.id) ? null : current);
          setEditingMessage((current) => String(current?.id) === String(message.id) ? null : current);
        }
        setMessages((prev) => replaceMessage(prev, message));
      }
    });
    socket.on('direct-message:reaction', (payload) => {
      const scope = scopeRef.current;
      if (scope.type === 'dm' && String(payload?.conversationId) === scope.id) {
        setMessages((prev) => prev.map((message) => (
          String(message.id) === String(payload.messageId)
            ? { ...message, reactions: payload.reactions || [] }
            : message
        )));
      }
    });
    socket.on('poll:updated', (payload) => {
      setMessages((prev) => prev.map((message) => (
        String(message.id) === String(payload?.messageId)
          ? { ...message, poll: payload.poll }
          : message
      )));
      setActiveThread((current) => current ? {
        ...current,
        root: String(current.root?.id) === String(payload?.messageId) ? { ...current.root, poll: payload.poll } : current.root,
        replies: current.replies.map((message) => String(message.id) === String(payload?.messageId) ? { ...message, poll: payload.poll } : message)
      } : current);
    });
    socket.on('activity:new', () => setActivityUnreadCount((count) => count + 1));
    socket.on('channel-created', (channel) => {
      setChannels((prev) =>
        prev.some((item) => item.id === channel.id)
          ? prev
          : [...prev, channel].sort((a, b) => (a.type !== b.type ? a.type.localeCompare(b.type) : a.id - b.id))
      );
    });
    socket.on('social:refresh', () => refreshSocialData().catch((err) => setError(err.message)));
    socket.on('stories:refresh', () => refreshStories({ silent: true }).catch((err) => setError(err.message)));
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
      if (voiceJoinedRef.current) {
        emitVoiceState({
          muted: micMutedRef.current,
          handRaised: handRaisedRef.current
        });
      }
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
    socket.on('voice-state', (participant) => {
      if (!participant?.socketId) return;
      setVoiceParticipants((prev) => ({ ...prev, [participant.socketId]: participant }));
    });

    return () => {
      setSocketStatus('disconnected');
      socket.disconnect();
      socketRef.current = null;
      cleanupVoice({ emitLeave: false });
    };
  }, [isAuthed, isAdminRoute, token, peerConfig, networkOnline]);

  useEffect(() => {
    if (!isAuthed || isAdminRoute) return undefined;

    const interval = window.setInterval(() => {
      refreshSocialData().catch(() => {});
      refreshStories({ silent: true }).catch(() => {});

      refreshCurrentMessages({ silent: true }).catch(() => {});
    }, MESSAGE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isAuthed, isAdminRoute, workspace, dmConversationId, channelId, token]);

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

  function pushToast(message, tone = 'info') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4200);
  }

  function announceComposerPhase(phase) {
    window.clearTimeout(composerPhaseTimerRef.current);
    setComposerPhase(phase);
    if (phase === 'sent' || phase === 'saved' || phase === 'error') {
      composerPhaseTimerRef.current = window.setTimeout(() => setComposerPhase('idle'), 1800);
    }
  }

  function reportError(err, fallback = 'Something went wrong') {
    const message = err?.message || fallback;
    setError(message);
    pushToast(message, 'error');
  }

  function updateCustomFolder(folderId, updater) {
    setCustomFolders((prev) => prev.map((folder) => (String(folder.id) === String(folderId) ? normalizeCustomFolder(updater(folder)) : folder)));
  }

  function handleCreateFolder(event) {
    event.preventDefault();
    const folderName = newFolderName.trim();
    if (!folderName) return;
    if (customFolders.some((folder) => folder.name.toLowerCase() === folderName.toLowerCase())) {
      pushToast('Folder with this name already exists', 'error');
      return;
    }
    const folder = createCustomFolder(folderName);
    setCustomFolders((prev) => [...prev, folder]);
    setActiveMobileFolderId(folder.id);
    setNewFolderName('');
    pushToast('Folder created', 'success');
  }

  function renameCustomFolder(folderId, name) {
    updateCustomFolder(folderId, (folder) => ({ ...folder, name: name.slice(0, 32) }));
  }

  function deleteCustomFolder(folderId) {
    setCustomFolders((prev) => prev.filter((folder) => String(folder.id) !== String(folderId)));
    if (String(activeMobileFolderId) === String(folderId)) setActiveMobileFolderId('');
    pushToast('Folder deleted');
  }

  function toggleFolderItem(folderId, key, value) {
    if (!value) return;
    updateCustomFolder(folderId, (folder) => {
      const current = uniqueStringList(folder[key]);
      const stringValue = String(value);
      const next = current.includes(stringValue) ? current.filter((item) => item !== stringValue) : [...current, stringValue];
      return { ...folder, [key]: next };
    });
  }

  function toggleFolderChannel(folderId, channelIdValue) {
    toggleFolderItem(folderId, 'channelIds', channelIdValue);
  }

  function toggleFolderFriend(folderId, friendIdValue) {
    toggleFolderItem(folderId, 'friendIds', friendIdValue);
  }

  function navigateTo(path) {
    const nextPath = normalizeAppPath(path);
    if (normalizeAppPath() !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentPath(nextPath);
  }

  async function loadAdminOverview() {
    setAdminStatus('checking');
    setAdminError('');
    try {
      const overview = await apiFetch('/admin/overview', {}, token);
      const clientErrors = await apiFetch('/admin/client-errors', {}, token).catch(() => ({ reports: [] }));
      setAdminOverview({ ...overview, clientErrors: clientErrors.reports || [] });
      setAdminStatus('allowed');
      if (overview.admin) setUser(overview.admin);
    } catch (err) {
      setAdminOverview(null);
      setAdminError(err.message);
      if (err.status === 401) {
        handleLogout();
        setAdminStatus('idle');
        return;
      }
      setAdminStatus(err.status === 403 ? 'denied' : 'error');
    }
  }

  async function uploadAdminDownload(platform, file) {
    if (!file) {
      pushToast('Choose a client file first', 'error');
      return false;
    }

    setAdminDownloadUploading(platform);
    setAdminError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const payload = await apiFetch(
        `/admin/downloads/${platform}`,
        {
          method: 'PUT',
          body: formData
        },
        token
      );
      setAdminOverview((prev) => (prev ? { ...prev, downloads: payload?.downloads || prev.downloads } : prev));
      pushToast(`${payload?.download?.label || 'Client'} download updated`, 'success');
      return true;
    } catch (err) {
      setAdminError(err.message);
      pushToast(err.message, 'error');
      return false;
    } finally {
      setAdminDownloadUploading(null);
    }
  }

  async function deleteAdminDownload(platform) {
    setAdminDownloadUploading(platform);
    setAdminError('');
    try {
      const payload = await apiFetch(
        `/admin/downloads/${platform}`,
        { method: 'DELETE' },
        token
      );
      setAdminOverview((prev) => (prev ? { ...prev, downloads: payload?.downloads || prev.downloads } : prev));
      pushToast(`${payload?.download?.label || 'Client'} download removed`, 'success');
    } catch (err) {
      setAdminError(err.message);
      pushToast(err.message, 'error');
    } finally {
      setAdminDownloadUploading(null);
    }
  }

  async function changeAdminUserRole(userId, role) {
    setAdminRoleUpdating(userId);
    setAdminError('');
    try {
      const payload = await apiFetch(
        `/admin/users/${userId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role })
        },
        token
      );
      const updatedUser = payload?.user;
      setAdminOverview((prev) => {
        if (!prev || !updatedUser) return prev;
        const updateList = (list = []) => list.map((item) => (String(item.id) === String(updatedUser.id) ? updatedUser : item));
        const roleUsers = updateList(prev.roleUsers || []).filter((item) => ['ADMIN', 'OWNER'].includes(normalizeUserRole(item.role)));
        if (['ADMIN', 'OWNER'].includes(normalizeUserRole(updatedUser.role)) && !roleUsers.some((item) => String(item.id) === String(updatedUser.id))) {
          roleUsers.push(updatedUser);
        }
        return {
          ...prev,
          admin: String(prev.admin?.id) === String(updatedUser.id) ? updatedUser : prev.admin,
          recentUsers: updateList(prev.recentUsers || []),
          manageableUsers: updateList(prev.manageableUsers || []),
          roleUsers
        };
      });
      if (String(user?.id) === String(updatedUser?.id)) {
        setUser(updatedUser);
        localStorage.setItem('webcord_user', JSON.stringify(updatedUser));
      }
      pushToast(`@${updatedUser?.username || 'user'} role updated`, 'success');
    } catch (err) {
      setAdminError(err.message);
      pushToast(err.message, 'error');
    } finally {
      setAdminRoleUpdating(null);
    }
  }

  async function applyAdminModeration(userId, action, durationMinutes, reason = '') {
    setAdminModerationUpdating(`${userId}:${action}`);
    setAdminError('');
    try {
      const payload = await apiFetch(
        `/admin/users/${userId}/moderation`,
        {
          method: 'POST',
          body: JSON.stringify({ action, durationMinutes, reason })
        },
        token
      );
      const updatedUser = payload?.user;
      setAdminOverview((prev) => {
        if (!prev || !updatedUser) return prev;
        const updateList = (list = []) => list.map((item) => (String(item.id) === String(updatedUser.id) ? updatedUser : item));
        return {
          ...prev,
          recentUsers: updateList(prev.recentUsers || []),
          manageableUsers: updateList(prev.manageableUsers || [])
        };
      });
      pushToast(`@${updatedUser?.username || 'user'} ${action.toLowerCase()} applied`, 'success');
      await loadAdminOverview();
    } catch (err) {
      setAdminError(err.message);
      pushToast(err.message, 'error');
    } finally {
      setAdminModerationUpdating(null);
    }
  }

  async function updateAdminReport(reportId, status) {
    setAdminModerationUpdating(`report:${reportId}`);
    setAdminError('');
    try {
      await apiFetch(
        `/admin/moderation/reports/${reportId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status })
        },
        token
      );
      pushToast(`Report ${status.toLowerCase()}`, 'success');
      await loadAdminOverview();
    } catch (err) {
      setAdminError(err.message);
      pushToast(err.message, 'error');
    } finally {
      setAdminModerationUpdating(null);
    }
  }

  async function refreshMediaDevices({ silent = false } = {}) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMediaDevices({
        audioinput: devices.filter((device) => device.kind === 'audioinput'),
        videoinput: devices.filter((device) => device.kind === 'videoinput'),
        audiooutput: devices.filter((device) => device.kind === 'audiooutput')
      });
      if (!silent && devices.length === 0) {
        pushToast('No media devices were reported by the browser', 'error');
      }
    } catch (err) {
      if (!silent) reportError(err, 'Could not refresh devices');
    }
  }

  async function requestMediaDeviceAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Media devices are not supported in this browser');
      return;
    }

    let stream = null;
    try {
      setError('');
      stream = await requestMediaDeviceProbe({
        micDeviceId: clientSettings.micDeviceId,
        cameraDeviceId: clientSettings.cameraDeviceId
      });
      pushToast('Device access granted');
    } catch (err) {
      reportError(new Error(getMediaErrorMessage(err, 'Could not access media devices')));
    } finally {
      stream?.getTracks?.().forEach((track) => track.stop());
      await refreshMediaDevices({ silent: true });
    }
  }

  function updateClientSetting(key, value) {
    setClientSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateParticipantVolume(socketId, value) {
    const nextVolume = Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
    setParticipantVolumes((prev) => ({ ...prev, [socketId]: nextVolume }));
    const node = remoteAudioRef.current[socketId];
    if (node) {
      node.volume = Math.min(1, (nextVolume / 100) * (outputVolume / 100));
    }
  }

  async function toggleNotifications() {
    const nextEnabled = !clientSettings.notificationsEnabled;
    if (nextEnabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
    if (!IS_NATIVE_CLIENT) {
      const result = await syncWebPushSubscription(token, clientSettings, nextEnabled).catch(() => ({ enabled: false, reason: 'failed' }));
      if (nextEnabled && result.reason === 'server-disabled') {
        pushToast('Foreground notifications enabled; background push is not configured on the server', 'error');
      } else if (nextEnabled && result.reason === 'permission') {
        pushToast('Notification permission was not granted', 'error');
        return;
      }
    }
    updateClientSetting('notificationsEnabled', nextEnabled);
    pushToast(nextEnabled ? 'Notifications enabled' : 'Notifications disabled');
  }

  async function resolveAdminClientError(reportId) {
    setAdminModerationUpdating(`client-error:${reportId}`);
    try {
      await apiFetch(`/admin/client-errors/${reportId}`, { method: 'PATCH' }, token);
      setAdminOverview((prev) => prev ? { ...prev, clientErrors: (prev.clientErrors || []).filter((item) => item.id !== reportId) } : prev);
      pushToast('Client error resolved', 'success');
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminModerationUpdating(null);
    }
  }

  async function stopCameraPreview() {
    const stream = cameraPreviewStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    cameraPreviewStreamRef.current = null;
    setCameraPreviewStream(null);
  }

  async function toggleCameraPreview() {
    if (cameraPreviewStreamRef.current) {
      await stopCameraPreview();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      reportError(new Error('Camera is not supported in this browser'));
      return;
    }

    try {
      const stream = await requestCameraStream(clientSettings.cameraDeviceId);
      cameraPreviewStreamRef.current = stream;
      setCameraPreviewStream(stream);
      await refreshMediaDevices();
    } catch (err) {
      reportError(new Error(getMediaErrorMessage(err, 'Could not access the camera')));
    }
  }

  function handleMessagesScroll() {
    const node = messagesRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    shouldStickToBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom);
    if (nearBottom) setUnreadAnchorId(null);
  }

  function scrollToLatestMessages() {
    shouldStickToBottomRef.current = true;
    setShowScrollToLatest(false);
    setUnreadAnchorId(null);
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
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

  async function searchCurrentMessages(query) {
    const path = getCurrentMessagePath();
    const value = query.trim();
    if (!path || !value) {
      setMessageSearchResults([]);
      return;
    }
    setMessageSearchLoading(true);
    try {
      const separator = path.includes('?') ? '&' : '?';
      const results = await apiFetch(`${path}${separator}search=${encodeURIComponent(value)}&limit=100`, {}, token);
      setMessageSearchResults(sortMessages(results));
    } catch (err) {
      reportError(err, 'Could not search messages');
    } finally {
      setMessageSearchLoading(false);
    }
  }

  async function openGlobalSearchResult(result) {
    if (result.type === 'user') {
      setViewedProfile(result.profile);
      setGlobalSearchOpen(false);
      return;
    }
    if (result.type === 'channel') {
      setWorkspace('server');
      setChannelId(String(result.channel.id));
      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      setMobileChatOpen(true);
      return;
    }
    if (result.type === 'conversation') {
      setWorkspace('dm');
      setDmConversationId(String(result.conversation.id));
      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      setMobileChatOpen(true);
      return;
    }
    const message = result.message;
    try {
      if (result.type === 'direct-message') {
        const conversationId = message.conversationId;
        const payload = await apiFetch(`/dms/${conversationId}/messages/${message.id}/context`, {}, token);
        setWorkspace('dm');
        setDmConversationId(String(conversationId));
        setMessages(sortMessages(payload.messages || []));
      } else {
        const targetChannelId = message.channel?.id || message.channelId;
        const payload = await apiFetch(`/messages/${targetChannelId}/context/${message.id}`, {}, token);
        setWorkspace('server');
        setChannelId(String(targetChannelId));
        setMessages(sortMessages(payload.messages || []));
      }
      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      setMobileChatOpen(true);
      setHighlightedMessageId(String(message.id));
      window.setTimeout(() => {
        document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 80);
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1800);
    } catch (err) {
      reportError(err, 'Could not open search result');
    }
  }

  async function refreshPinnedMessages() {
    const path = getCurrentMessagePath();
    if (!path) return;
    try {
      const separator = path.includes('?') ? '&' : '?';
      const results = await apiFetch(`${path}${separator}pinned=true&limit=100`, {}, token);
      setPinnedMessages(sortMessages(results));
    } catch (err) {
      reportError(err, 'Could not load pinned messages');
    }
  }

  async function refreshSavedMessages({ open = false } = {}) {
    if (!token) return;
    if (open) setSavedMessagesOpen(true);
    setSavedMessagesLoading(true);
    try {
      const payload = await apiFetch('/me/bookmarks', {}, token);
      const bookmarks = payload?.bookmarks || [];
      setSavedMessages(bookmarks);
      const activeSavedIds = new Set(bookmarks
        .filter((bookmark) => bookmark.type === (workspace === 'dm' ? 'direct-message' : 'channel'))
        .map((bookmark) => String(bookmark.message?.id)));
      setMessages((current) => current.map((message) => ({
        ...message,
        bookmarked: activeSavedIds.has(String(message.id))
      })));
    } catch (err) {
      reportError(err, 'Could not load saved messages');
    } finally {
      setSavedMessagesLoading(false);
    }
  }

  async function toggleMessageBookmark(message) {
    const path = workspace === 'dm'
      ? `/dms/${dmConversationId}/messages/${message.id}/bookmark`
      : `/messages/${message.id}/bookmark`;
    try {
      const payload = await apiFetch(path, { method: 'PUT' }, token);
      const update = (current) => current.map((entry) => (
        String(entry.id) === String(message.id)
          ? { ...entry, bookmarked: Boolean(payload.bookmarked) }
          : entry
      ));
      setMessages(update);
      setMessageSearchResults(update);
      await refreshSavedMessages();
      pushToast(payload.bookmarked ? 'Message saved' : 'Removed from Saved');
    } catch (err) {
      reportError(err, 'Could not update saved message');
    }
  }

  async function openSavedMessage(bookmark) {
    setSavedMessagesOpen(false);
    await openGlobalSearchResult({
      type: bookmark.type === 'direct-message' ? 'direct-message' : 'channel-message',
      message: bookmark.message
    });
  }

  async function openMessageHistory(message) {
    setMessageHistoryLoading(true);
    setMessageHistory({ message, history: [] });
    try {
      const path = workspace === 'dm'
        ? `/dms/${dmConversationId}/messages/${message.id}/history`
        : `/messages/${message.id}/history`;
      setMessageHistory(await apiFetch(path, {}, token));
    } catch (err) {
      setMessageHistory(null);
      reportError(err, 'Could not load edit history');
    } finally {
      setMessageHistoryLoading(false);
    }
  }

  async function loadChatMedia({ reset = false } = {}) {
    if (chatMediaLoading) return;
    const scope = workspace === 'dm'
      ? `conversationId=${encodeURIComponent(dmConversationId)}`
      : `channelId=${encodeURIComponent(channelId)}`;
    if ((workspace === 'dm' && !dmConversationId) || (workspace === 'server' && !channelId)) return;
    setChatMediaLoading(true);
    try {
      const cursor = reset ? '' : chatMediaCursor;
      const payload = await apiFetch(`/media?${scope}&types=IMAGE,VIDEO,CIRCLE_VIDEO&limit=48${cursor ? `&cursor=${cursor}` : ''}`, {}, token);
      setChatMedia((current) => reset
        ? payload.items || []
        : [...current, ...(payload.items || []).filter((item) => !current.some((entry) => String(entry.id) === String(item.id)))]);
      setChatMediaCursor(payload.nextCursor || null);
    } catch (err) {
      reportError(err, 'Could not load shared media');
    } finally {
      setChatMediaLoading(false);
    }
  }

  async function scrollToMessage(target) {
    if (!target?.id) return;
    let node = document.querySelector(`[data-message-id="${target.id}"]`);
    if (!node) {
      try {
        const path = workspace === 'dm'
          ? `/dms/${dmConversationId}/messages/${target.id}/context`
          : `/messages/${channelId}/context/${target.id}`;
        const payload = await apiFetch(path, {}, token);
        setMessages((current) => sortMessages([
          ...current,
          ...(payload?.messages || []).filter((item) => !current.some((entry) => String(entry.id) === String(item.id)))
        ]));
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        node = document.querySelector(`[data-message-id="${target.id}"]`);
      } catch {
        // Keep the reply card usable even when the remote history is unavailable.
      }
    }
    if (!node) {
      pushToast('Original message is outside the loaded history', 'error');
      return;
    }
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightedMessageId(String(target.id));
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1800);
  }

  async function copyMessage(message) {
    const text = getMessageCopyText(message);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    pushToast('Message copied');
  }

  async function shareMessage(message) {
    const text = getMessageCopyText(message);
    const params = workspace === 'dm'
      ? `workspace=dm&conversation=${encodeURIComponent(dmConversationId)}&message=${encodeURIComponent(message.id)}`
      : `workspace=server&channel=${encodeURIComponent(channelId)}&message=${encodeURIComponent(message.id)}`;
    const url = `${window.location.origin}/?${params}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'WebCord message', text, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(`${text}${text ? '\n' : ''}${url}`);
    pushToast('Share link copied');
  }

  async function toggleMessagePin(message) {
    const path = workspace === 'dm'
      ? `/dms/${dmConversationId}/messages/${message.id}/pin`
      : `/messages/${message.id}/pin`;
    try {
      const updated = await apiFetch(path, { method: 'PUT' }, token);
      setMessages((current) => replaceMessage(current, updated));
      setMessageSearchResults((current) => replaceMessage(current, updated));
      setPinnedMessages((current) => updated.pinnedAt
        ? replaceMessage(current, updated)
        : current.filter((entry) => String(entry.id) !== String(updated.id)));
      pushToast(updated.pinnedAt ? 'Message pinned' : 'Message unpinned');
    } catch (err) {
      reportError(err, 'Could not update pin');
    }
  }

  function toggleMessageSelection(message) {
    setSelectedMessageIds((current) => current.includes(String(message.id))
      ? current.filter((id) => id !== String(message.id))
      : [...current, String(message.id)]);
  }

  function beginForwardMessages(message) {
    const selected = selectedMessageIds.length
      ? messages.filter((entry) => selectedMessageIds.includes(String(entry.id)))
      : [message];
    setForwardingMessages(selected);
  }

  async function forwardMessagesTo(target) {
    if (!target || forwardingMessages.length === 0) return;
    try {
      for (const message of forwardingMessages) {
        const body = {
          content: message.content || '',
          attachmentUrl: message.attachmentUrl,
          attachmentType: message.attachmentType,
          attachmentName: message.attachmentName,
          transcript: message.transcript,
          forwardedFromName: getDisplayName(message.author)
        };
        const created = target.type === 'channel'
          ? await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ ...body, channelId: Number(target.id) }) }, token)
          : await apiFetch(`/dms/${target.id}/messages`, { method: 'POST', body: JSON.stringify(body) }, token);
        const isCurrent = (target.type === 'channel' && workspace === 'server' && String(target.id) === String(channelId))
          || (target.type === 'dm' && workspace === 'dm' && String(target.id) === String(dmConversationId));
        if (isCurrent) setMessages((current) => mergeMessage(current, created));
      }
      pushToast(`${forwardingMessages.length} message${forwardingMessages.length === 1 ? '' : 's'} forwarded`);
      setForwardingMessages([]);
      setSelectedMessageIds([]);
    } catch (err) {
      reportError(err, 'Could not forward messages');
    }
  }

  async function deleteSelectedMessages() {
    const selected = messages.filter((message) => selectedMessageIds.includes(String(message.id)));
    for (const message of selected) {
      await deleteMessage(message);
    }
    setSelectedMessageIds([]);
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
    apiFetch('/voice/ice-servers', {}, token)
      .then((payload) => {
        if (Array.isArray(payload?.iceServers) && payload.iceServers.length > 0) {
          setVoiceIceServers(payload.iceServers);
        }
      })
      .catch(() => {});
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
    refreshStories({ silent: true }).catch(() => {});
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

  async function refreshStories({ silent = false } = {}) {
    if (!token || isAdminRoute) return;
    try {
      if (!silent) setStoriesLoading(true);
      const nextStories = await apiFetch('/stories', {}, token);
      setStories(Array.isArray(nextStories) ? nextStories : []);
    } catch (err) {
      if (!silent) setError(err.message);
      throw err;
    } finally {
      if (!silent) setStoriesLoading(false);
    }
  }

  async function uploadProfileTrack(file) {
    if (!file || !token) return;
    if (!isAudioFile(file)) {
      setError('Choose an audio file for the profile track');
      if (trackInputRef.current) trackInputRef.current.value = '';
      return;
    }

    try {
      setTrackUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await apiFetch('/upload', { method: 'POST', body: formData }, token);
      const nextDraft = {
        ...profileDraft,
        favoriteTrack: profileDraft.favoriteTrack || uploaded.name,
        favoriteTrackUrl: uploaded.url,
        favoriteTrackName: uploaded.name
      };
      setProfileDraft(nextDraft);
      await saveProfile(nextDraft);
      pushToast('Profile track attached');
    } catch (err) {
      reportError(err, 'Could not upload profile track');
    } finally {
      setTrackUploading(false);
      if (trackInputRef.current) trackInputRef.current.value = '';
    }
  }

  async function removeProfileTrack() {
    const nextDraft = {
      ...profileDraft,
      favoriteTrackUrl: '',
      favoriteTrackName: ''
    };
    setProfileDraft(nextDraft);
    await saveProfile(nextDraft);
    pushToast('Profile track file removed');
  }

  function openStoryComposer() {
    setStoryDraft({
      caption: '',
      musicTitle: '',
      musicArtist: '',
      mediaFile: null,
      musicFile: null
    });
    setShowStoryComposer(true);
  }

  function selectStoryMedia(file) {
    if (!file) return;
    if (!isStoryFile(file)) {
      setError('Choose an image or video for stories');
      if (storyInputRef.current) storyInputRef.current.value = '';
      return;
    }
    setStoryDraft((prev) => ({ ...prev, mediaFile: file }));
    if (storyInputRef.current) storyInputRef.current.value = '';
  }

  function selectStoryMusic(file) {
    if (!file) return;
    if (!isAudioFile(file)) {
      setError('Choose an audio file for story music');
      if (storyMusicInputRef.current) storyMusicInputRef.current.value = '';
      return;
    }
    setStoryDraft((prev) => ({
      ...prev,
      musicFile: file,
      musicTitle: prev.musicTitle || file.name.replace(/\.[^.]+$/, '')
    }));
    if (storyMusicInputRef.current) storyMusicInputRef.current.value = '';
  }

  async function publishStoryDraft() {
    if (!token || !storyDraft.mediaFile) {
      setError('Choose an image or video for the story');
      return;
    }

    try {
      setStoryUploading(true);
      const formData = new FormData();
      formData.append('file', storyDraft.mediaFile);
      const uploaded = await apiFetch('/upload', { method: 'POST', body: formData }, token);
      let uploadedMusic = null;
      if (storyDraft.musicFile) {
        const musicForm = new FormData();
        musicForm.append('file', storyDraft.musicFile);
        uploadedMusic = await apiFetch('/upload', { method: 'POST', body: musicForm }, token);
      }
      const story = await apiFetch(
        '/stories',
        {
          method: 'POST',
          body: JSON.stringify({
            mediaUrl: uploaded.url,
            mediaType: getStoryMediaType(storyDraft.mediaFile),
            caption: storyDraft.caption,
            musicUrl: uploadedMusic?.url || null,
            musicTitle: storyDraft.musicTitle,
            musicArtist: storyDraft.musicArtist,
            musicAttachment: uploadedMusic?.name || ''
          })
        },
        token
      );
      setStories((prev) => [story, ...prev.filter((item) => String(item.id) !== String(story.id))]);
      setWorkspace('stories');
      setActiveStoryId(story.id);
      setShowStoryComposer(false);
      pushToast('Story published');
    } catch (err) {
      reportError(err, 'Could not publish story');
    } finally {
      setStoryUploading(false);
      if (storyInputRef.current) storyInputRef.current.value = '';
      if (storyMusicInputRef.current) storyMusicInputRef.current.value = '';
    }
  }

  async function uploadChatWallpaper(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image for chat wallpaper');
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Wallpaper must be 4 MB or smaller for browser storage');
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
      return;
    }
    try {
      const chatWallpaper = await readFileAsDataUrl(file);
      setClientSettings((prev) => ({
        ...prev,
        chatWallpaper,
        chatWallpaperName: file.name
      }));
      pushToast('Chat wallpaper updated');
    } catch (err) {
      reportError(err, 'Could not load wallpaper');
    } finally {
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
    }
  }

  async function openStory(story) {
    if (!story?.id) return;
    setActiveStoryId(story.id);
    if (!story.viewed) {
      setStories((prev) => prev.map((item) => (String(item.id) === String(story.id) ? { ...item, viewed: true } : item)));
      await apiFetch(`/stories/${story.id}/view`, { method: 'POST' }, token).catch(() => {});
    }
  }

  function stepStory(direction) {
    if (!stories.length) return;
    const currentIndex = Math.max(0, stories.findIndex((story) => String(story.id) === String(activeStoryId)));
    const nextIndex = (currentIndex + direction + stories.length) % stories.length;
    openStory(stories[nextIndex]).catch(() => {});
  }

  async function saveProfile(nextDraft = profileDraft) {
    const cleanDraft = createProfileDraft({ ...user, ...nextDraft, accentColor: normalizeProfileAccent(nextDraft.accentColor) });
    const nextUser = await apiFetch(
      '/me/profile',
      {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: cleanDraft.displayName,
          bio: cleanDraft.bio,
          statusText: cleanDraft.statusText,
          favoriteTrack: cleanDraft.favoriteTrack,
          favoriteTrackUrl: cleanDraft.favoriteTrackUrl || null,
          favoriteTrackName: cleanDraft.favoriteTrackName || null,
          accentColor: cleanDraft.accentColor,
          avatarUrl: cleanDraft.avatarUrl || null,
          bannerUrl: cleanDraft.bannerUrl || null
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
        body: JSON.stringify({
          username,
          password,
          platform: IS_TAURI_CLIENT ? 'WINDOWS' : /Android/i.test(navigator.userAgent) ? 'ANDROID' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'IOS' : 'WEB',
          deviceName: IS_TAURI_CLIENT ? 'WebCord for Windows' : /Android/i.test(navigator.userAgent) ? 'WebCord for Android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'WebCord for iPhone and iPad' : 'WebCord Web'
        })
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
    if (token) apiFetch('/auth/logout', { method: 'POST' }, token).catch(() => {});
    cleanupVoice();
    setVoiceJoined(false);
    setGuild(null);
    setChannels([]);
    setSocial(EMPTY_SOCIAL);
    setMessages([]);
    setStories([]);
    setActiveStoryId(null);
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

    if ((social.blockedUserIds || []).some((userId) => String(userId) === String(profile.id))) {
      return { label: 'Blocked', canAddFriend: false };
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

  function openReportForUser(profile = viewedProfile) {
    if (!profile?.id) return;
    setReportTarget({
      targetType: 'USER',
      targetUserId: profile.id,
      user: profile
    });
  }

  function openReportForMessage(message) {
    if (!message?.id) return;
    setReportTarget({
      targetType: workspace === 'dm' ? 'DIRECT_MESSAGE' : 'MESSAGE',
      ...(workspace === 'dm' ? { directMessageId: message.id } : { messageId: message.id }),
      targetUserId: message.author?.id,
      user: message.author,
      message
    });
  }

  async function submitReport(payload) {
    try {
      await apiFetch(
        '/moderation/reports',
        {
          method: 'POST',
          body: JSON.stringify({
            targetType: payload.targetType,
            targetUserId: payload.targetUserId,
            messageId: payload.messageId,
            directMessageId: payload.directMessageId,
            reason: payload.reason,
            details: payload.details
          })
        },
        token
      );
      setReportTarget(null);
      pushToast('Report sent to moderators', 'success');
    } catch (err) {
      reportError(err, 'Could not send report');
    }
  }

  async function blockProfile(profile = viewedProfile) {
    if (!profile?.id) return;
    try {
      await apiFetch(`/users/${profile.id}/block`, { method: 'POST' }, token);
      await refreshSocialData();
      setViewedProfile(null);
      pushToast(`Blocked @${profile.username || 'user'}`, 'success');
    } catch (err) {
      reportError(err, 'Could not block user');
    }
  }

  async function unblockProfile(profile = viewedProfile) {
    if (!profile?.id) return;
    try {
      await apiFetch(`/users/${profile.id}/block`, { method: 'DELETE' }, token);
      await refreshSocialData();
      pushToast(`Unblocked @${profile.username || 'user'}`, 'success');
    } catch (err) {
      reportError(err, 'Could not unblock user');
    }
  }

  function stopMessageRecordingTimer() {
    if (messageRecordingTimerRef.current) {
      window.clearInterval(messageRecordingTimerRef.current);
      messageRecordingTimerRef.current = null;
    }
  }

  function stopMessageRecordingWatchdog() {
    if (messageRecordingStopWatchdogRef.current) {
      window.clearTimeout(messageRecordingStopWatchdogRef.current);
      messageRecordingStopWatchdogRef.current = null;
    }
  }

  function stopMessageRecordingStream() {
    if (messageRecordingCircleSessionRef.current) {
      messageRecordingCircleSessionRef.current.stop();
      messageRecordingCircleSessionRef.current = null;
      messageRecordingStreamRef.current = null;
      setRecordingPreviewStream(null);
      setCircleTorchEnabled(false);
      setCircleCameraSwitching(false);
      return;
    }

    messageRecordingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    messageRecordingStreamRef.current = null;
    setRecordingPreviewStream(null);
    setCircleTorchEnabled(false);
    setCircleCameraSwitching(false);
  }

  function resetMessageRecordingUi(phase = 'idle') {
    stopMessageRecordingTimer();
    speechRecognitionRef.current?.stop?.();
    speechRecognitionRef.current = null;
    setVoiceRecording(false);
    setCircleRecording(false);
    setRecordingElapsed(0);
    setRecordingCountdown(0);
    setRecordingPaused(false);
    setCircleTorchEnabled(false);
    setCircleCameraSwitching(false);
    setRecordingPhase(phase);
  }

  async function finalizeMessageRecording(recorder) {
    if (messageRecordingFinalizedRef.current) return;
    messageRecordingFinalizedRef.current = true;
    stopMessageRecordingWatchdog();

    const chunks = [...messageRecordingChunksRef.current];
    const cancelled = messageRecordingCancelledRef.current;
    const recordedKind = messageRecordingKindRef.current;
    const transcript = recordedKind === 'voice' ? recordingTranscriptRef.current.trim() : '';
    const type = recorder?.mimeType || (recordedKind === 'circle' ? 'video/webm' : 'audio/webm');

    stopMessageRecordingStream();
    messageRecorderRef.current = null;
    messageRecordingChunksRef.current = [];
    messageRecordingKindRef.current = '';
    resetMessageRecordingUi('idle');

    if (!cancelled && chunks.length > 0) {
      await uploadRecordedAttachment(new Blob(chunks, { type }), recordedKind, transcript);
    }
  }

  function startVoiceTranscription() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recordingTranscriptRef.current = '';
    setRecordingTranscript('');
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'ru-RU';
      recognition.onresult = (event) => {
        const text = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
        recordingTranscriptRef.current = text;
        setRecordingTranscript(text);
      };
      recognition.onerror = () => {};
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      // Transcription is an enhancement; recording remains available without it.
    }
  }

  async function runCircleCountdown(requestId) {
    setRecordingPhase('countdown');
    for (const value of [3, 2, 1]) {
      if (requestId !== messageRecordingRequestIdRef.current || messageRecordingCancelledRef.current) return false;
      setRecordingCountdown(value);
      navigator.vibrate?.(value === 1 ? 24 : 10);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
    setRecordingCountdown(0);
    return requestId === messageRecordingRequestIdRef.current && !messageRecordingCancelledRef.current;
  }

  function cleanupMessageRecording({ cancel = false } = {}) {
    messageRecordingRequestIdRef.current += 1;
    messageRecordingCancelledRef.current = cancel;
    const recorder = messageRecorderRef.current;

    resetMessageRecordingUi(cancel ? 'idle' : 'finalizing');

    if (!recorder || recorder.state === 'inactive') {
      stopMessageRecordingStream();
      stopMessageRecordingWatchdog();
      messageRecorderRef.current = null;
      messageRecordingChunksRef.current = [];
      messageRecordingKindRef.current = '';
      setRecordingPhase('idle');
      return;
    }

    if (cancel) stopMessageRecordingStream();

    try {
      if (!cancel && recorder.state === 'recording' && typeof recorder.requestData === 'function') {
        recorder.requestData();
      }
      recorder.stop();
    } catch {
      finalizeMessageRecording(recorder).catch(() => {});
      return;
    }

    stopMessageRecordingWatchdog();
    messageRecordingStopWatchdogRef.current = window.setTimeout(() => {
      finalizeMessageRecording(recorder).catch(() => {});
    }, 2500);
  }

  function toggleMessageRecordingPause() {
    const recorder = messageRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    if (recorder.state === 'recording' && typeof recorder.pause === 'function') {
      recorder.pause();
      setRecordingPaused(true);
      return;
    }

    if (recorder.state === 'paused' && typeof recorder.resume === 'function') {
      recorder.resume();
      setRecordingPaused(false);
    }
  }

  async function toggleCircleTorch() {
    const [track] = messageRecordingStreamRef.current?.getVideoTracks?.() || [];
    if (!track?.applyConstraints) {
      pushToast('Torch is not supported on this device', 'error');
      return;
    }

    const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (!capabilities?.torch) {
      pushToast('Torch is not supported on this device', 'error');
      return;
    }

    try {
      const nextTorch = !circleTorchEnabled;
      await track.applyConstraints({ advanced: [{ torch: nextTorch }] });
      setCircleTorchEnabled(nextTorch);
    } catch (err) {
      reportError(err, 'Could not toggle torch');
    }
  }

  async function switchCircleCameraRealtime() {
    const next = circleFacingMode === 'user' ? 'environment' : 'user';
    const session = messageRecordingCircleSessionRef.current;

    if (!circleRecording || !session) {
      setCircleFacingMode(next);
      pushToast(`Next video circle will use ${next === 'user' ? 'front' : 'rear'} camera`);
      return;
    }

    try {
      setCircleCameraSwitching(true);
      const previewStream = await session.switchCamera(next);
      messageRecordingStreamRef.current = previewStream;
      setRecordingPreviewStream(previewStream);
      setCircleFacingMode(next);
      setCircleTorchEnabled(false);
      pushToast(`Switched to ${next === 'user' ? 'front' : 'rear'} camera`);
    } catch (err) {
      reportError(err, 'Could not switch camera');
    } finally {
      setCircleCameraSwitching(false);
    }
  }

  async function uploadRecordedAttachment(blob, kind, transcript = '', { preserveDraft = false } = {}) {
    if (!blob?.size) {
      setError('Recorded media was empty');
      return;
    }

    const fileName = kind === 'circle'
      ? `webcord-circle-video-${Date.now()}.webm`
      : `webcord-voice-message-${Date.now()}.webm`;

    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    try {
      if (!preserveDraft) {
        await writeRecordingDraft({ blob, kind, transcript, createdAt: Date.now() }).catch(() => {});
      }
      setUploading(true);
      setRecordingUploadProgress(0);
      if (kind === 'circle') {
        setCircleRecording(true);
        setRecordingPhase('uploading');
      }
      const formData = new FormData();
      formData.append('file', blob, fileName);
      const uploaded = await uploadFormDataWithProgress('/upload', formData, token, setRecordingUploadProgress, controller.signal);
      setPendingAttachment({ ...uploaded, transcript: transcript || undefined });
      await clearRecordingDraft();
      pushToast(kind === 'circle' ? 'Video circle attached' : 'Voice message attached');
    } catch (err) {
      reportError(err, 'Could not upload recorded media');
    } finally {
      uploadAbortControllerRef.current = null;
      setUploading(false);
      setRecordingUploadProgress(0);
      setCircleRecording(false);
      setRecordingPhase('idle');
    }
  }

  async function startMessageRecording(kind) {
    if (!token) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Recording is not supported in this browser');
      return;
    }
    if (pendingAttachment) {
      setError('Send or remove the current attachment before recording another one');
      return;
    }
    if (editingMessage) {
      setError('Finish editing before recording media');
      return;
    }

    const activeRecorder = messageRecorderRef.current;
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      cleanupMessageRecording();
      return;
    }

    const requestId = messageRecordingRequestIdRef.current + 1;
    messageRecordingRequestIdRef.current = requestId;
    messageRecordingCancelledRef.current = false;
    messageRecordingFinalizedRef.current = false;

    try {
      setError('');
      if (kind === 'circle') {
        setCircleRecording(true);
        setRecordingPhase('requesting');
      }
      let stream;
      let previewStream = null;
      if (kind === 'circle') {
        const circleSession = await createSwitchableCircleRecorder({
          micDeviceId: clientSettings.micDeviceId,
          cameraDeviceId: clientSettings.cameraDeviceId,
          facingMode: circleFacingMode
        });
        if (requestId !== messageRecordingRequestIdRef.current || messageRecordingCancelledRef.current) {
          circleSession.stop();
          return;
        }
        messageRecordingCircleSessionRef.current = circleSession;
        stream = circleSession.recordStream;
        previewStream = circleSession.previewStream;
      } else {
        stream = await requestVoiceAudioStream(clientSettings.micDeviceId);
        if (requestId !== messageRecordingRequestIdRef.current || messageRecordingCancelledRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
      }
      const mimeType = kind === 'circle'
        ? getSupportedRecorderMimeType(VIDEO_RECORDER_MIME_TYPES)
        : getSupportedRecorderMimeType(AUDIO_RECORDER_MIME_TYPES);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      messageRecordingChunksRef.current = [];
      messageRecordingStreamRef.current = previewStream || stream;
      setRecordingPreviewStream(kind === 'circle' ? previewStream : null);
      messageRecorderRef.current = recorder;
      messageRecordingKindRef.current = kind;
      messageRecordingCancelledRef.current = false;
      messageRecordingFinalizedRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) messageRecordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        finalizeMessageRecording(recorder).catch((err) => reportError(err, 'Could not finish media recording'));
      };
      recorder.onerror = () => {
        messageRecordingCancelledRef.current = true;
        finalizeMessageRecording(recorder).catch(() => {});
        reportError(new Error('The browser stopped the media recorder'), 'Could not record media');
      };

      if (kind === 'circle' && !(await runCircleCountdown(requestId))) {
        cleanupMessageRecording({ cancel: true });
        return;
      }
      if (kind === 'voice') startVoiceTranscription();
      recorder.start(1000);
      setRecordingElapsed(0);
      setRecordingPaused(false);
      setVoiceRecording(kind === 'voice');
      setCircleRecording(kind === 'circle');
      setRecordingPhase('recording');
      messageRecordingTimerRef.current = window.setInterval(() => {
        setRecordingElapsed((value) => {
          if (messageRecorderRef.current?.state === 'paused') return value;
          const next = value + 1;
          if (kind === 'circle' && next >= CIRCLE_RECORDING_MAX_SECONDS) {
            window.queueMicrotask(() => cleanupMessageRecording());
            return CIRCLE_RECORDING_MAX_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      cleanupMessageRecording({ cancel: true });
      reportError(new Error(getMediaErrorMessage(err, kind === 'circle' ? 'Could not access the camera' : 'Could not access the microphone')));
    }
  }

  async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []).slice(0, 10);
    if (files.length === 0 || !token) return;
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    try {
      setUploading(true);
      setUploadProgress(0);
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const formData = new FormData();
        formData.append('file', file);
        uploaded.push(await uploadFormDataWithProgress('/upload', formData, token, (fileProgress) => {
          setUploadProgress(Math.round(((index + fileProgress / 100) / files.length) * 100));
        }, controller.signal));
      }
      setPendingAttachment(uploaded[0] || null);
      setPendingAttachmentQueue(uploaded.slice(1));
      pushToast(uploaded.length > 1 ? `${uploaded.length} files ready to send` : 'File ready to send');
    } catch (err) {
      setError(err.message);
      setPendingAttachment(null);
      setPendingAttachmentQueue([]);
    } finally {
      uploadAbortControllerRef.current = null;
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function cancelAttachmentUpload() {
    uploadAbortControllerRef.current?.abort();
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

  function updateChatPreference(scopeKey, patch) {
    setChatPreferences((current) => ({
      ...current,
      [scopeKey]: { ...(current[scopeKey] || {}), ...patch }
    }));
  }

  function toggleConversationPreference(conversationId, field) {
    const scopeKey = `dm:${conversationId}`;
    updateChatPreference(scopeKey, { [field]: !getChatPreference(scopeKey)[field] });
    navigator.vibrate?.(10);
  }

  function formatComposerSelection(prefix, suffix = prefix) {
    const input = composerInputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? newMessage.length;
    const end = input.selectionEnd ?? start;
    const selected = newMessage.slice(start, end);
    const next = `${newMessage.slice(0, start)}${prefix}${selected}${suffix}${newMessage.slice(end)}`;
    setNewMessage(next);
    window.requestAnimationFrame(() => {
      input.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      input.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  async function openMessageThread(message) {
    if (!message?.id) return;
    setThreadLoading(true);
    setActiveThread({ root: message, replies: [] });
    try {
      const path = workspace === 'dm'
        ? `/threads/dm/${dmConversationId}/${message.id}`
        : `/threads/channel/${message.id}`;
      setActiveThread(await apiFetch(path, {}, token));
    } catch (err) {
      reportError(err, 'Could not load thread');
      setActiveThread(null);
    } finally {
      setThreadLoading(false);
    }
  }

  async function voteInPoll(poll, optionIds) {
    try {
      const updated = await apiFetch(`/polls/${poll.id}/votes`, {
        method: 'POST',
        body: JSON.stringify({ optionIds })
      }, token);
      setMessages((current) => current.map((message) => (
        message.poll?.id === poll.id ? { ...message, poll: updated } : message
      )));
      setActiveThread((current) => current ? {
        ...current,
        root: current.root?.poll?.id === poll.id ? { ...current.root, poll: updated } : current.root,
        replies: current.replies.map((message) => message.poll?.id === poll.id ? { ...message, poll: updated } : message)
      } : current);
    } catch (err) {
      reportError(err, 'Could not update vote');
    }
  }

  function navigateFromActivity(activity) {
    if (activity.conversationId) {
      setWorkspace('dm');
      setDmConversationId(String(activity.conversationId));
      if (isMobile) setMobileChatOpen(true);
    } else if (activity.channelId) {
      setWorkspace('server');
      setChannelId(String(activity.channelId));
      if (isMobile) setMobileChatOpen(true);
    }
    if (activity.messageId || activity.directMessageId) {
      window.setTimeout(() => scrollToMessage({ id: activity.messageId || activity.directMessageId }), 240);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = newMessage.trim();
    if ((!content && !pendingAttachment && pendingAttachmentQueue.length === 0) || !token) return;
    if (!networkOnline) {
      if (editingMessage) {
        setError('Reconnect before editing this message.');
        announceComposerPhase('error');
        return;
      }
      const attachments = [pendingAttachment, ...pendingAttachmentQueue].filter(Boolean);
      const queuedBodies = (attachments.length > 0 ? attachments : [null]).map((attachment, index) => ({
        clientId: -(Date.now() + index),
        body: {
          content: index === 0 ? content : '',
          attachmentUrl: attachment?.url,
          attachmentType: attachment?.type,
          attachmentName: attachment?.name,
          transcript: attachment?.transcript,
          replyToId: index === 0 ? replyTarget?.id : undefined
        }
      }));
      setMessages((current) => queuedBodies.reduce((next, queued, index) => mergeMessage(next, {
        id: queued.clientId,
        channelId: workspace === 'server' ? Number(channelId) : undefined,
        conversationId: workspace === 'dm' ? Number(dmConversationId) : undefined,
        ...queued.body,
        replyTo: index === 0 ? replyTarget || null : null,
        author: user,
        createdAt: new Date(Date.now() + index).toISOString(),
        queued: true,
        reactions: []
      }), current));
      setMessageOutbox((current) => [
        ...current,
        ...queuedBodies.map((queued) => ({
          ...queued,
          workspace,
          scopeId: workspace === 'dm' ? dmConversationId : channelId
        }))
      ]);
      setNewMessage('');
      setPendingAttachment(null);
      setPendingAttachmentQueue([]);
      setReplyTarget(null);
      pushToast('Message queued and will send when you reconnect');
      setSocketStatus('offline');
      announceComposerPhase('sent');
      return;
    }

    let optimisticId = null;
    try {
      announceComposerPhase(editingMessage ? 'saving' : 'sending');
      shouldStickToBottomRef.current = true;
      let createdMessage = null;

      if (editingMessage) {
        const path = workspace === 'dm'
          ? `/dms/${dmConversationId}/messages/${editingMessage.id}`
          : `/messages/${editingMessage.id}`;
        const updatedMessage = await apiFetch(path, { method: 'PATCH', body: JSON.stringify({ content }) }, token);
        setMessages((prev) => replaceMessage(prev, updatedMessage));
        setEditingMessage(null);
        setReplyTarget(null);
        setError('');
        setNewMessage('');
        setPendingAttachment(null);
        setShowEmojiPicker(false);
        announceComposerPhase('saved');
        pushToast('Message updated');
        return;
      }

      optimisticId = -Date.now();
      const optimisticMessage = {
        id: optimisticId,
        channelId: workspace === 'server' ? Number(channelId) : undefined,
        conversationId: workspace === 'dm' ? Number(dmConversationId) : undefined,
        content,
        attachmentUrl: pendingAttachment?.url,
        attachmentType: pendingAttachment?.type,
        attachmentName: pendingAttachment?.name,
        transcript: pendingAttachment?.transcript,
        replyTo: replyTarget || null,
        author: user,
        createdAt: new Date().toISOString(),
        optimistic: true,
        reactions: []
      };
      setMessages((current) => mergeMessage(current, optimisticMessage));

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
              attachmentName: pendingAttachment?.name,
              transcript: pendingAttachment?.transcript,
              replyToId: replyTarget?.id,
              silent: silentMessage
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
              attachmentName: pendingAttachment?.name,
              transcript: pendingAttachment?.transcript,
              replyToId: replyTarget?.id,
              silent: silentMessage
            })
          },
          token
        );
      }

      if (createdMessage) {
        setMessages((prev) => mergeMessage(
          prev.filter((message) => String(message.id) !== String(optimisticId)),
          createdMessage
        ));
      }

      for (const attachment of pendingAttachmentQueue) {
        const body = {
          content: '',
          attachmentUrl: attachment.url,
          attachmentType: attachment.type,
          attachmentName: attachment.name,
          transcript: attachment.transcript
        };
        const extraMessage = workspace === 'dm'
          ? await apiFetch(`/dms/${dmConversationId}/messages`, { method: 'POST', body: JSON.stringify(body) }, token)
          : await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ ...body, channelId: Number(channelId) }) }, token);
        setMessages((current) => mergeMessage(current, extraMessage));
      }

      setError('');
      setNewMessage('');
      setPendingAttachment(null);
      setPendingAttachmentQueue([]);
      setRecordingTranscript('');
      recordingTranscriptRef.current = '';
      setReplyTarget(null);
      setSilentMessage(false);
      setShowEmojiPicker(false);
      setShowComposerTools(false);
      announceComposerPhase('sent');
    } catch (err) {
      if (optimisticId !== null) {
        setMessages((current) => current.filter((message) => String(message.id) !== String(optimisticId)));
      }
      announceComposerPhase('error');
      reportError(err, 'Failed to send message');
    }
  }

  function beginReply(message) {
    setReplyTarget(message);
    setEditingMessage(null);
  }

  function beginEdit(message) {
    setEditingMessage(message);
    setReplyTarget(null);
    setNewMessage(message.content || '');
  }

  async function deleteMessage(message) {
    if (!message?.id || !token) return;
    try {
      const path = workspace === 'dm'
        ? `/dms/${dmConversationId}/messages/${message.id}`
        : `/messages/${message.id}`;
      await apiFetch(path, { method: 'DELETE' }, token);
      setMessages((prev) => prev.filter((entry) => String(entry.id) !== String(message.id)));
      setReplyTarget((current) => String(current?.id) === String(message.id) ? null : current);
      setEditingMessage((current) => String(current?.id) === String(message.id) ? null : current);
    } catch (err) {
      reportError(err, 'Failed to delete message');
    }
  }

  async function toggleMessageReaction(message, emoji = '❤️') {
    if (!message?.id || !token) return;
    try {
      const path = workspace === 'dm'
        ? `/dms/${dmConversationId}/messages/${message.id}/reactions`
        : `/messages/${message.id}/reactions`;
      const payload = await apiFetch(path, {
        method: 'PUT',
        body: JSON.stringify({ emoji })
      }, token);
      setMessages((prev) => prev.map((entry) => (
        String(entry.id) === String(message.id)
          ? { ...entry, reactions: payload.reactions || [] }
          : entry
      )));
    } catch (err) {
      reportError(err, 'Failed to update reaction');
    }
  }

  function cancelComposerContext() {
    setReplyTarget(null);
    setEditingMessage(null);
    setNewMessage('');
  }

  function setVoiceQualityState(nextQuality) {
    voiceQualityRef.current = nextQuality;
    setVoiceQuality(nextQuality);
  }

  function getStatsNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getStatsBool(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function voiceQualityLabel({ rttMs, jitterMs, packetLossPercent }) {
    if (packetLossPercent >= 10 || jitterMs >= 70 || rttMs >= 360) return 'Poor';
    if (packetLossPercent >= 4 || jitterMs >= 40 || rttMs >= 200) return 'Fair';
    if (rttMs === 0 && jitterMs === 0 && packetLossPercent === 0) return 'Connecting';
    return 'Good';
  }

  function applyVoiceSenderParameters(peer) {
    peer?.getSenders?.()
      .filter((sender) => sender.track?.kind === 'audio')
      .forEach((sender) => {
        if (typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
        const parameters = sender.getParameters() || {};
        parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
        parameters.encodings = parameters.encodings.map((encoding) => ({
          ...encoding,
          maxBitrate: 64000,
          priority: 'high',
          networkPriority: 'high'
        }));
        sender.setParameters(parameters).catch(() => {});
      });
  }

  function applyLocalVoiceTrackConstraints(stream) {
    stream?.getAudioTracks?.().forEach((track) => {
      track.applyConstraints?.(VOICE_AUDIO_CONSTRAINTS).catch(() => {});
    });
  }

  async function acquireVoiceInputStream() {
    const rawStream = await requestVoiceAudioStream(clientSettings.micDeviceId);
    const { stream, audioContext } = noiseSuppressionEnabled
      ? await createEnhancedVoiceStream(rawStream)
      : { stream: rawStream, audioContext: null };
    applyLocalVoiceTrackConstraints(rawStream);
    applyLocalVoiceTrackConstraints(stream);
    return { rawStream, stream, audioContext };
  }

  function addStreamTracksToPeer(peer, stream) {
    if (!peer || !stream) return;
    const senderTrackIds = new Set(peer.getSenders().map((sender) => sender.track?.id).filter(Boolean));
    stream.getTracks().forEach((track) => {
      if (!senderTrackIds.has(track.id)) {
        peer.addTrack(track, stream);
      }
    });
    applyVoiceSenderParameters(peer);
  }

  function ensurePeerReceiveTransceivers(peer) {
    if (!peer?.addTransceiver || !peer.getTransceivers) return;
    const existingKinds = new Set(
      peer.getTransceivers()
        .map((transceiver) => transceiver.sender?.track?.kind || transceiver.receiver?.track?.kind)
        .filter(Boolean)
    );
    if (!existingKinds.has('audio')) peer.addTransceiver('audio', { direction: 'recvonly' });
    if (!existingKinds.has('video')) peer.addTransceiver('video', { direction: 'recvonly' });
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
    ensurePeerReceiveTransceivers(peer);

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

      if (peer.connectionState === 'disconnected' && voiceJoinedRef.current) {
        setVoiceStatus('Voice network is recovering...');
      }

      if (peer.connectionState === 'failed' && voiceJoinedRef.current) {
        setVoiceStatus('Restarting voice route...');
        peer.restartIce?.();
        createPeerAndOffer(remoteSocketId, { iceRestart: true }).catch(() => setError('Could not restart voice connection'));
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed' && voiceJoinedRef.current) {
        peer.restartIce?.();
        createPeerAndOffer(remoteSocketId, { iceRestart: true }).catch(() => {});
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

  function stopVoiceStats() {
    if (voiceStatsTimerRef.current) {
      window.clearInterval(voiceStatsTimerRef.current);
      voiceStatsTimerRef.current = null;
    }
    lastVoiceStatsRef.current = { at: 0, bytesReceived: 0, bytesSent: 0 };
    setVoiceQualityState(DEFAULT_VOICE_QUALITY);
  }

  function startVoiceStats() {
    if (voiceStatsTimerRef.current) window.clearInterval(voiceStatsTimerRef.current);
    lastVoiceStatsRef.current = { at: 0, bytesReceived: 0, bytesSent: 0 };
    setVoiceQualityState({ ...DEFAULT_VOICE_QUALITY, label: 'Connecting' });
    const sample = () => sampleVoiceStats().catch(() => {});
    sample();
    voiceStatsTimerRef.current = window.setInterval(sample, 2000);
  }

  async function sampleVoiceStats() {
    if (!voiceJoinedRef.current) return;

    const peers = Object.values(peersRef.current);
    if (peers.length === 0) {
      const nextQuality = { ...DEFAULT_VOICE_QUALITY, label: 'Waiting' };
      setVoiceQualityState(nextQuality);
      return;
    }

    const reports = [];
    for (const peer of peers) {
      const stats = await peer.getStats();
      stats.forEach((report) => reports.push(report));
    }

    const reportById = new Map(reports.map((report) => [report.id, report]));
    let packetsLost = 0;
    let packetsReceived = 0;
    let bytesReceived = 0;
    let bytesSent = 0;
    let jitterSeconds = 0;
    let rttSeconds = 0;
    let audioLevel = 0;
    let usingRelay = false;

    reports.forEach((report) => {
      const kind = String(report.kind || report.mediaType || '');
      if (report.type === 'inbound-rtp' && kind === 'audio') {
        packetsLost += getStatsNumber(report.packetsLost);
        packetsReceived += getStatsNumber(report.packetsReceived);
        bytesReceived += getStatsNumber(report.bytesReceived);
        jitterSeconds = Math.max(jitterSeconds, getStatsNumber(report.jitter));
      }

      if (report.type === 'outbound-rtp' && kind === 'audio') {
        bytesSent += getStatsNumber(report.bytesSent);
      }

      if ((report.type === 'media-source' || report.type === 'track') && kind === 'audio') {
        audioLevel = Math.max(audioLevel, getStatsNumber(report.audioLevel));
      }

      if (report.type === 'candidate-pair' && (getStatsBool(report.selected) || getStatsBool(report.nominated) || report.state === 'succeeded')) {
        rttSeconds = Math.max(rttSeconds, getStatsNumber(report.currentRoundTripTime));
        const localCandidate = reportById.get(report.localCandidateId);
        const remoteCandidate = reportById.get(report.remoteCandidateId);
        usingRelay = usingRelay || localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay';
      }
    });

    const now = performance.now();
    const previous = lastVoiceStatsRef.current;
    const elapsedSeconds = previous.at ? (now - previous.at) / 1000 : 0;
    const inboundKbps = elapsedSeconds > 0 ? Math.round(Math.max(0, bytesReceived - previous.bytesReceived) * 8 / elapsedSeconds / 1000) : 0;
    const outboundKbps = elapsedSeconds > 0 ? Math.round(Math.max(0, bytesSent - previous.bytesSent) * 8 / elapsedSeconds / 1000) : 0;
    lastVoiceStatsRef.current = { at: now, bytesReceived, bytesSent };

    const totalPackets = packetsReceived + packetsLost;
    const packetLossPercent = totalPackets > 0 ? Math.max(0, Math.min(100, packetsLost / totalPackets * 100)) : 0;
    const rttMs = Math.round(rttSeconds * 1000);
    const jitterMs = Math.round(jitterSeconds * 1000);
    const speaking = !micMutedRef.current && audioLevel > 0.018;
    const nextQuality = {
      label: voiceQualityLabel({ rttMs, jitterMs, packetLossPercent }),
      rttMs,
      jitterMs,
      packetLossPercent,
      inboundKbps,
      outboundKbps,
      usingRelay,
      speaking
    };
    const speakingChanged = voiceQualityRef.current.speaking !== speaking;
    setVoiceQualityState(nextQuality);
    if (speakingChanged) emitVoiceState({ speaking });
  }

  async function createPeerAndOffer(remoteSocketId, options = {}) {
    if (!voiceJoinedRef.current || !socketRef.current || !remoteSocketId || !voiceChannelIdRef.current) {
      return;
    }
    const peer = await getOrCreatePeer(remoteSocketId);
    applyVoiceSenderParameters(peer);
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
      emitVoiceState({ screen: true });
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
    emitVoiceState({ screen: false });
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
      const cameraStream = await requestCameraStream(clientSettings.cameraDeviceId);
      cameraStreamRef.current = cameraStream;
      const [videoTrack] = cameraStream.getVideoTracks();
      if (videoTrack) videoTrack.onended = () => stopCamera().catch(() => {});
      Object.values(peersRef.current).forEach((peer) => addStreamTracksToPeer(peer, cameraStream));
      setCameraEnabled(true);
      setVoiceStatus('Camera on');
      emitVoiceState({ camera: true });
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
    emitVoiceState({ camera: false });
    await renegotiatePeers();
  }

  function emitVoiceState(overrides = {}) {
    socketRef.current?.emit('voice-state', {
      channelId: Number(voiceChannelIdRef.current),
      muted: micMuted,
      camera: cameraEnabled,
      screen: screenSharing,
      speaking: false,
      handRaised: handRaisedRef.current,
      ...overrides
    });
  }

  function toggleCamera() {
    if (cameraEnabled || cameraStreamRef.current) {
      stopCamera().catch(() => setError('Could not stop camera'));
      return;
    }
    startCamera().catch(() => setError('Could not access the camera'));
  }

  function cleanupVoice({ emitLeave = true } = {}) {
    stopVoiceStats();
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
    handRaisedRef.current = false;
    setHandRaised(false);
    setVoiceJoined(false);
    setVoiceExpanded(false);
    setVoiceStatus('Voice idle');
    setParticipantVolumes({});
    setVoiceParticipants({});
    setRemoteStreams({});
  }

  async function handleJoinVoice(requestedVoiceChannelId) {
    const explicitVoiceChannelId =
      typeof requestedVoiceChannelId === 'string' || typeof requestedVoiceChannelId === 'number'
        ? String(requestedVoiceChannelId)
        : '';
    const joinChannelId = explicitVoiceChannelId || voiceChannelId;
    if (!joinChannelId) return setError('Choose a voice channel first');
    if (!navigator.mediaDevices?.getUserMedia) return setError('Voice is not supported in this browser');

    try {
      if (voiceJoined) {
        cleanupVoice();
        return;
      }

      setError('');
      setVoiceStatus('Requesting microphone...');
      let voiceInput = null;
      let microphoneError = null;
      try {
        voiceInput = await acquireVoiceInputStream();
      } catch (err) {
        microphoneError = err;
      }
      await refreshMediaDevices({ silent: true });

      rawLocalStreamRef.current = voiceInput?.rawStream || null;
      localStreamRef.current = voiceInput?.stream || new MediaStream();
      voiceAudioContextRef.current = voiceInput?.audioContext || null;
      if (String(joinChannelId) !== String(voiceChannelId)) setVoiceChannelId(String(joinChannelId));
      const joinedMuted = !voiceInput?.stream?.getAudioTracks?.().length;
      setMicMuted(joinedMuted);
      setVoiceJoined(true);
      setVoiceStatus(
        joinedMuted
          ? `Listening only. ${getMediaErrorMessage(microphoneError, 'Microphone is unavailable')}`
          : (noiseSuppressionEnabled ? 'Noise suppression active' : 'Voice connected')
      );
      startVoiceStats();
      socketRef.current?.emit('join-voice', { channelId: Number(joinChannelId) });
      window.setTimeout(() => emitVoiceState({ muted: joinedMuted }), 0);
    } catch (err) {
      cleanupVoice({ emitLeave: false });
      setError(getMediaErrorMessage(err, 'Could not access the microphone'));
      setVoiceStatus('Voice idle');
    }
  }

  async function toggleMicrophone() {
    if (!voiceJoinedRef.current) return;
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();

    const currentAudioTracks = new Set([
      ...localStreamRef.current.getAudioTracks(),
      ...(rawLocalStreamRef.current?.getAudioTracks?.() || [])
    ]);

    if (currentAudioTracks.size === 0) {
      try {
        setError('');
        setVoiceStatus('Requesting microphone...');
        const voiceInput = await acquireVoiceInputStream();
        rawLocalStreamRef.current = voiceInput.rawStream;
        localStreamRef.current = voiceInput.stream;
        voiceAudioContextRef.current = voiceInput.audioContext;
        Object.values(peersRef.current).forEach((peer) => addStreamTracksToPeer(peer, voiceInput.stream));
        setMicMuted(false);
        setVoiceStatus(noiseSuppressionEnabled ? 'Noise suppression active' : 'Microphone connected');
        emitVoiceState({ muted: false });
        await refreshMediaDevices({ silent: true });
        await renegotiatePeers();
      } catch (err) {
        setError(getMediaErrorMessage(err, 'Could not access the microphone'));
        setVoiceStatus('Listening only');
      }
      return;
    }

    const nextMuted = !micMuted;
    currentAudioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
    emitVoiceState({ muted: nextMuted });
  }

  function toggleRaisedHand() {
    if (!voiceJoinedRef.current) return;
    const nextRaised = !handRaised;
    handRaisedRef.current = nextRaised;
    setHandRaised(nextRaised);
    setVoiceStatus(nextRaised ? 'Hand raised' : 'Hand lowered');
    emitVoiceState({ handRaised: nextRaised });
  }

  async function testCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser');
      return;
    }

    try {
      setError('');
      setCameraTesting(true);
      const stream = await requestCameraStream(clientSettings.cameraDeviceId);
      await refreshMediaDevices();
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
    const bridge = getNativeBridge();
    const methodMap = {
      minimize: ['minimize', 'windowMinimize'],
      maximize: ['maximize', 'toggleMaximize', 'windowMaximize'],
      close: ['close', 'windowClose']
    };
    const method = methodMap[action]?.find((name) => typeof bridge?.[name] === 'function');
    if (method) bridge[method]();
  }

  const chatTitle =
    workspace === 'spaces'
      ? 'Spaces'
      : workspace === 'activity'
        ? 'Activity'
        : workspace === 'friends'
          ? 'Friends'
          : workspace === 'dm'
        ? (activeConversation?.user ? getDisplayName(activeConversation.user) : 'Direct messages')
        : workspace === 'stories'
          ? 'Stories'
          : activeTextChannel
            ? `# ${activeTextChannel.name}`
            : 'Server chat';
  const chatHeaderAvatarUser = workspace === 'dm' && activeConversation?.user ? activeConversation.user : user;
  const realtimeStatus = networkOnline ? socketStatus : 'offline';
  const realtimeLabel = SOCKET_STATUS_LABELS[realtimeStatus] || SOCKET_STATUS_LABELS.disconnected;
  const syncTime = lastRealtimeSync
    ? new Date(lastRealtimeSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const voiceStageParticipants = [
    {
      socketId: 'self',
      username: getDisplayName(user),
      user,
      muted: micMuted,
      handRaised,
      status: handRaised ? 'Hand raised' : screenSharing ? 'Sharing screen' : cameraEnabled ? 'Camera on' : micMuted ? 'Microphone muted' : 'Speaking ready'
    },
    ...Object.entries(voiceParticipants).map(([socketId, participant]) => ({
      socketId,
      username: participant.username || socketId.slice(0, 8),
      user: participant,
      muted: Boolean(participant.muted),
      handRaised: Boolean(participant.handRaised),
      status: participant.handRaised
        ? 'Hand raised'
        : participant.speaking
        ? 'Speaking'
        : participant.screen
          ? 'Sharing screen'
          : participant.camera || remoteStreams[socketId]?.getVideoTracks?.().length
            ? 'Video active'
            : 'Connected'
    }))
  ].sort((left, right) => Number(right.handRaised) - Number(left.handRaised));
  const spaceRole = String(guild?.membership?.role || 'MEMBER').toUpperCase();
  const userCanManageChannels = canManageChannels(user) || ['ADMIN', 'OWNER'].includes(spaceRole);
  const userCanModerateMessages = Boolean(user?.isAdmin) || ['ADMIN', 'OWNER'].includes(normalizeUserRole(user?.role)) || ['MODERATOR', 'ADMIN', 'OWNER'].includes(spaceRole);
  const visibleVoiceChannelForJoin = hasMobileFolderFilter
    ? (filteredVoiceChannels.find((channel) => String(channel.id) === String(voiceChannelId)) || filteredVoiceChannels[0] || null)
    : activeVoiceChannel;

  function selectMobileFolder(folderId) {
    const nextFolderId = String(folderId || '');
    const nextFolder = customFolders.find((folder) => String(folder.id) === nextFolderId);
    const nextVoiceChannel = nextFolder
      ? voiceChannels.find((channel) => uniqueStringList(nextFolder.channelIds).includes(String(channel.id)))
      : null;
    setActiveMobileFolderId((prev) => (String(prev) === nextFolderId ? '' : nextFolderId));
    if (nextVoiceChannel && !uniqueStringList(nextFolder.channelIds).includes(String(voiceChannelId))) {
      setVoiceChannelId(String(nextVoiceChannel.id));
    }
    setMobileChatOpen(false);
  }

  if (!isAuthed) {
    if (!isAdminRoute) {
      return (
        <LandingPage
          mode={mode}
          setMode={setMode}
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          error={error}
          onSubmit={handleAuthSubmit}
        />
      );
    }

    return (
      <main className="auth-wrapper">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <span className="hero-badge brand-badge"><BrandLogo /> WebCord</span>
          <h1>{isAdminRoute ? 'WebCord Admin' : 'Discord-style chat for the web.'}</h1>
          <p className="muted">{isAdminRoute ? 'Sign in with an allowed admin username.' : 'Login to test live channels, DMs, friends, and voice.'}</p>
          {!isAdminRoute ? (
            <div className="auth-switch">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
            </div>
          ) : null}
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">{isAdminRoute || mode === 'login' ? 'Enter WebCord' : 'Create account'}</button>
        </form>
      </main>
    );
  }

  if (isAdminRoute) {
    return (
      <AdminPanel
        user={user}
        overview={adminOverview}
        status={adminStatus}
        error={adminError}
        roleUpdating={adminRoleUpdating}
        moderationUpdating={adminModerationUpdating}
        downloadUploading={adminDownloadUploading}
        onRefresh={loadAdminOverview}
        onOpenApp={() => {
          setWorkspace('server');
          navigateTo('/');
        }}
        onLogout={handleLogout}
        onChangeUserRole={changeAdminUserRole}
        onModerateUser={applyAdminModeration}
        onUpdateReport={updateAdminReport}
        onResolveClientError={resolveAdminClientError}
        onUploadDownload={uploadAdminDownload}
        onDeleteDownload={deleteAdminDownload}
      />
    );
  }

  return (
    <IconFamilyContext.Provider value={theme.iconFamily}>
    <>
      <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(e) => uploadProfileAsset('avatar', e.target.files?.[0])} />
      <input ref={bannerInputRef} type="file" accept="image/*" hidden onChange={(e) => uploadProfileAsset('banner', e.target.files?.[0])} />
      <input ref={trackInputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm" hidden onChange={(e) => uploadProfileTrack(e.target.files?.[0])} />
      <input ref={storyInputRef} type="file" accept="image/*,video/*,.webp,.avif,.mp4,.webm,.mov,.m4v" hidden onChange={(e) => selectStoryMedia(e.target.files?.[0])} />
      <input ref={storyMusicInputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm" hidden onChange={(e) => selectStoryMusic(e.target.files?.[0])} />
      <input ref={wallpaperInputRef} type="file" accept="image/*" hidden onChange={(e) => uploadChatWallpaper(e.target.files?.[0])} />
      {isDesktopShell ? <DesktopTitleBar user={user} onOpenSettings={() => setShowSettingsModal(true)} onWindowAction={handleWindowAction} /> : null}
      <Suspense fallback={null}>
        <ReleaseBanner apiUrl={API_URL} version={APP_VERSION} platform={/Android/i.test(navigator.userAgent) ? 'android' : 'windows'} />
      </Suspense>
      <div className={mobileSidebarOpen ? 'mobile-overlay active' : 'mobile-overlay'} onClick={() => setMobileSidebarOpen(false)} />

      <main
        ref={appShellRef}
        className={`${isMobile && mobileChatOpen ? 'app-shell mobile-chat-open' : 'app-shell'}${isDesktopShell ? ' desktop-shell' : ''}${voiceExpanded && voiceJoined ? ' voice-expanded-mode' : ''}`}
        data-mobile-surface={isMobile && mobileChatOpen && ['server', 'dm'].includes(workspace) ? 'chat' : 'workspace'}
      >
        <div className="theme-ambient" aria-hidden="true" />
        <aside className="rail" aria-label="Основная навигация">
          <div className="rail-brand" aria-label="WebCord">
            <BrandLogo className="rail-logo" />
          </div>
          {[
            ['spaces', 'zap', 'Spaces'],
            ['server', 'menu', 'Чаты'],
            ['friends', 'smile', 'Контакты'],
            ['dm', 'browser', 'Личные'],
            ['activity', 'wave', 'События'],
            ['stories', 'story', 'Сторис']
          ].map(([item, icon, label]) => (
            <button
              key={item}
              data-workspace={item}
              className={workspace === item ? 'rail-btn active' : 'rail-btn'}
              type="button"
              title={label}
              aria-label={label}
              aria-current={workspace === item ? 'page' : undefined}
              onClick={() => {
                setWorkspace(item);
                setMobileSidebarOpen(false);
                if (isMobile) setMobileChatOpen(['spaces', 'activity', 'stories', 'friends'].includes(item));
              }}
            >
              <span>{icon === 'brand' ? <BrandLogo className="rail-logo" /> : <AppIcon name={icon} size={22} />}</span>
              <em>{label}</em>
              {item === 'activity' && activityUnreadCount > 0 ? <b className="rail-badge">{Math.min(99, activityUnreadCount)}</b> : null}
            </button>
          ))}
          <div className="rail-spacer" />
          <button
            className="rail-profile"
            type="button"
            title="Profile"
            aria-label="Profile"
            onClick={() => {
              setSettingsSection('profile');
              setShowSettingsModal(true);
            }}
          >
            <UserAvatar user={user} />
          </button>
          <button
            className="rail-btn rail-settings"
            type="button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setShowSettingsModal(true)}
          >
            <AppIcon name="settings" size={21} />
          </button>
        </aside>

        <aside
          className={mobileSidebarOpen ? 'sidebar mobile-open' : 'sidebar'}
          data-sidebar-filter={sidebarFilter}
        >
          <MobileHomePanel
            title={guild?.name || 'Обновление'}
            user={user}
            stories={stories}
            uploading={storyUploading}
            activeFolder={activeMobileFolderId}
            customFolders={customFolders}
            search={mobileChatSearch}
            onCreateStory={openStoryComposer}
            onOpenStory={(story) => openStory(story)}
            onFolderChange={selectMobileFolder}
            onSearchChange={(value) => {
              setMobileChatSearch(value);
              if (workspace === 'dm') setDmSearch(value);
            }}
            onOpenSettings={() => { setSettingsSection('account'); setShowSettingsModal(true); }}
          />

          {!isMobile ? (
            <>
              <label className="desktop-sidebar-search">
                <AppIcon name="search" size={17} />
                <input
                  value={workspace === 'dm' ? dmSearch : mobileChatSearch}
                  onChange={(event) => {
                    if (workspace === 'dm') setDmSearch(event.target.value);
                    else setMobileChatSearch(event.target.value);
                  }}
                  placeholder="Filter current list · Ctrl K global"
                  aria-label="Search chats and channels"
                />
              </label>
              {workspace === 'server' ? (
                <div className="sidebar-filter-tabs" role="tablist" aria-label="Conversation filter">
                  {[
                    ['all', 'All'],
                    ['channels', 'Channels'],
                    ['directs', 'Directs'],
                    ['unread', 'Unread'],
                    ['archived', 'Archive']
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={sidebarFilter === id ? 'active' : ''}
                      type="button"
                      role="tab"
                      aria-selected={sidebarFilter === id}
                      onClick={() => setSidebarFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="profile-card" style={getProfileBannerStyle(user)}>
            <div className="profile-card-overlay">
              <UserAvatar user={user} />
              <div className="profile-copy">
                <strong>{getDisplayName(user)}</strong>
                <span className="profile-username">{getUsernameTag(user)}</span>
                <p className="profile-status-line">{user?.statusText || 'Online'}</p>
                {user?.favoriteTrack ? <p className="profile-track-inline">{user.favoriteTrack}</p> : null}
              </div>
              <button className="ghost-btn" type="button" onClick={() => { setSettingsSection('profile'); setShowSettingsModal(true); }}>Edit profile</button>
            </div>
          </div>

          <div className="sidebar-top guild-cover" style={getGuildCoverStyle(guild)}>
            <div>
              <span className="hero-badge brand-badge"><BrandLogo /> Live Workspace</span>
              <h2>{guild?.name || 'WebCord'}</h2>
              <p className="muted">{guild?.description || guild?.name || 'Workspace'} - {getDisplayName(user)}</p>
            </div>
            <button className="icon-btn" type="button" title="Appearance" aria-label="Appearance" onClick={() => { setSettingsSection('appearance'); setShowSettingsModal(true); }}><AppIcon name="settings" /></button>
          </div>

          {workspace === 'server' ? (
            <div className="stack">
              <section className="sidebar-card channel-sections">
                <p className="section-label">Чаты</p>
                {filteredTextChannels.length === 0 ? <p className="muted empty-copy">No text channels yet.</p> : filteredTextChannels.map((channel) => <button key={channel.id} className={String(channel.id) === String(channelId) ? 'channel-btn active' : 'channel-btn'} type="button" onClick={() => selectTextChannel(channel.id)}><span className="channel-icon"><AppIcon name="hash" size={16} /></span><span>{channel.name}</span></button>)}
                <p className="section-label">Голосовые</p>
                {filteredVoiceChannels.length === 0 ? <p className="muted empty-copy">No voice channels yet.</p> : filteredVoiceChannels.map((channel) => <button key={channel.id} className={String(channel.id) === String(voiceChannelId) ? 'channel-btn active' : 'channel-btn'} type="button" onClick={() => selectVoiceChannel(channel.id)}><span className="channel-icon"><AppIcon name="wave" size={16} /></span><span>{channel.name}</span></button>)}
                {selectedMobileFolder ? (
                  <>
                    <p className="section-label">Friends in folder</p>
                    {filteredFriends.length === 0 ? <p className="muted empty-copy">No friends in this folder.</p> : filteredFriends.map((friend) => <button key={friend.id} className="channel-btn conversation-btn" type="button" onClick={() => openConversation(friend.user.id)}><strong>{getDisplayName(friend.user)}</strong><span>{getUsernameTag(friend.user)}</span></button>)}
                  </>
                ) : null}
              </section>
              <section className="sidebar-card direct-sections">
                <p className="section-label">Личные сообщения</p>
                {social.conversations.length === 0 ? (
                  <p className="muted empty-copy">Your direct conversations will appear here.</p>
                ) : filteredConversations.slice(0, 8).map((conversation) => (
                  <ChatListRow
                    key={conversation.id}
                    conversation={conversation}
                    preference={getChatPreference(`dm:${conversation.id}`)}
                    draft={chatDrafts[`dm:${conversation.id}`]}
                    selected={workspace === 'dm' && String(conversation.id) === String(dmConversationId)}
                    unread={Boolean(conversation.unreadCount)}
                    onSelect={() => selectConversation(conversation.id)}
                    onToggle={(field) => toggleConversationPreference(conversation.id, field)}
                  />
                ))}
              </section>
              <section className="sidebar-card create-channel-card channel-management">
                <p className="section-label">Create channel</p>
                {userCanManageChannels ? (
                  <form className="channel-form" onSubmit={handleCreateChannel}>
                    <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="New channel name" />
                    <div className="channel-actions-row">
                      <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}>
                        <option value="TEXT">TEXT</option>
                        <option value="VOICE">VOICE</option>
                      </select>
                      <button type="submit"><AppIcon name="plus" size={16} />Create</button>
                    </div>
                  </form>
                ) : (
                  <p className="muted empty-copy">Only admins can create channels.</p>
                )}
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
                {incomingRequests.length === 0 ? <p className="muted">No pending invites.</p> : incomingRequests.map((request) => <div key={request.id} className="friend-row"><div className="friend-identity"><strong>{getDisplayName(request.user)}</strong><span>{getUsernameTag(request.user)}</span></div><div className="inline-actions"><button type="button" onClick={() => handleFriendRequest(request.id, 'ACCEPT')}>Accept</button><button className="ghost-btn" type="button" onClick={() => handleFriendRequest(request.id, 'DECLINE')}>Decline</button></div></div>)}
              </section>
              <section className="sidebar-card">
                <p className="section-label">Outgoing requests</p>
                {outgoingRequests.length === 0 ? <p className="muted">Nothing pending.</p> : outgoingRequests.map((request) => <div key={request.id} className="friend-row compact"><div className="friend-identity"><strong>{getDisplayName(request.user)}</strong><span>{getUsernameTag(request.user)}</span></div><span className="request-pill">Pending</span></div>)}
              </section>
            </div>
          ) : null}

          {workspace === 'dm' ? (
            <div className="stack">
              <section className="sidebar-card">
                <p className="section-label">Direct messages</p>
                <input value={isMobile ? mobileChatSearch : dmSearch} onChange={(e) => (isMobile ? setMobileChatSearch(e.target.value) : setDmSearch(e.target.value))} placeholder="Search DMs" />
                {social.conversations.length === 0 ? <p className="muted">Accept a friend request to unlock DMs.</p> : filteredConversations.map((conversation) => <ChatListRow key={conversation.id} conversation={conversation} preference={getChatPreference(`dm:${conversation.id}`)} draft={chatDrafts[`dm:${conversation.id}`]} selected={String(conversation.id) === String(dmConversationId)} unread={Boolean(conversation.unreadCount)} onSelect={() => selectConversation(conversation.id)} onToggle={(field) => toggleConversationPreference(conversation.id, field)} />)}
                {social.conversations.length > 0 && filteredConversations.length === 0 ? <p className="muted">No DMs match this search.</p> : null}
              </section>
              <section className="sidebar-card">
                <p className="section-label">Friends</p>
                {filteredFriends.length === 0 ? <p className="muted">{selectedMobileFolder ? 'No friends in this folder.' : 'No friends yet.'}</p> : filteredFriends.map((friend) => <div key={friend.id} className="friend-row"><div className="friend-identity"><strong>{getDisplayName(friend.user)}</strong><span>{getUsernameTag(friend.user)}</span></div><button type="button" onClick={() => openConversation(friend.user.id)}>Open DM</button></div>)}
              </section>
            </div>
          ) : null}

          {workspace === 'spaces' ? (
            <div className="stack workspace-sidebar-summary">
              <section className="sidebar-card">
                <p className="section-label">Spaces</p>
                <strong>Community overview</strong>
                <p className="muted">Events, decisions and scheduled messages are open in the main panel.</p>
              </section>
            </div>
          ) : workspace === 'activity' ? (
            <div className="stack workspace-sidebar-summary">
              <section className="sidebar-card">
                <p className="section-label">Activity</p>
                <strong>Updates that need you</strong>
                <p className="muted">Mentions, replies, calls and event reminders.</p>
              </section>
            </div>
          ) : workspace === 'stories' ? (
            <div className="stack">
              <section className="sidebar-card">
                <p className="section-label">Stories</p>
                <button type="button" onClick={openStoryComposer}><AppIcon name="plus" size={16} />Add story</button>
                <p className="muted empty-copy">{stories.length} active stories from you and friends.</p>
              </section>
              <section className="sidebar-card">
                <p className="section-label">Unseen</p>
                {stories.filter((story) => !story.viewed).length === 0 ? <p className="muted">Everything is viewed.</p> : stories.filter((story) => !story.viewed).slice(0, 5).map((story) => (
                  <button key={story.id} className="channel-btn conversation-btn" type="button" onClick={() => openStory(story)}>
                    <strong>{getDisplayName(story.author)}</strong>
                    <span>{story.caption || 'Story update'}</span>
                  </button>
                ))}
              </section>
            </div>
          ) : null}

          <div className="sidebar-bottom">
            <button type="button" disabled={!voiceJoined && !visibleVoiceChannelForJoin} onClick={() => handleJoinVoice(visibleVoiceChannelForJoin?.id)}>
              <AppIcon name={voiceJoined ? 'phoneOff' : 'phone'} size={16} />
              {voiceJoined ? 'Leave voice' : visibleVoiceChannelForJoin ? `Join voice: ${visibleVoiceChannelForJoin.name}` : 'No voice in folder'}
            </button>
            {voiceJoined ? <button type="button" onClick={toggleMicrophone}><AppIcon name={micMuted ? 'micOff' : 'mic'} size={16} />{micMuted ? 'Unmute mic' : 'Mute mic'}</button> : null}
            {voiceJoined ? <button className={handRaised ? 'active' : ''} type="button" aria-pressed={handRaised} onClick={toggleRaisedHand}><AppIcon name="hand" size={16} />{handRaised ? 'Lower hand' : 'Raise hand'}</button> : null}
            {voiceJoined ? <button type="button" onClick={() => (screenSharing ? stopScreenShare() : startScreenShare())}><AppIcon name="screen" size={16} />{screenSharing ? 'Stop stream' : 'Start stream'}</button> : null}
            {voiceJoined ? <button type="button" onClick={toggleCamera}><AppIcon name={cameraEnabled ? 'cameraOff' : 'camera'} size={16} />{cameraEnabled ? 'Camera off' : 'Camera on'}</button> : null}
            <button className="ghost-btn" type="button" disabled={voiceJoined} onClick={() => setNoiseSuppressionEnabled((prev) => !prev)}>Noise suppression: {noiseSuppressionEnabled ? 'On' : 'Off'}</button>
            <p className="voice-status">{voiceStatus}</p>
            {voiceJoined ? <VoiceQualityPill quality={voiceQuality} /> : null}
            <button className="danger" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </aside>

        <section className={`${voiceJoined ? 'chat-panel voice-mode' : 'chat-panel'}${voiceExpanded && voiceJoined ? ' voice-expanded' : ''}`}>
          <header className="chat-header">
            <div className="chat-header-main">
              {isMobile ? (
                <button className="mobile-sidebar-toggle round" type="button" aria-label="Back to chats" onClick={() => setMobileChatOpen(false)}>
                  <AppIcon name="arrowLeft" size={22} />
                </button>
              ) : (
                <button className="mobile-sidebar-toggle" type="button" onClick={() => setMobileSidebarOpen((prev) => !prev)}>
                  <AppIcon name="menu" size={16} />Menu
                </button>
              )}
              {isMobile ? <UserAvatar user={chatHeaderAvatarUser} className="chat-title-avatar" /> : null}
              <button className="chat-title-copy chat-title-button" type="button" onClick={() => setChatInfoOpen(true)}>
                <strong>{chatTitle}</strong>
                <p className="muted">{workspace === 'friends' ? 'Requests, friends, and direct conversations.' : workspace === 'dm' ? (activeConversation?.user?.statusText || 'в сети') : workspace === 'stories' ? 'Image and video stories expire after 24 hours.' : 'Server chat synced through the backend.'}</p>
              </button>
            </div>
            <div className="header-badges">
              {!isMobile ? (
                <div className="concept-header-actions">
                  <button
                    className="icon-btn"
                    type="button"
                    title="Search"
                    aria-label="Search"
                    aria-expanded={messageSearchOpen}
                    onClick={() => setMessageSearchOpen((value) => !value)}
                  >
                    <AppIcon name="search" />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Pinned messages"
                    aria-label="Pinned messages"
                    aria-expanded={pinnedPanelOpen}
                    onClick={() => setPinnedPanelOpen((value) => !value)}
                  >
                    <AppIcon name="pin" />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Saved messages"
                    aria-label="Saved messages"
                    aria-expanded={savedMessagesOpen}
                    onClick={() => refreshSavedMessages({ open: true })}
                  >
                    <AppIcon name="bookmark" />
                  </button>
                  <button className="icon-btn" type="button" title="Chat info" aria-label="Chat info" onClick={() => setChatInfoOpen((value) => !value)}>
                    <AppIcon name="browser" />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title={voiceJoined ? 'Leave voice' : 'Join voice'}
                    aria-label={voiceJoined ? 'Leave voice' : 'Join voice'}
                    disabled={!voiceJoined && !visibleVoiceChannelForJoin}
                    onClick={() => handleJoinVoice(visibleVoiceChannelForJoin?.id)}
                  >
                    <AppIcon name={voiceJoined ? 'phoneOff' : 'phone'} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Theme Studio"
                    aria-label="Theme Studio"
                    aria-expanded={showThemeModal}
                    onClick={() => setShowThemeModal(true)}
                  >
                    <AppIcon name="theme" />
                  </button>
                </div>
              ) : null}
              <span className={`live-pill realtime-pill ${realtimeStatus}`}>
                {realtimeLabel}{syncTime && realtimeStatus === 'connected' ? ` ${syncTime}` : ''}
              </span>
              <span className="live-pill">{social.friends.length} friends</span>
              {workspace === 'stories' ? <span className="live-pill">{stories.filter((story) => !story.viewed).length} unseen</span> : null}
              {voiceJoined ? <span className="live-pill">Voice active</span> : null}
              {isMobile ? (
                <button
                  className="icon-btn mobile-chat-more"
                  type="button"
                  aria-label="Chat menu"
                  title="Chat menu"
                  onClick={() => setMobileSidebarOpen((prev) => !prev)}
                  aria-expanded={mobileSidebarOpen}
                >
                  <AppIcon name="more" />
                </button>
              ) : null}
            </div>
          </header>
          {realtimeStatus !== 'connected' ? (
            <div className={`realtime-banner ${realtimeStatus}`}>
              {realtimeStatus === 'offline'
                ? 'Network is offline. Messages will refresh when connection returns.'
                : 'Realtime connection is recovering. WebCord keeps polling until live sync resumes.'}
            </div>
          ) : null}
          {messageSearchOpen ? (
            <div className="in-chat-search">
              <AppIcon name="search" size={17} />
              <input
                autoFocus
                value={messageSearchQuery}
                onChange={(event) => setMessageSearchQuery(event.target.value)}
                placeholder="Search this chat"
                aria-label="Search messages in this chat"
              />
              {messageSearchLoading ? <span className="search-spinner" aria-label="Searching" /> : null}
              <span>{messageSearchQuery.trim() ? `${messageSearchResults.length} found` : 'Type to search'}</span>
              <button className="icon-btn" type="button" aria-label="Close search" onClick={() => setMessageSearchOpen(false)}><AppIcon name="close" /></button>
            </div>
          ) : null}
          {pinnedPanelOpen ? (
            <aside className="pinned-messages-panel" aria-label="Pinned messages">
              <div className="pinned-panel-header">
                <strong>Pinned messages</strong>
                <button className="icon-btn" type="button" aria-label="Close pinned messages" onClick={() => setPinnedPanelOpen(false)}><AppIcon name="close" /></button>
              </div>
              {pinnedMessages.length === 0 ? <p className="muted">Nothing pinned in this chat.</p> : pinnedMessages.map((message) => (
                <button type="button" key={message.id} onClick={() => { setPinnedPanelOpen(false); scrollToMessage(message); }}>
                  <strong>{getDisplayName(message.author)}</strong>
                  <span>{message.content || message.attachmentName || 'Attachment'}</span>
                </button>
              ))}
            </aside>
          ) : null}
          <ChatInfoPanel
            open={chatInfoOpen && (workspace === 'server' || workspace === 'dm')}
            conversation={workspace === 'dm' ? activeConversation : null}
            channel={workspace === 'server' ? activeTextChannel : null}
            messages={messages}
            mediaItems={chatMedia}
            mediaLoading={chatMediaLoading}
            mediaHasMore={Boolean(chatMediaCursor)}
            pinnedMessages={pinnedMessages}
            muted={Boolean(getChatPreference(activeChatScopeKey).muted)}
            onToggleMute={() => updateChatPreference(activeChatScopeKey, { muted: !getChatPreference(activeChatScopeKey).muted })}
            onLoadMoreMedia={() => loadChatMedia()}
            onOpenMessage={(message) => {
              setChatInfoOpen(false);
              if (/^(IMAGE|VIDEO|CIRCLE_VIDEO|AUDIO)$/i.test(message.attachmentType || '')) setViewedMedia(message);
              else scrollToMessage(message);
            }}
            onClose={() => setChatInfoOpen(false)}
          />
          <ThreadPanel
            thread={activeThread}
            loading={threadLoading}
            currentUserId={user?.id}
            workspace={workspace}
            onClose={() => setActiveThread(null)}
            onReply={(root) => {
              setActiveThread(null);
              beginReply(root);
              window.setTimeout(() => composerInputRef.current?.focus(), 40);
            }}
            onPollVote={voteInPoll}
          />

          {voiceJoined ? (
            <VoiceStage
              activeVoiceChannel={activeVoiceChannel}
              localScreenStream={screenSharing ? screenStreamRef.current : null}
              localCameraStream={cameraEnabled ? cameraStreamRef.current : null}
              noiseSuppressionEnabled={noiseSuppressionEnabled}
              onLeave={handleJoinVoice}
              onToggleMic={toggleMicrophone}
              onToggleHand={toggleRaisedHand}
              onToggleScreen={() => (screenSharing ? stopScreenShare() : startScreenShare())}
              onToggleCamera={toggleCamera}
              onToggleExpanded={() => setVoiceExpanded((prev) => !prev)}
              micMuted={micMuted}
              handRaised={handRaised}
              screenSharing={screenSharing}
              cameraEnabled={cameraEnabled}
              expanded={voiceExpanded}
              participants={voiceStageParticipants}
              remoteStreams={remoteStreams}
              voiceParticipants={voiceParticipants}
              voiceStatus={voiceStatus}
              voiceQuality={voiceQuality}
              participantVolumes={participantVolumes}
              onParticipantVolumeChange={updateParticipantVolume}
              onParticipantProfileOpen={(profile) => profile && setViewedProfile(profile)}
            />
          ) : null}

          {workspace === 'spaces' ? (
            <SpacesWorkspace
              token={token}
              user={user}
              onOpenChannel={() => {
                setWorkspace('server');
                if (isMobile) setMobileChatOpen(true);
              }}
            />
          ) : workspace === 'activity' ? (
            <ActivityCenter token={token} onNavigate={navigateFromActivity} />
          ) : workspace === 'stories' ? (
            <StoriesPanel
              stories={stories}
              user={user}
              loading={storiesLoading}
              uploading={storyUploading}
              onCreateStory={openStoryComposer}
              onOpenStory={(story) => openStory(story)}
              onRefresh={() => refreshStories().catch((err) => setError(err.message))}
            />
          ) : workspace === 'friends' ? (
            <div className="dashboard-grid">
              <section className="dashboard-card">
                <p className="section-label">Friends</p>
                {social.friends.length === 0 ? <p className="muted">Your friend list is empty.</p> : social.friends.map((friend) => <div key={friend.id} className="friend-row"><div className="friend-identity"><strong>{getDisplayName(friend.user)}</strong><span>{getUsernameTag(friend.user)}</span></div><button type="button" onClick={() => openConversation(friend.user.id)}>Message</button></div>)}
              </section>
              <section className="dashboard-card">
                <p className="section-label">Direct conversations</p>
                {social.conversations.length === 0 ? <p className="muted">No conversations yet.</p> : social.conversations.map((conversation) => <button key={conversation.id} className="channel-btn conversation-btn" type="button" onClick={() => selectConversation(conversation.id)}><strong>{getConversationTitle(conversation)}</strong><span>{getConversationSubtitle(conversation)} - {conversation.lastMessage?.content || conversation.lastMessage?.attachmentName || 'Conversation ready'}</span></button>)}
              </section>
            </div>
          ) : (
            <>
              {selectedMessageIds.length > 0 ? (
                <div className="message-selection-toolbar" role="toolbar" aria-label="Selected message actions">
                  <strong>{selectedMessageIds.length} selected</strong>
                  <button type="button" onClick={() => beginForwardMessages(messages.find((message) => selectedMessageIds.includes(String(message.id))))}>Forward</button>
                  <button className="danger" type="button" onClick={deleteSelectedMessages}>Delete</button>
                  <button className="icon-btn" type="button" aria-label="Clear selection" onClick={() => setSelectedMessageIds([])}><AppIcon name="close" /></button>
                </div>
              ) : null}
              <div className="messages" ref={messagesRef} style={chatWallpaperStyle} onScroll={handleMessagesScroll}>
                {visibleMessages.length === 0 ? <div className="empty-state"><h3>{messageSearchQuery.trim() ? 'No matching messages' : workspace === 'dm' ? 'No direct messages yet' : 'No messages yet'}</h3><p className="muted">{messageSearchQuery.trim() ? 'Try another word or phrase.' : workspace === 'dm' ? 'This thread is ready.' : 'Start the conversation in this channel.'}</p></div> : visibleMessages.map((message, index) => {
                  const previous = index > 0 ? visibleMessages[index - 1] : null;
                  const next = index < visibleMessages.length - 1 ? visibleMessages[index + 1] : null;
                  const grouped = Boolean(
                    previous &&
                    String(previous.author?.id) === String(message.author?.id) &&
                    Math.abs(new Date(message.createdAt) - new Date(previous.createdAt)) < 5 * 60 * 1000
                  );
                  const groupedWithNext = Boolean(
                    next &&
                    String(next.author?.id) === String(message.author?.id) &&
                    Math.abs(new Date(next.createdAt) - new Date(message.createdAt)) < 5 * 60 * 1000
                  );
                  const showDateDivider = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                  return <MessageItem key={message.id} message={message} workspace={workspace} currentUserId={user?.id} grouped={grouped} groupedWithNext={groupedWithNext} showDateDivider={showDateDivider} showUnreadDivider={String(unreadAnchorId) === String(message.id)} selected={selectedMessageIds.includes(String(message.id))} highlighted={String(highlightedMessageId) === String(message.id)} canModerateMessages={userCanModerateMessages} onAvatarClick={setViewedProfile} onReply={beginReply} onNavigateToReply={scrollToMessage} onEdit={beginEdit} onDelete={deleteMessage} onReport={openReportForMessage} onOpenMedia={setViewedMedia} onToggleReaction={toggleMessageReaction} onPollVote={voteInPoll} onOpenThread={openMessageThread} onCopy={copyMessage} onShare={shareMessage} onPin={toggleMessagePin} onBookmark={toggleMessageBookmark} onHistory={openMessageHistory} onForward={beginForwardMessages} onSelect={toggleMessageSelection} />;
                })}
                <div ref={endRef} />
              </div>
              {showScrollToLatest ? (
                <button className="scroll-to-latest" type="button" aria-label="Scroll to latest messages" title="Scroll to latest messages" onClick={scrollToLatestMessages}>
                  <AppIcon name="arrowLeft" size={20} />
                  {unreadAnchorId ? <span>New</span> : null}
                </button>
              ) : null}
              <form className={`message-form composer composer-${composerPhase}`} onSubmit={sendMessage}>
                {replyTarget || editingMessage ? (
                  <div className="composer-context">
                    <span>{editingMessage ? 'Editing message' : `Replying to ${getDisplayName(replyTarget?.author)}`}</span>
                    <strong>{editingMessage?.content || replyTarget?.content || replyTarget?.attachmentName || 'Attachment'}</strong>
                    <button className="icon-btn" type="button" aria-label="Cancel" title="Cancel" onClick={cancelComposerContext}><AppIcon name="close" /></button>
                  </div>
                ) : null}
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.webm,.ogg,.mp3,.m4a,.wav,.pdf,.zip,.doc,.docx,.txt" onChange={handleFileSelect} hidden />
                <button className="icon-btn composer-btn" type="button" aria-label="Attach file" title="Attach file" onClick={() => fileInputRef.current?.click()}><AppIcon name="paperclip" /></button>
                <button
                  className={voiceRecording ? 'icon-btn composer-btn recording' : 'icon-btn composer-btn'}
                  type="button"
                  title={voiceRecording ? 'Stop voice recording' : 'Record voice message'}
                  aria-label={voiceRecording ? 'Stop voice recording' : 'Record voice message'}
                  disabled={uploading || circleRecording || (!!pendingAttachment && !voiceRecording) || Boolean(editingMessage)}
                  onClick={() => (voiceRecording ? cleanupMessageRecording() : startMessageRecording('voice'))}
                >
                  <AppIcon name={voiceRecording ? 'stop' : 'mic'} />
                </button>
                <button
                  className={circleRecording ? 'icon-btn composer-btn recording' : 'icon-btn composer-btn'}
                  type="button"
                  title={circleRecording ? 'Stop video circle' : 'Record video circle'}
                  aria-label={circleRecording ? 'Stop video circle' : 'Record video circle'}
                  disabled={uploading || voiceRecording || (!!pendingAttachment && !circleRecording) || Boolean(editingMessage)}
                  onClick={() => (circleRecording ? cleanupMessageRecording() : startMessageRecording('circle'))}
                >
                  <AppIcon name={circleRecording ? 'stop' : 'camera'} />
                </button>
                <div className="composer-tools-wrapper">
                  <button className="icon-btn composer-btn" type="button" aria-label="Formatting tools" title="Formatting tools" onClick={() => setShowComposerTools((value) => !value)}><AppIcon name="more" /></button>
                  {showComposerTools ? (
                    <div className="composer-tools-popover" role="toolbar" aria-label="Message formatting">
                      <button type="button" onClick={() => { setPollComposerOpen(true); setShowComposerTools(false); }}><AppIcon name="wave" size={14} /> Poll</button>
                      <button type="button" disabled={!newMessage.trim()} onClick={() => { setScheduleComposerOpen(true); setShowComposerTools(false); }}><AppIcon name="story" size={14} /> Schedule</button>
                      <button className={silentMessage ? 'active' : ''} type="button" onClick={() => setSilentMessage((value) => !value)}><AppIcon name={silentMessage ? 'volumeOff' : 'volume'} size={14} /> {silentMessage ? 'Silent on' : 'Send silently'}</button>
                      <span className="composer-tools-divider" />
                      <button type="button" onClick={() => formatComposerSelection('**')}>Bold</button>
                      <button type="button" onClick={() => formatComposerSelection('`')}>Code</button>
                      <button type="button" onClick={() => formatComposerSelection('||')}>Spoiler</button>
                      <button type="button" onClick={() => formatComposerSelection('> ', '')}>Quote</button>
                    </div>
                  ) : null}
                </div>
                <div className="emoji-wrapper">
                  <button className="icon-btn composer-btn" type="button" aria-label="Emoji" title="Emoji" onClick={() => setShowEmojiPicker((prev) => !prev)}><AppIcon name="smile" /></button>
                  {showEmojiPicker ? (
                    <div className="emoji-popover">
                      <Suspense fallback={<div className="emoji-loading">Loading...</div>}>
                        <EmojiPicker theme="dark" onEmojiSelect={(emoji) => { setNewMessage((prev) => `${prev}${emoji.native}`); setShowEmojiPicker(false); }} />
                      </Suspense>
                    </div>
                  ) : null}
                </div>
                <textarea
                  ref={composerInputRef}
                  rows={1}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  aria-label="Message"
                  placeholder={editingMessage ? 'Edit your message' : isMobile ? 'Message' : workspace === 'dm' ? 'Message your friend' : 'Send a message'}
                />
                <span className="composer-phase" aria-live="polite">
                  {composerPhase === 'sending' ? 'Sending' : composerPhase === 'saving' ? 'Saving' : composerPhase === 'sent' ? 'Sent' : composerPhase === 'saved' ? 'Saved' : composerPhase === 'error' ? 'Try again' : ''}
                </span>
                <button className={silentMessage ? 'composer-send silent' : 'composer-send'} type="submit" title={silentMessage ? 'Send without push notification' : 'Send'} disabled={uploading || composerPhase === 'sending' || composerPhase === 'saving' || (!newMessage.trim() && !pendingAttachment && pendingAttachmentQueue.length === 0)}><AppIcon name={composerPhase === 'sending' || composerPhase === 'saving' ? 'wave' : silentMessage ? 'volumeOff' : 'send'} size={16} />{editingMessage ? 'Save' : silentMessage ? 'Silent' : 'Send'}</button>
              </form>
            </>
          )}

          <div className="panel-footer">
            {pendingAttachment ? (
              <div className="attachment-preview">
                {getAttachmentKind({ attachmentType: pendingAttachment.type, attachmentName: pendingAttachment.name, attachmentUrl: pendingAttachment.url }) === 'IMAGE'
                  ? <img src={getAttachmentUrl(pendingAttachment.url)} alt={pendingAttachment.name || 'Attachment preview'} />
                  : null}
                {['VIDEO', 'CIRCLE_VIDEO'].includes(getAttachmentKind({ attachmentType: pendingAttachment.type, attachmentName: pendingAttachment.name, attachmentUrl: pendingAttachment.url }))
                  ? <video src={getAttachmentUrl(pendingAttachment.url)} muted playsInline controls />
                  : null}
                <span className="attachment-dot">{getAttachmentBadge(getAttachmentKind({ attachmentType: pendingAttachment.type, attachmentName: pendingAttachment.name, attachmentUrl: pendingAttachment.url }))}</span>
                <p className="muted">Attached: {pendingAttachment.name}{pendingAttachmentQueue.length ? ` +${pendingAttachmentQueue.length}` : ''}</p>
                <button className="icon-btn" type="button" aria-label="Remove attachments" title="Remove attachments" onClick={() => { setPendingAttachment(null); setPendingAttachmentQueue([]); }}><AppIcon name="close" /></button>
              </div>
            ) : null}
            {voiceRecording ? (
              <div className="recording-preview">
                <span className="recording-dot" />
                <strong>Recording voice</strong>
                <span>{formatShortDuration(recordingElapsed)}</span>
                <button className="ghost-btn" type="button" onClick={() => cleanupMessageRecording({ cancel: true })}>Cancel</button>
              </div>
            ) : null}
            {uploading ? (
              <div className="attachment-upload-progress" aria-live="polite">
                <progress max="100" value={uploadProgress || recordingUploadProgress || 0} />
                <span>Uploading {uploadProgress || recordingUploadProgress || 0}%</span>
                <button className="ghost-btn" type="button" onClick={cancelAttachmentUpload}>Cancel</button>
              </div>
            ) : null}
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
                    if (clientSettings.outputDeviceId && typeof node.setSinkId === 'function' && node.sinkId !== clientSettings.outputDeviceId) {
                      node.setSinkId(clientSettings.outputDeviceId).catch(() => {});
                    }
                    node.play?.().catch(() => {});
                  }}
                />
              ) : null
            ))}
          </div>
        </section>

        {circleRecording ? (
          <CircleRecordingOverlay
            stream={recordingPreviewStream}
            phase={recordingPhase}
            elapsed={recordingElapsed}
            countdown={recordingCountdown}
            uploadProgress={recordingUploadProgress}
            paused={recordingPaused}
            torchEnabled={circleTorchEnabled}
            facingMode={circleFacingMode}
            cameraSwitching={circleCameraSwitching}
            onCancel={() => cleanupMessageRecording({ cancel: true })}
            onSend={() => cleanupMessageRecording()}
            onPauseToggle={toggleMessageRecordingPause}
            onTorchToggle={toggleCircleTorch}
            onSwitchCamera={switchCircleCameraRealtime}
          />
        ) : null}

      </main>

      <ThemeModal
        open={showThemeModal}
        theme={theme}
        colorMode={colorMode}
        onClose={() => setShowThemeModal(false)}
        onThemeChange={setTheme}
        onColorModeChange={setColorMode}
        onReset={() => { setTheme(DEFAULT_THEME); setColorMode('system'); }}
      />

      <GlobalSearchPalette
        open={globalSearchOpen}
        query={globalSearchQuery}
        scope={globalSearchScope}
        loading={globalSearchLoading}
        results={globalSearchResults}
        onQueryChange={setGlobalSearchQuery}
        onScopeChange={setGlobalSearchScope}
        onOpenResult={openGlobalSearchResult}
        onClose={() => setGlobalSearchOpen(false)}
      />

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}>{toast.message}</div>)}
      </div>

      <SettingsModal
        open={showSettingsModal}
        activeSection={settingsSection}
        user={user}
        draft={profileDraft}
        theme={theme}
        colorMode={colorMode}
        inputVolume={inputVolume}
        outputVolume={outputVolume}
        micMuted={micMuted}
        cameraEnabled={cameraEnabled}
        cameraTesting={cameraTesting}
        cameraPreviewStream={cameraPreviewStream}
        noiseSuppressionEnabled={noiseSuppressionEnabled}
        mediaDevices={mediaDevices}
        clientSettings={clientSettings}
        channels={channels}
        friends={social.friends}
        customFolders={customFolders}
        newFolderName={newFolderName}
        avatarUploading={avatarUploading}
        bannerUploading={bannerUploading}
        trackUploading={trackUploading}
        onClose={() => { setShowSettingsModal(false); stopCameraPreview().catch(() => {}); }}
        onSectionChange={setSettingsSection}
        onDraftChange={setProfileDraft}
        onUploadAvatar={() => avatarInputRef.current?.click()}
        onUploadBanner={() => bannerInputRef.current?.click()}
        onUploadTrack={() => trackInputRef.current?.click()}
        onRemoveTrack={() => removeProfileTrack().catch((err) => setError(err.message))}
        onSaveProfile={() => saveProfile().catch((err) => setError(err.message))}
        onThemeChange={setTheme}
        onColorModeChange={setColorMode}
        onThemeReset={() => setTheme(DEFAULT_THEME)}
        onInputVolumeChange={setInputVolume}
        onOutputVolumeChange={setOutputVolume}
        onToggleMic={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onTestCamera={testCamera}
        onToggleCameraPreview={toggleCameraPreview}
        onClientSettingChange={updateClientSetting}
        onRefreshDevices={() => requestMediaDeviceAccess().catch((err) => reportError(err, 'Could not refresh devices'))}
        onToggleNotifications={() => toggleNotifications().catch((err) => reportError(err, 'Could not update notifications'))}
        onCheckUpdates={() => {
          const bridge = getNativeBridge();
          if (typeof bridge?.checkUpdates === 'function') bridge.checkUpdates();
          else window.open(DOWNLOAD_PAGE_URL, '_blank', 'noopener,noreferrer');
        }}
        onToggleNoiseSuppression={() => setNoiseSuppressionEnabled((prev) => !prev)}
        onNewFolderNameChange={setNewFolderName}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={renameCustomFolder}
        onDeleteFolder={deleteCustomFolder}
        onToggleFolderChannel={toggleFolderChannel}
        onToggleFolderFriend={toggleFolderFriend}
        onUploadChatWallpaper={() => wallpaperInputRef.current?.click()}
        onClearChatWallpaper={() => setClientSettings((prev) => ({ ...prev, chatWallpaper: '', chatWallpaperName: '' }))}
        onChatWallpaperDimChange={(value) => setClientSettings((prev) => ({ ...prev, chatWallpaperDim: value }))}
        apiUrl={API_URL}
        token={token}
        onLogout={handleLogout}
      />
      <UserProfileModal
        open={Boolean(viewedProfile)}
        profile={viewedProfile}
        relationshipLabel={getRelationshipInfo(viewedProfile).label}
        canAddFriend={getRelationshipInfo(viewedProfile).canAddFriend}
        isBlocked={(social.blockedUserIds || []).some((userId) => String(userId) === String(viewedProfile?.id))}
        onAddFriend={() => handleAddFriendFromProfile().catch((err) => setError(err.message))}
        onReport={() => openReportForUser(viewedProfile)}
        onBlock={() => blockProfile(viewedProfile)}
        onUnblock={() => unblockProfile(viewedProfile)}
        onClose={() => setViewedProfile(null)}
      />
      <ForwardMessagesModal
        messages={forwardingMessages}
        channels={textChannels}
        conversations={social.conversations}
        onSend={forwardMessagesTo}
        onClose={() => setForwardingMessages([])}
      />
      <SavedMessagesModal
        open={savedMessagesOpen}
        loading={savedMessagesLoading}
        bookmarks={savedMessages}
        onOpen={openSavedMessage}
        onClose={() => setSavedMessagesOpen(false)}
      />
      <MessageHistoryModal
        payload={messageHistory}
        loading={messageHistoryLoading}
        onClose={() => setMessageHistory(null)}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={(payload) => submitReport(payload)} />
      <MediaViewer message={viewedMedia} items={mediaViewerItems} onNavigate={setViewedMedia} onClose={() => setViewedMedia(null)} />
      <StoryViewer story={activeStory} stories={stories} onClose={() => setActiveStoryId(null)} onNext={() => stepStory(1)} onPrev={() => stepStory(-1)} />
      <StoryComposerModal
        open={showStoryComposer}
        draft={storyDraft}
        uploading={storyUploading}
        onClose={() => setShowStoryComposer(false)}
        onDraftChange={setStoryDraft}
        onPickMedia={() => storyInputRef.current?.click()}
        onPickMusic={() => storyMusicInputRef.current?.click()}
        onPublish={() => publishStoryDraft()}
      />
      <PollComposerModal
        open={pollComposerOpen}
        workspace={workspace}
        channelId={channelId}
        conversationId={dmConversationId}
        token={token}
        onCreated={(message) => {
          setMessages((current) => mergeMessage(current, message));
          pushToast('Poll published');
        }}
        onClose={() => setPollComposerOpen(false)}
      />
      <ScheduleMessageModal
        open={scheduleComposerOpen}
        content={newMessage.trim()}
        workspace={workspace}
        channelId={channelId}
        conversationId={dmConversationId}
        token={token}
        silent={silentMessage}
        onScheduled={() => {
          setNewMessage('');
          setSilentMessage(false);
          pushToast('Message scheduled');
        }}
        onClose={() => setScheduleComposerOpen(false)}
      />
    </>
    </IconFamilyContext.Provider>
  );
}
