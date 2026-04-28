import { useEffect, useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const APP_ORIGIN = API_URL.startsWith('/') ? window.location.origin : API_URL.replace(/\/api$/, '');
const SOCKET_URL = APP_ORIGIN;
const TOKEN_KEY = 'webcord_token';
const USER_KEY = 'webcord_user';
const GUILD_KEY = 'webcord_guild_id';
const CHANNEL_KEY = 'webcord_channel_id';
const VOICE_KEY = 'webcord_voice_channel_id';
const THEME_KEY = 'webcord_theme_name';

const THEMES = [
  { id: 'discord', name: 'Discord Ash', bg: '#1e1f22', rail: '#1a1b1f', sidebar: '#2b2d31', panel: '#313338', soft: '#383a40', text: '#f2f3f5', muted: '#b5bac1', accent: '#5865f2' },
  { id: 'midnight', name: 'Midnight Nitro', bg: '#0f1117', rail: '#080a10', sidebar: '#171a23', panel: '#1f2430', soft: '#293140', text: '#eef2ff', muted: '#aab4c4', accent: '#7c5cff' },
  { id: 'oled', name: 'OLED Black', bg: '#000000', rail: '#050505', sidebar: '#0b0b0c', panel: '#111113', soft: '#1c1c20', text: '#ffffff', muted: '#a6a6ad', accent: '#4f8cff' },
  { id: 'aurora', name: 'Aurora Green', bg: '#0d1513', rail: '#08100e', sidebar: '#13211d', panel: '#182923', soft: '#20372f', text: '#ecfff7', muted: '#9fc5b8', accent: '#2dd4bf' },
  { id: 'ember', name: 'Ember Red', bg: '#1a1113', rail: '#12090b', sidebar: '#26181b', panel: '#312024', soft: '#40292f', text: '#fff0f2', muted: '#d1a6ae', accent: '#f43f5e' },
  { id: 'ocean', name: 'Ocean Blue', bg: '#0c1622', rail: '#07101a', sidebar: '#122236', panel: '#172a42', soft: '#203954', text: '#eef7ff', muted: '#a4bdd5', accent: '#38bdf8' },
  { id: 'sunset', name: 'Sunset Pop', bg: '#17121d', rail: '#100b16', sidebar: '#241a2c', panel: '#30223a', soft: '#3d2c49', text: '#fff6fb', muted: '#c8adcf', accent: '#fb7185' },
  { id: 'mint', name: 'Mint Glass', bg: '#101817', rail: '#0b1110', sidebar: '#172523', panel: '#1d302d', soft: '#263d39', text: '#effffc', muted: '#a8c8c2', accent: '#34d399' },
  { id: 'lavender', name: 'Lavender', bg: '#171425', rail: '#100d1b', sidebar: '#242039', panel: '#2f2a48', soft: '#3b3656', text: '#f7f2ff', muted: '#c4b9df', accent: '#a78bfa' },
  { id: 'cyber', name: 'Cyber Lime', bg: '#10120d', rail: '#090b07', sidebar: '#1a1f13', panel: '#222918', soft: '#2d3620', text: '#f4ffe9', muted: '#b5c99f', accent: '#a3e635' },
  { id: 'rose', name: 'Rose Gold', bg: '#191317', rail: '#120c10', sidebar: '#251b20', panel: '#302229', soft: '#3d2b33', text: '#fff5f8', muted: '#d1afb9', accent: '#f472b6' },
  { id: 'slate', name: 'Clean Slate', bg: '#15191f', rail: '#0f1318', sidebar: '#20262e', panel: '#29313b', soft: '#333d49', text: '#f4f7fb', muted: '#aeb8c5', accent: '#60a5fa' },
  { id: 'gold', name: 'Soft Gold', bg: '#17150f', rail: '#100f0a', sidebar: '#242116', panel: '#302b1b', soft: '#3c3622', text: '#fff9e8', muted: '#cdbf99', accent: '#fbbf24' },
  { id: 'ruby', name: 'Ruby Night', bg: '#170d18', rail: '#100812', sidebar: '#251428', panel: '#311b35', soft: '#3e2343', text: '#fff1ff', muted: '#c9a5cf', accent: '#d946ef' },
  { id: 'graphite', name: 'Graphite Pro', bg: '#202124', rail: '#17181a', sidebar: '#2a2b2f', panel: '#35363b', soft: '#414249', text: '#f7f7f8', muted: '#bdbec4', accent: '#8b9cff' }
];

const DEFAULT_THEME = THEMES[0];

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
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function assetUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${APP_ORIGIN}${value}`;
}

function initials(name = 'W') {
  return name.trim().slice(0, 2).toUpperCase() || 'W';
}

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pickValidId(items, storedId, predicate = () => true) {
  const stored = items.find((item) => String(item.id) === String(storedId) && predicate(item));
  const first = items.find(predicate);
  return stored?.id ?? first?.id ?? '';
}

function Avatar({ person, size = '', onClick }) {
  const name = person?.displayName || person?.username || 'User';
  return (
    <button className={`avatar ${size}`} onClick={onClick} type="button" title={name}>
      {person?.avatarUrl ? <img src={assetUrl(person.avatarUrl)} alt={name} /> : initials(name)}
    </button>
  );
}

export default function App() {
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [view, setView] = useState('chat');
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildId] = useState(() => localStorage.getItem(GUILD_KEY) || '');
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(() => localStorage.getItem(CHANNEL_KEY) || '');
  const [voiceChannelId, setVoiceChannelId] = useState(() => localStorage.getItem(VOICE_KEY) || '');
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [newGuildName, setNewGuildName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('TEXT');
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('account');
  const [profileUser, setProfileUser] = useState(null);
  const [themeId, setThemeId] = useState(() => localStorage.getItem(THEME_KEY) || DEFAULT_THEME.id);
  const [profileForm, setProfileForm] = useState({ displayName: '', statusText: '', bio: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const socketRef = useRef(null);
  const channelIdRef = useRef(channelId);
  const voiceStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const messagesRef = useRef(null);

  const isAuthed = Boolean(token && user);
  const activeGuild = guilds.find((guild) => String(guild.id) === String(guildId));
  const textChannels = channels.filter((channel) => channel.type === 'TEXT');
  const voiceChannels = channels.filter((channel) => channel.type === 'VOICE');
  const activeChannel = textChannels.find((channel) => String(channel.id) === String(channelId));
  const activeVoiceChannel = voiceChannels.find((channel) => String(channel.id) === String(voiceChannelId));
  const acceptedFriends = useMemo(() => friends.filter((friend) => friend.status === 'ACCEPTED'), [friends]);
  const pendingFriends = useMemo(() => friends.filter((friend) => friend.status === 'PENDING'), [friends]);
  const currentTheme = THEMES.find((theme) => theme.id === themeId) || DEFAULT_THEME;

  useEffect(() => {
    channelIdRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries({
      '--bg': currentTheme.bg,
      '--rail': currentTheme.rail,
      '--sidebar': currentTheme.sidebar,
      '--panel': currentTheme.panel,
      '--panel-soft': currentTheme.soft,
      '--text': currentTheme.text,
      '--muted': currentTheme.muted,
      '--accent': currentTheme.accent
    }).forEach(([key, value]) => root.style.setProperty(key, value));
    localStorage.setItem(THEME_KEY, currentTheme.id);
  }, [currentTheme]);

  useEffect(() => {
    setProfileForm({
      displayName: user?.displayName || user?.username || '',
      statusText: user?.statusText || '',
      bio: user?.bio || ''
    });
  }, [user]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStreamRef.current) cameraVideoRef.current.srcObject = cameraStreamRef.current;
  }, [cameraOn]);

  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) screenVideoRef.current.srcObject = screenStreamRef.current;
  }, [screenOn]);

  useEffect(() => {
    if (!isAuthed) return;
    const socket = io(SOCKET_URL, { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect_error', (err) => setError(err.message || 'Realtime connection failed'));
    socket.on('new-message', (message) => {
      if (String(message.channelId) === String(channelIdRef.current)) {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
      }
    });
    socket.on('message-updated', (message) => setMessages((prev) => prev.map((item) => (item.id === message.id ? message : item))));
    socket.on('message-deleted', ({ id }) => setMessages((prev) => prev.filter((item) => item.id !== id)));
    socket.on('dm-new-message', () => loadFriends(token).catch(() => {}));
    socket.on('voice-participants', (participants) => {
      setVoiceUsers(participants.map((p) => p.socketId));
    });
    socket.on('voice-user-joined', ({ socketId }) => {
      setVoiceUsers((prev) => (prev.includes(socketId) ? prev : [...prev, socketId]));
    });
    socket.on('voice-user-left', ({ socketId }) => {
      setVoiceUsers((prev) => prev.filter((id) => id !== socketId));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      leaveVoice();
    };
  }, [isAuthed, token]);

  useEffect(() => {
    if (!isAuthed) return;
    loadWorkspace(token).catch((err) => setError(err.message));
  }, [isAuthed, token]);

  useEffect(() => {
    if (!isAuthed || !guildId) return;
    loadChannels(guildId, token).catch((err) => setError(err.message));
  }, [isAuthed, guildId, token]);

  useEffect(() => {
    if (!isAuthed || !channelId) {
      setMessages([]);
      return;
    }
    socketRef.current?.emit('join-channel', { channelId: Number(channelId) });
    apiFetch(`/messages/${channelId}`, {}, token).then(setMessages).catch((err) => setError(err.message));
  }, [isAuthed, channelId, token]);

  async function loadWorkspace(authToken) {
    setBusy(true);
    try {
      const [me, loadedGuilds, loadedFriends] = await Promise.all([
        apiFetch('/me', {}, authToken),
        apiFetch('/guilds', {}, authToken),
        apiFetch('/friends', {}, authToken)
      ]);
      setUser(me);
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      setFriends(loadedFriends);
      let nextGuilds = loadedGuilds;
      if (nextGuilds.length === 0) {
        const created = await apiFetch('/guilds', { method: 'POST', body: JSON.stringify({ name: 'WebCord' }) }, authToken);
        nextGuilds = [created];
      }
      setGuilds(nextGuilds);
      const nextGuildId = pickValidId(nextGuilds, localStorage.getItem(GUILD_KEY));
      if (nextGuildId) {
        setGuildId(String(nextGuildId));
        localStorage.setItem(GUILD_KEY, String(nextGuildId));
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadChannels(nextGuildId, authToken) {
    const loadedChannels = await apiFetch(`/channels/${nextGuildId}`, {}, authToken);
    setChannels(loadedChannels);
    const nextTextId = pickValidId(loadedChannels, localStorage.getItem(CHANNEL_KEY), (item) => item.type === 'TEXT');
    const nextVoiceId = pickValidId(loadedChannels, localStorage.getItem(VOICE_KEY), (item) => item.type === 'VOICE');
    setChannelId(nextTextId ? String(nextTextId) : '');
    setVoiceChannelId(nextVoiceId ? String(nextVoiceId) : '');
    if (nextTextId) localStorage.setItem(CHANNEL_KEY, String(nextTextId));
    else localStorage.removeItem(CHANNEL_KEY);
    if (nextVoiceId) localStorage.setItem(VOICE_KEY, String(nextVoiceId));
    else localStorage.removeItem(VOICE_KEY);
  }

  async function loadFriends(authToken = token) {
    const loadedFriends = await apiFetch('/friends', {}, authToken);
    setFriends(loadedFriends);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = await apiFetch(`/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password })
      });
      setToken(payload.token);
      setUser(payload.user);
      localStorage.setItem(TOKEN_KEY, payload.token);
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    leaveVoice();
    setToken('');
    setUser(null);
    setGuilds([]);
    setChannels([]);
    setMessages([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function createGuild(event) {
    event.preventDefault();
    if (!newGuildName.trim()) return;
    const created = await apiFetch('/guilds', { method: 'POST', body: JSON.stringify({ name: newGuildName.trim() }) }, token);
    setGuilds((prev) => [...prev, created]);
    setGuildId(String(created.id));
    localStorage.setItem(GUILD_KEY, String(created.id));
    setNewGuildName('');
  }

  async function createChannel(event) {
    event.preventDefault();
    if (!newChannelName.trim() || !guildId) return;
    const created = await apiFetch('/channels', {
      method: 'POST',
      body: JSON.stringify({ guildId: Number(guildId), name: newChannelName.trim(), type: newChannelType })
    }, token);
    setChannels((prev) => [...prev, created]);
    if (created.type === 'TEXT') selectTextChannel(created.id);
    else selectVoiceChannel(created.id);
    setNewChannelName('');
  }

  async function requestFriend(event) {
    event?.preventDefault?.();
    const value = typeof event === 'string' ? event : friendName.trim();
    if (!value || value === user?.username) return;
    await apiFetch('/friends/request', { method: 'POST', body: JSON.stringify({ username: value }) }, token);
    setFriendName('');
    await loadFriends();
  }

  async function acceptFriend(friendshipId) {
    await apiFetch(`/friends/${friendshipId}/accept`, { method: 'POST' }, token);
    await loadFriends();
  }

  async function selectGuild(nextGuildId) {
    setGuildId(String(nextGuildId));
    localStorage.setItem(GUILD_KEY, String(nextGuildId));
    setView('chat');
  }

  function selectTextChannel(nextChannelId) {
    setChannelId(String(nextChannelId));
    localStorage.setItem(CHANNEL_KEY, String(nextChannelId));
    setView('chat');
  }

  function selectVoiceChannel(nextChannelId) {
    setVoiceChannelId(String(nextChannelId));
    localStorage.setItem(VOICE_KEY, String(nextChannelId));
    setView('voice');
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return null;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    setError('');
    try {
      return await apiFetch('/upload', { method: 'POST', body: formData }, token);
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleMessageFile(event) {
    const uploaded = await uploadFile(event);
    if (uploaded) setPendingAttachment(uploaded);
  }

  async function handleProfileUpload(event, field) {
    const uploaded = await uploadFile(event);
    if (!uploaded) return;
    const updated = await apiFetch('/me', {
      method: 'PATCH',
      body: JSON.stringify({ ...profileForm, [field]: uploaded.url })
    }, token);
    setUser(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  async function saveProfile(event) {
    event.preventDefault();
    const updated = await apiFetch('/me', {
      method: 'PATCH',
      body: JSON.stringify(profileForm)
    }, token);
    setUser(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = messageInput.trim();
    if ((!content && !pendingAttachment) || !channelId) return;
    const payload = {
      channelId: Number(channelId),
      content,
      attachmentUrl: pendingAttachment?.url,
      attachmentType: pendingAttachment?.type,
      attachmentName: pendingAttachment?.name
    };
    if (socketRef.current?.connected) socketRef.current.emit('send-message', payload);
    else {
      const created = await apiFetch('/messages', { method: 'POST', body: JSON.stringify(payload) }, token);
      setMessages((prev) => [...prev, created]);
    }
    setMessageInput('');
    setPendingAttachment(null);
    setShowEmoji(false);
  }

  async function joinVoice() {
    if (!voiceChannelId) {
      setError('Select a voice channel first');
      return;
    }
    if (!voiceStreamRef.current) {
      voiceStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    socketRef.current?.emit('join-voice', { channelId: Number(voiceChannelId) });
    setVoiceJoined(true);
    setView('voice');
  }

  function leaveVoice() {
    socketRef.current?.emit('leave-voice');
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    setVoiceJoined(false);
    setCameraOn(false);
    setScreenOn(false);
    setVoiceUsers([]);
  }

  function toggleMute() {
    const next = !muted;
    voiceStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  async function toggleCamera() {
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraOn(false);
      return;
    }
    cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    setCameraOn(true);
  }

  async function toggleScreen() {
    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenOn(false);
      return;
    }
    if (!navigator.mediaDevices.getDisplayMedia) {
      setError('Screen share is not supported in this browser');
      return;
    }
    screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenStreamRef.current.getVideoTracks()[0]?.addEventListener('ended', () => setScreenOn(false));
    setScreenOn(true);
  }

  function openProfile(person) {
    setProfileUser(person);
  }

  if (!isAuthed) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand-mark">WC</div>
          <h1>WebCord</h1>
          <p>Fast voice and chat for your private community.</p>
          <form onSubmit={handleAuth}>
            <div className="segmented">
              <button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
              <button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" required />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="current-password" required />
            {error ? <p className="error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Please wait...' : authMode === 'login' ? 'Enter WebCord' : 'Create account'}</button>
          </form>
        </section>
      </main>
    );
  }

  const renderChat = () => (
    <>
      <header className="topbar">
        <div>
          <h2>{activeChannel ? `# ${activeChannel.name}` : 'Select a channel'}</h2>
          <span>{messages.length} messages in this channel</span>
        </div>
        <button onClick={() => loadWorkspace(token)}>Refresh</button>
      </header>
      <div className="message-list" ref={messagesRef}>
        {messages.map((message) => (
          <article className="message-card" key={message.id}>
            <Avatar person={message.author} onClick={() => openProfile(message.author)} />
            <div className="message-body">
              <div className="message-meta">
                <button type="button" onClick={() => openProfile(message.author)}>{message.author?.displayName || message.author?.username || 'Unknown'}</button>
                <span>{timeLabel(message.createdAt)}</span>
              </div>
              {message.content ? <p>{message.content}</p> : null}
              {message.attachmentType === 'IMAGE' ? <img src={assetUrl(message.attachmentUrl)} alt={message.attachmentName || 'image'} /> : null}
              {message.attachmentType === 'VIDEO' ? <video src={assetUrl(message.attachmentUrl)} controls /> : null}
              {message.attachmentType === 'FILE' ? <a href={assetUrl(message.attachmentUrl)} download>{message.attachmentName || 'Download file'}</a> : null}
            </div>
          </article>
        ))}
        {activeChannel && messages.length === 0 ? <p className="empty-state">No messages yet. Start the conversation.</p> : null}
      </div>
      <form className="composer" onSubmit={sendMessage}>
        <input ref={fileInputRef} type="file" hidden onChange={handleMessageFile} accept="image/*,video/*,.pdf,.zip,.txt" />
        <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file">+</button>
        <button type="button" onClick={() => setShowEmoji((value) => !value)} title="Emoji">:-)</button>
        {showEmoji ? (
          <div className="emoji-popover">
            <Picker data={data} theme="dark" onEmojiSelect={(emoji) => setMessageInput((value) => `${value}${emoji.native}`)} />
          </div>
        ) : null}
        <input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Select a channel'} disabled={!activeChannel} />
        <button className="send-button" type="submit" disabled={!activeChannel || uploading || (!messageInput.trim() && !pendingAttachment)}>Send</button>
      </form>
      {pendingAttachment ? <p className="attachment-pill">Attached: {pendingAttachment.name}</p> : null}
    </>
  );

  const renderVoice = () => (
    <>
      <header className="topbar voice-topbar">
        <div>
          <h2>{activeVoiceChannel ? activeVoiceChannel.name : 'Voice Channel'}</h2>
          <span>{voiceJoined ? 'Voice connected' : 'Preview voice channel'}</span>
        </div>
        <button onClick={voiceJoined ? leaveVoice : joinVoice}>{voiceJoined ? 'Disconnect' : 'Join Voice'}</button>
      </header>
      <div className="voice-stage">
        <section className="voice-grid">
          <article className="voice-tile self">
            {cameraOn ? <video ref={cameraVideoRef} autoPlay muted playsInline /> : <Avatar person={user} size="huge" />}
            <span>{user?.displayName || user?.username}</span>
            {muted ? <strong>Muted</strong> : null}
          </article>
          {screenOn ? (
            <article className="voice-tile screen">
              <video ref={screenVideoRef} autoPlay muted playsInline />
              <span>Your screen</span>
            </article>
          ) : (
            <article className="voice-tile activity">
              <div className="activity-art">Stage</div>
              <p>Turn on camera or share your screen to fill this tile.</p>
            </article>
          )}
          {voiceUsers.map((socketId) => (
            <article className="voice-tile remote" key={socketId}>
              <Avatar person={{ username: socketId.slice(0, 6) }} size="huge" />
              <span>Guest {socketId.slice(0, 5)}</span>
            </article>
          ))}
        </section>
        <section className="voice-side-panel">
          <h3>Voice Settings</h3>
          {[user, ...acceptedFriends.map((friend) => friend.user)].filter(Boolean).slice(0, 6).map((person) => {
            const id = person.id || 'self';
            return (
              <label className="volume-row" key={id}>
                <span>{person.displayName || person.username}</span>
                <input type="range" min="0" max="200" value={peerVolumes[id] ?? 100} onChange={(event) => setPeerVolumes((prev) => ({ ...prev, [id]: event.target.value }))} />
                <b>{peerVolumes[id] ?? 100}%</b>
              </label>
            );
          })}
        </section>
      </div>
      <footer className="voice-control-bar">
        <button className={muted ? 'danger active' : ''} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        <button className={deafened ? 'danger active' : ''} onClick={() => setDeafened((value) => !value)}>{deafened ? 'Undeafen' : 'Deafen'}</button>
        <button className={cameraOn ? 'active' : ''} onClick={toggleCamera}>{cameraOn ? 'Camera On' : 'Camera'}</button>
        <button className={screenOn ? 'active' : ''} onClick={toggleScreen}>{screenOn ? 'Sharing' : 'Share'}</button>
        <button className="hangup" onClick={leaveVoice}>Leave</button>
      </footer>
    </>
  );

  const renderFriends = () => (
    <>
      <header className="topbar">
        <h2>Friends</h2>
        <form className="friend-form" onSubmit={requestFriend}>
          <input value={friendName} onChange={(event) => setFriendName(event.target.value)} placeholder="Add by username" />
          <button>Add Friend</button>
        </form>
      </header>
      <div className="friends-list">
        {[...pendingFriends, ...acceptedFriends].map((friend) => (
          <article className="friend-card" key={friend.id}>
            <Avatar person={friend.user} onClick={() => openProfile(friend.user)} />
            <div>
              <strong>{friend.user.displayName || friend.user.username}</strong>
              <span>{friend.status === 'PENDING' ? (friend.isOutgoingRequest ? 'Request sent' : 'Incoming request') : friend.user.statusText || 'Online recently'}</span>
            </div>
            {friend.status === 'PENDING' && !friend.isOutgoingRequest ? <button onClick={() => acceptFriend(friend.id)}>Accept</button> : null}
          </article>
        ))}
        {friends.length === 0 ? <p className="empty-state">Add a friend to start direct conversations.</p> : null}
      </div>
    </>
  );

  return (
    <main className="discord-shell">
      <aside className="guild-rail">
        <button className={view === 'friends' ? 'rail-button active' : 'rail-button'} onClick={() => setView('friends')} title="Friends">@</button>
        <div className="rail-divider" />
        {guilds.map((guild) => (
          <button key={guild.id} className={String(guild.id) === String(guildId) && view !== 'friends' ? 'rail-button active' : 'rail-button'} onClick={() => selectGuild(guild.id)} title={guild.name}>
            {initials(guild.name)}
          </button>
        ))}
        <form className="mini-form" onSubmit={createGuild}>
          <input value={newGuildName} onChange={(event) => setNewGuildName(event.target.value)} placeholder="New server" />
          <button title="Create server">+</button>
        </form>
      </aside>

      <aside className="channel-sidebar">
        <header className="server-header">
          <div><strong>{activeGuild?.name || 'WebCord'}</strong><span>{user?.displayName || user?.username}</span></div>
          <button onClick={() => setShowSettings(true)} title="Settings">Settings</button>
        </header>
        <section className="channel-section">
          <div className="section-title">Text Channels</div>
          {textChannels.map((channel) => (
            <button key={channel.id} className={String(channel.id) === String(channelId) && view === 'chat' ? 'channel-row active' : 'channel-row'} onClick={() => selectTextChannel(channel.id)}>
              <span>#</span>{channel.name}
            </button>
          ))}
        </section>
        <section className="channel-section">
          <div className="section-title">Voice Channels</div>
          {voiceChannels.map((channel) => (
            <button key={channel.id} className={String(channel.id) === String(voiceChannelId) && view === 'voice' ? 'channel-row active' : 'channel-row'} onClick={() => selectVoiceChannel(channel.id)}>
              <span>VC</span>{channel.name}
            </button>
          ))}
          <button className={voiceJoined ? 'voice-button connected' : 'voice-button'} onClick={voiceJoined ? () => setView('voice') : joinVoice}>{voiceJoined ? 'Voice Connected' : `Join ${activeVoiceChannel?.name || 'voice'}`}</button>
        </section>
        <form className="create-channel" onSubmit={createChannel}>
          <input value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} placeholder="Create channel" />
          <select value={newChannelType} onChange={(event) => setNewChannelType(event.target.value)}><option value="TEXT">Text</option><option value="VOICE">Voice</option></select>
          <button>Create</button>
        </form>
        <footer className="user-panel">
          <Avatar person={user} size="small" onClick={() => openProfile(user)} />
          <div><strong>{user?.displayName || user?.username}</strong><span>{muted ? 'Muted' : 'Online'}</span></div>
          <button onClick={toggleMute}>{muted ? 'Mic Off' : 'Mic'}</button>
          <button onClick={() => setShowSettings(true)}>Gear</button>
        </footer>
      </aside>

      <section className={view === 'friends' ? 'content friends-view' : view === 'voice' ? 'content voice-view' : 'content'}>
        {view === 'friends' ? renderFriends() : view === 'voice' ? renderVoice() : renderChat()}
        {error ? <div className="toast" onClick={() => setError('')}>{error}</div> : null}
      </section>

      <aside className="member-sidebar">
        <h3>Active Now</h3>
        <article className="activity-card" onClick={() => openProfile(user)}>
          <Avatar person={user} size="small" />
          <div><strong>{user?.displayName || user?.username}</strong><span>{voiceJoined ? `In ${activeVoiceChannel?.name || 'voice'}` : 'Browsing WebCord'}</span></div>
        </article>
        <h3>Friends</h3>
        {acceptedFriends.slice(0, 8).map((friend) => (
          <article className="member-row" key={friend.id} onClick={() => openProfile(friend.user)}>
            <Avatar person={friend.user} size="small" />
            <span>{friend.user.displayName || friend.user.username}</span>
          </article>
        ))}
      </aside>

      {profileUser ? (
        <div className="modal-backdrop" onMouseDown={() => setProfileUser(null)}>
          <section className="profile-popout" onMouseDown={(event) => event.stopPropagation()}>
            <div className="profile-banner" style={profileUser.bannerUrl ? { backgroundImage: `url(${assetUrl(profileUser.bannerUrl)})` } : undefined} />
            <Avatar person={profileUser} size="profile" />
            <h2>{profileUser.displayName || profileUser.username}</h2>
            <p>@{profileUser.username}</p>
            <span>{profileUser.bio || profileUser.statusText || 'No status yet.'}</span>
            {profileUser.username !== user?.username ? <button onClick={() => requestFriend(profileUser.username)}>Add Friend</button> : <button onClick={() => setShowSettings(true)}>Edit Profile</button>}
          </section>
        </div>
      ) : null}

      {showSettings ? (
        <div className="settings-overlay">
          <aside className="settings-nav">
            <div className="settings-user"><Avatar person={user} /><div><strong>{user?.displayName || user?.username}</strong><span>Edit profile</span></div></div>
            {['account', 'profile', 'voice', 'appearance', 'privacy', 'notifications', 'devices'].map((tab) => (
              <button key={tab} className={settingsTab === tab ? 'active' : ''} onClick={() => setSettingsTab(tab)}>{tab}</button>
            ))}
          </aside>
          <section className="settings-panel">
            <button className="settings-close" onClick={() => setShowSettings(false)}>X</button>
            {settingsTab === 'account' ? (
              <>
                <h2>My Account</h2>
                <div className="account-card">
                  <div className="profile-banner" style={user?.bannerUrl ? { backgroundImage: `url(${assetUrl(user.bannerUrl)})` } : undefined} />
                  <Avatar person={user} size="profile" />
                  <h3>{user?.displayName || user?.username}</h3>
                  <dl><dt>Username</dt><dd>{user?.username}</dd><dt>Status</dt><dd>{user?.statusText || 'Online'}</dd><dt>Security</dt><dd>Multi-factor authentication ready</dd></dl>
                </div>
              </>
            ) : null}
            {settingsTab === 'profile' ? (
              <form className="settings-form" onSubmit={saveProfile}>
                <h2>User Profile</h2>
                <input ref={avatarInputRef} type="file" hidden accept="image/*" onChange={(event) => handleProfileUpload(event, 'avatarUrl')} />
                <input ref={bannerInputRef} type="file" hidden accept="image/*" onChange={(event) => handleProfileUpload(event, 'bannerUrl')} />
                <div className="profile-editor-preview">
                  <div className="profile-banner" style={user?.bannerUrl ? { backgroundImage: `url(${assetUrl(user.bannerUrl)})` } : undefined} />
                  <Avatar person={user} size="profile" />
                  <button type="button" onClick={() => avatarInputRef.current?.click()}>Change Avatar</button>
                  <button type="button" onClick={() => bannerInputRef.current?.click()}>Change Banner</button>
                </div>
                <label>Display Name<input value={profileForm.displayName} onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))} /></label>
                <label>Status<input value={profileForm.statusText} onChange={(event) => setProfileForm((prev) => ({ ...prev, statusText: event.target.value }))} /></label>
                <label>About<textarea value={profileForm.bio} onChange={(event) => setProfileForm((prev) => ({ ...prev, bio: event.target.value }))} /></label>
                <button className="primary-action">Save Profile</button>
              </form>
            ) : null}
            {settingsTab === 'voice' ? (
              <div className="settings-form"><h2>Voice & Video</h2><label>Input Volume<input type="range" min="0" max="200" defaultValue="100" /></label><label>Output Volume<input type="range" min="0" max="200" defaultValue="100" /></label><button onClick={toggleMute}>{muted ? 'Unmute Microphone' : 'Mute Microphone'}</button><button onClick={toggleCamera}>{cameraOn ? 'Stop Camera' : 'Test Camera'}</button></div>
            ) : null}
            {settingsTab === 'appearance' ? (
              <div className="settings-form"><h2>Appearance</h2><div className="theme-grid">{THEMES.map((theme) => <button key={theme.id} className={theme.id === currentTheme.id ? 'theme-card active' : 'theme-card'} style={{ '--swatch': theme.accent, background: theme.panel }} onClick={() => setThemeId(theme.id)}><span />{theme.name}</button>)}</div></div>
            ) : null}
            {!['account', 'profile', 'voice', 'appearance'].includes(settingsTab) ? <div className="settings-form"><h2>{settingsTab}</h2><p className="empty-state">Controls are ready for this section. Defaults are tuned for private communities.</p></div> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
