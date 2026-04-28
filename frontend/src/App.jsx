import { useEffect, useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = API_URL.startsWith('/') ? window.location.origin : API_URL.replace(/\/api$/, '');
const TOKEN_KEY = 'webcord_token';
const USER_KEY = 'webcord_user';
const GUILD_KEY = 'webcord_guild_id';
const CHANNEL_KEY = 'webcord_channel_id';
const VOICE_KEY = 'webcord_voice_channel_id';

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

function attachmentUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${API_URL}${value}`;
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const socketRef = useRef(null);
  const channelIdRef = useRef(channelId);
  const voiceStreamRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);

  const isAuthed = Boolean(token && user);
  const activeGuild = guilds.find((guild) => String(guild.id) === String(guildId));
  const textChannels = channels.filter((channel) => channel.type === 'TEXT');
  const voiceChannels = channels.filter((channel) => channel.type === 'VOICE');
  const activeChannel = textChannels.find((channel) => String(channel.id) === String(channelId));
  const activeVoiceChannel = voiceChannels.find((channel) => String(channel.id) === String(voiceChannelId));
  const acceptedFriends = useMemo(() => friends.filter((friend) => friend.status === 'ACCEPTED'), [friends]);
  const pendingFriends = useMemo(() => friends.filter((friend) => friend.status === 'PENDING'), [friends]);

  useEffect(() => {
    channelIdRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

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
    socket.on('message-updated', (message) => {
      setMessages((prev) => prev.map((item) => (item.id === message.id ? message : item)));
    });
    socket.on('message-deleted', ({ id }) => {
      setMessages((prev) => prev.filter((item) => item.id !== id));
    });
    socket.on('dm-new-message', () => loadFriends(token).catch(() => {}));

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
    apiFetch(`/messages/${channelId}`, {}, token)
      .then(setMessages)
      .catch((err) => setError(err.message));
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
        const created = await apiFetch('/guilds', {
          method: 'POST',
          body: JSON.stringify({ name: 'WebCord' })
        }, authToken);
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
    const created = await apiFetch('/guilds', {
      method: 'POST',
      body: JSON.stringify({ name: newGuildName.trim() })
    }, token);
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
    if (created.type === 'TEXT') {
      setChannelId(String(created.id));
      localStorage.setItem(CHANNEL_KEY, String(created.id));
    } else {
      setVoiceChannelId(String(created.id));
      localStorage.setItem(VOICE_KEY, String(created.id));
    }
    setNewChannelName('');
  }

  async function requestFriend(event) {
    event.preventDefault();
    if (!friendName.trim()) return;
    await apiFetch('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ username: friendName.trim() })
    }, token);
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
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    setError('');
    try {
      const uploaded = await apiFetch('/upload', { method: 'POST', body: formData }, token);
      setPendingAttachment(uploaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

    if (socketRef.current?.connected) {
      socketRef.current.emit('send-message', payload);
    } else {
      const created = await apiFetch('/messages', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token);
      setMessages((prev) => [...prev, created]);
    }

    setMessageInput('');
    setPendingAttachment(null);
    setShowEmoji(false);
  }

  async function toggleVoice() {
    if (voiceJoined) {
      leaveVoice();
      setVoiceJoined(false);
      return;
    }
    if (!voiceChannelId) {
      setError('Select a voice channel first');
      return;
    }
    try {
      voiceStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      socketRef.current?.emit('join-voice', { channelId: Number(voiceChannelId) });
      setVoiceJoined(true);
    } catch {
      setError('Microphone access was blocked');
    }
  }

  function leaveVoice() {
    socketRef.current?.emit('leave-voice');
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
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
              <button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>
                Sign in
              </button>
              <button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>
                Register
              </button>
            </div>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" required />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="current-password" required />
            {error ? <p className="error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : authMode === 'login' ? 'Enter WebCord' : 'Create account'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="discord-shell">
      <aside className="guild-rail">
        <button className={view === 'friends' ? 'rail-button active' : 'rail-button'} onClick={() => setView('friends')} title="Friends">
          @
        </button>
        <div className="rail-divider" />
        {guilds.map((guild) => (
          <button
            key={guild.id}
            className={String(guild.id) === String(guildId) && view === 'chat' ? 'rail-button active' : 'rail-button'}
            onClick={() => selectGuild(guild.id)}
            title={guild.name}
          >
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
          <div>
            <strong>{activeGuild?.name || 'WebCord'}</strong>
            <span>{user?.displayName || user?.username}</span>
          </div>
          <button onClick={logout} title="Logout">Exit</button>
        </header>

        <section className="channel-section">
          <div className="section-title">Text Channels</div>
          {textChannels.map((channel) => (
            <button key={channel.id} className={String(channel.id) === String(channelId) ? 'channel-row active' : 'channel-row'} onClick={() => selectTextChannel(channel.id)}>
              <span>#</span>
              {channel.name}
            </button>
          ))}
        </section>

        <section className="channel-section">
          <div className="section-title">Voice Channels</div>
          {voiceChannels.map((channel) => (
            <button key={channel.id} className={String(channel.id) === String(voiceChannelId) ? 'channel-row active' : 'channel-row'} onClick={() => selectVoiceChannel(channel.id)}>
              <span>VC</span>
              {channel.name}
            </button>
          ))}
          <button className={voiceJoined ? 'voice-button connected' : 'voice-button'} onClick={toggleVoice}>
            {voiceJoined ? 'Connected' : `Join ${activeVoiceChannel?.name || 'voice'}`}
          </button>
        </section>

        <form className="create-channel" onSubmit={createChannel}>
          <input value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} placeholder="Create channel" />
          <select value={newChannelType} onChange={(event) => setNewChannelType(event.target.value)}>
            <option value="TEXT">Text</option>
            <option value="VOICE">Voice</option>
          </select>
          <button>Create</button>
        </form>
      </aside>

      <section className={view === 'friends' ? 'content friends-view' : 'content'}>
        {view === 'friends' ? (
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
                  <div className="avatar">{initials(friend.user.displayName || friend.user.username)}</div>
                  <div>
                    <strong>{friend.user.displayName || friend.user.username}</strong>
                    <span>{friend.status === 'PENDING' ? (friend.isOutgoingRequest ? 'Request sent' : 'Incoming request') : 'Online recently'}</span>
                  </div>
                  {friend.status === 'PENDING' && !friend.isOutgoingRequest ? (
                    <button onClick={() => acceptFriend(friend.id)}>Accept</button>
                  ) : null}
                </article>
              ))}
              {friends.length === 0 ? <p className="empty-state">Add a friend to start direct conversations.</p> : null}
            </div>
          </>
        ) : (
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
                  <div className="avatar">{initials(message.author?.displayName || message.author?.username || 'U')}</div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.author?.displayName || message.author?.username || 'Unknown'}</strong>
                      <span>{timeLabel(message.createdAt)}</span>
                    </div>
                    {message.content ? <p>{message.content}</p> : null}
                    {message.attachmentType === 'IMAGE' ? <img src={attachmentUrl(message.attachmentUrl)} alt={message.attachmentName || 'image'} /> : null}
                    {message.attachmentType === 'VIDEO' ? <video src={attachmentUrl(message.attachmentUrl)} controls /> : null}
                    {message.attachmentType === 'FILE' ? <a href={attachmentUrl(message.attachmentUrl)} download>{message.attachmentName || 'Download file'}</a> : null}
                  </div>
                </article>
              ))}
              {activeChannel && messages.length === 0 ? <p className="empty-state">No messages yet. Start the conversation.</p> : null}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input ref={fileInputRef} type="file" hidden onChange={uploadFile} />
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file">+</button>
              <button type="button" onClick={() => setShowEmoji((value) => !value)} title="Emoji">:-)</button>
              {showEmoji ? (
                <div className="emoji-popover">
                  <Picker data={data} theme="dark" onEmojiSelect={(emoji) => setMessageInput((value) => `${value}${emoji.native}`)} />
                </div>
              ) : null}
              <input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Select a channel'} disabled={!activeChannel} />
              <button className="send-button" type="submit" disabled={!activeChannel || uploading || (!messageInput.trim() && !pendingAttachment)}>
                Send
              </button>
            </form>
            {pendingAttachment ? <p className="attachment-pill">Attached: {pendingAttachment.name}</p> : null}
          </>
        )}
        {error ? <div className="toast" onClick={() => setError('')}>{error}</div> : null}
      </section>

      <aside className="member-sidebar">
        <h3>Active Now</h3>
        <article className="activity-card">
          <div className="avatar online">{initials(user?.displayName || user?.username)}</div>
          <div>
            <strong>{user?.displayName || user?.username}</strong>
            <span>{voiceJoined ? `In ${activeVoiceChannel?.name || 'voice'}` : 'Browsing WebCord'}</span>
          </div>
        </article>
        <h3>Friends</h3>
        {acceptedFriends.slice(0, 8).map((friend) => (
          <article className="member-row" key={friend.id}>
            <div className="avatar small">{initials(friend.user.displayName || friend.user.username)}</div>
            <span>{friend.user.displayName || friend.user.username}</span>
          </article>
        ))}
      </aside>
    </main>
  );
}
