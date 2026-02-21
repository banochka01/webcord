import { useEffect, useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = API_URL.startsWith('/') ? window.location.origin : API_URL;
const CHANNEL_ID_KEY = 'webcord_channel_id';
const GUILD_ID_KEY = 'webcord_guild_id';
const VOICE_CHANNEL_ID_KEY = 'webcord_voice_channel_id';
const THEME_KEY = 'webcord_theme';
const defaultTheme = {
  bg: '#111217',
  panel: '#171d29',
  accent: '#5e7bff',
  text: '#f4f6ff'
};

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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function getAttachmentUrl(path) {
  if (!path) {
    return '';
  }
  if (path.startsWith('http')) {
    return path;
  }
  return `${API_URL}${path}`;
}

export default function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('webcord_token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('webcord_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [guildId, setGuildId] = useState(() => localStorage.getItem(GUILD_ID_KEY) || '');
  const [channelId, setChannelId] = useState(() => localStorage.getItem(CHANNEL_ID_KEY) || '');
  const [voiceChannelId, setVoiceChannelId] = useState(() => localStorage.getItem(VOICE_CHANNEL_ID_KEY) || '');
  const [channels, setChannels] = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('TEXT');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [theme, setTheme] = useState(() => {
    const raw = localStorage.getItem(THEME_KEY);
    return raw ? JSON.parse(raw) : defaultTheme;
  });
  const [participantVolumes, setParticipantVolumes] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef({});
  const fileInputRef = useRef(null);

  const isAuthed = Boolean(token && user);
  const textChannels = channels.filter((channel) => channel.type === 'TEXT');
  const voiceChannels = channels.filter((channel) => channel.type === 'VOICE');

  const activeTextChannel = textChannels.find((channel) => String(channel.id) === String(channelId));
  const activeVoiceChannel = voiceChannels.find((channel) => String(channel.id) === String(voiceChannelId));

  const peerConfig = useMemo(
    () => ({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }),
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-color', theme.bg);
    root.style.setProperty('--panel-color', theme.panel);
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--text-color', theme.text);
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    if (!isAuthed || !guildId) {
      return;
    }

    apiFetch(`/channels/${guildId}`, {}, token)
      .then((data) => {
        setChannels(data);
        if (!channelId) {
          const firstText = data.find((channel) => channel.type === 'TEXT');
          if (firstText) {
            setChannelId(String(firstText.id));
            localStorage.setItem(CHANNEL_ID_KEY, String(firstText.id));
          }
        }
        if (!voiceChannelId) {
          const firstVoice = data.find((channel) => channel.type === 'VOICE');
          if (firstVoice) {
            setVoiceChannelId(String(firstVoice.id));
            localStorage.setItem(VOICE_CHANNEL_ID_KEY, String(firstVoice.id));
          }
        }
      })
      .catch((e) => setError(e.message));
  }, [token, isAuthed, guildId]);

  useEffect(() => {
    if (!isAuthed || !channelId) {
      setMessages([]);
      return;
    }

    apiFetch(`/messages/${channelId}`, {}, token)
      .then(setMessages)
      .catch((e) => setError(e.message));
  }, [token, isAuthed, channelId]);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      setError(err.message || 'Socket connection failed');
    });

    socket.on('new-message', (message) => {
      if (String(message.channelId) !== String(channelId)) {
        return;
      }
      setMessages((prev) => [...prev, message]);
    });

    socket.on('voice-participants', async (participants) => {
      for (const participant of participants) {
        await createPeerAndOffer(participant.socketId);
      }
    });

    socket.on('voice-user-joined', async ({ socketId }) => {
      setParticipantVolumes((prev) => (prev[socketId] ? prev : { ...prev, [socketId]: 100 }));
      await createPeerAndOffer(socketId);
    });

    socket.on('voice-offer', async ({ offer, fromSocketId, targetSocketId }) => {
      if (targetSocketId && targetSocketId !== socket.id) {
        return;
      }
      const peer = await getOrCreatePeer(fromSocketId);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('voice-answer', {
        channelId: Number(voiceChannelId),
        answer,
        targetSocketId: fromSocketId
      });
    });

    socket.on('voice-answer', async ({ answer, fromSocketId, targetSocketId }) => {
      if (targetSocketId && targetSocketId !== socket.id) {
        return;
      }
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('voice-ice-candidate', async ({ candidate, fromSocketId, targetSocketId }) => {
      if (targetSocketId && targetSocketId !== socket.id) {
        return;
      }
      const peer = await getOrCreatePeer(fromSocketId);
      if (candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('voice-user-left', ({ socketId }) => {
      closePeer(socketId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      cleanupVoice();
    };
  }, [isAuthed, token, channelId, voiceChannelId, peerConfig]);

  useEffect(() => {
    if (socketRef.current && channelId) {
      socketRef.current.emit('join-channel', { channelId: Number(channelId) });
    }
  }, [channelId]);

  async function ensureDefaultGuildAndChannel(authToken) {
    let currentGuild = localStorage.getItem(GUILD_ID_KEY);

    if (!currentGuild) {
      const createdGuild = await apiFetch(
        '/guilds',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Global Guild' })
        },
        authToken
      );
      currentGuild = String(createdGuild.id);
      localStorage.setItem(GUILD_ID_KEY, currentGuild);
    }

    const guildChannels = await apiFetch(`/channels/${currentGuild}`, {}, authToken);
    let defaultTextChannel = guildChannels.find((channel) => channel.type === 'TEXT');
    let defaultVoiceChannel = guildChannels.find((channel) => channel.type === 'VOICE');

    if (!defaultTextChannel) {
      defaultTextChannel = await apiFetch(
        '/channels',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'general', guildId: Number(currentGuild), type: 'TEXT' })
        },
        authToken
      );
    }

    if (!defaultVoiceChannel) {
      defaultVoiceChannel = await apiFetch(
        '/channels',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'General Voice', guildId: Number(currentGuild), type: 'VOICE' })
        },
        authToken
      );
    }

    setGuildId(currentGuild);
    setChannelId(String(defaultTextChannel.id));
    setVoiceChannelId(String(defaultVoiceChannel.id));
    localStorage.setItem(CHANNEL_ID_KEY, String(defaultTextChannel.id));
    localStorage.setItem(VOICE_CHANNEL_ID_KEY, String(defaultVoiceChannel.id));
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');

    try {
      const data = await apiFetch(`/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('webcord_token', data.token);
      localStorage.setItem('webcord_user', JSON.stringify(data.user));
      await ensureDefaultGuildAndChannel(data.token);
      setUsername('');
      setPassword('');
    } catch (e) {
      setError(e.message);
    }
  }

  function handleLogout() {
    cleanupVoice();
    setVoiceJoined(false);
    setMessages([]);
    setToken('');
    setUser(null);
    localStorage.removeItem('webcord_token');
    localStorage.removeItem('webcord_user');
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file || !token) {
      return;
    }

    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await apiFetch('/upload', { method: 'POST', body: formData }, token);
      setPendingAttachment(uploaded);
    } catch (uploadError) {
      setError(uploadError.message);
      setPendingAttachment(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const content = newMessage.trim();

    if ((!content && !pendingAttachment) || !socketRef.current || !channelId) {
      return;
    }

    socketRef.current.emit('send-message', {
      channelId: Number(channelId),
      content,
      attachmentUrl: pendingAttachment?.url,
      attachmentType: pendingAttachment?.type,
      attachmentName: pendingAttachment?.name
    });
    setNewMessage('');
    setPendingAttachment(null);
    setShowEmojiPicker(false);
  }

  async function handleCreateChannel(e) {
    e.preventDefault();
    if (!newChannelName.trim() || !guildId) {
      return;
    }

    try {
      const createdChannel = await apiFetch(
        '/channels',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newChannelName.trim(),
            guildId: Number(guildId),
            type: newChannelType
          })
        },
        token
      );
      setChannels((prev) => [...prev, createdChannel]);
      if (createdChannel.type === 'TEXT') {
        setChannelId(String(createdChannel.id));
        localStorage.setItem(CHANNEL_ID_KEY, String(createdChannel.id));
      } else {
        setVoiceChannelId(String(createdChannel.id));
        localStorage.setItem(VOICE_CHANNEL_ID_KEY, String(createdChannel.id));
      }
      setNewChannelName('');
      setNewChannelType('TEXT');
    } catch (channelError) {
      setError(channelError.message);
    }
  }

  function selectTextChannel(nextChannelId) {
    setChannelId(String(nextChannelId));
    localStorage.setItem(CHANNEL_ID_KEY, String(nextChannelId));
  }

  function selectVoiceChannel(nextChannelId) {
    if (voiceJoined) {
      cleanupVoice();
      setVoiceJoined(false);
    }
    setVoiceChannelId(String(nextChannelId));
    localStorage.setItem(VOICE_CHANNEL_ID_KEY, String(nextChannelId));
  }

  async function getOrCreatePeer(remoteSocketId) {
    if (peersRef.current[remoteSocketId]) {
      return peersRef.current[remoteSocketId];
    }

    const peer = new RTCPeerConnection(peerConfig);
    peersRef.current[remoteSocketId] = peer;
    setParticipantVolumes((prev) => (prev[remoteSocketId] ? prev : { ...prev, [remoteSocketId]: 100 }));

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('voice-ice-candidate', {
          channelId: Number(voiceChannelId),
          candidate: event.candidate,
          targetSocketId: remoteSocketId
        });
      }
    };

    peer.ontrack = (event) => {
      let audio = remoteAudioRef.current[remoteSocketId];
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        remoteAudioRef.current[remoteSocketId] = audio;
      }
      audio.srcObject = event.streams[0];
      audio.volume = (participantVolumes[remoteSocketId] ?? 100) / 100;
    };

    return peer;
  }

  async function createPeerAndOffer(remoteSocketId) {
    if (!voiceJoined || !localStreamRef.current || !socketRef.current || !remoteSocketId || !voiceChannelId) {
      return;
    }
    const peer = await getOrCreatePeer(remoteSocketId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socketRef.current.emit('voice-offer', {
      channelId: Number(voiceChannelId),
      offer,
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

    setParticipantVolumes((prev) => {
      const clone = { ...prev };
      delete clone[remoteSocketId];
      return clone;
    });
  }

  function cleanupVoice() {
    if (socketRef.current) {
      socketRef.current.emit('leave-voice');
    }

    Object.keys(peersRef.current).forEach(closePeer);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }

  async function handleJoinVoice() {
    if (!voiceChannelId) {
      setError('Select a voice channel first');
      return;
    }

    try {
      if (voiceJoined) {
        cleanupVoice();
        setVoiceJoined(false);
        return;
      }

      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceJoined(true);
      socketRef.current?.emit('join-voice', { channelId: Number(voiceChannelId) });
    } catch {
      setError('Could not access microphone');
    }
  }

  function handleThemeChange(key, value) {
    setTheme((prev) => ({ ...prev, [key]: value }));
  }

  function resetTheme() {
    setTheme(defaultTheme);
  }

  function handleVolumeChange(socketId, value) {
    setParticipantVolumes((prev) => ({ ...prev, [socketId]: value }));
    const audio = remoteAudioRef.current[socketId];
    if (audio) {
      audio.volume = value / 100;
    }
  }

  if (!isAuthed) {
    return (
      <main className="auth-wrapper">
        <form className="card" onSubmit={handleAuthSubmit}>
          <h1>WebCord</h1>
          <p className="muted">Self-hosted Discord-like chat</p>
          <div className="row">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Login
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">{mode === 'login' ? 'Login' : 'Create account'}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="chat-layout">
      <aside className="sidebar">
        <h2>WebCord</h2>
        <p>{user?.username}</p>

        <div className="channels-card">
          <h3>Text Channels</h3>
          {textChannels.map((channel) => (
            <button
              key={channel.id}
              className={String(channel.id) === String(channelId) ? 'channel-btn active' : 'channel-btn'}
              onClick={() => selectTextChannel(channel.id)}
            >
              # {channel.name}
            </button>
          ))}

          <h3>Voice Channels</h3>
          {voiceChannels.map((channel) => (
            <button
              key={channel.id}
              className={String(channel.id) === String(voiceChannelId) ? 'channel-btn active' : 'channel-btn'}
              onClick={() => selectVoiceChannel(channel.id)}
            >
              🔊 {channel.name}
            </button>
          ))}

          <form className="channel-form" onSubmit={handleCreateChannel}>
            <input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="New channel"
            />
            <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}>
              <option value="TEXT">TEXT</option>
              <option value="VOICE">VOICE</option>
            </select>
            <button type="submit">+ Create</button>
          </form>
        </div>

        <button onClick={handleJoinVoice}>{voiceJoined ? 'Leave Voice' : `Join Voice${activeVoiceChannel ? `: ${activeVoiceChannel.name}` : ''}`}</button>
        <button onClick={handleLogout} className="danger">
          Logout
        </button>

        <div className="settings-card">
          <h3>Theme</h3>
          <label>
            Background <input type="color" value={theme.bg} onChange={(e) => handleThemeChange('bg', e.target.value)} />
          </label>
          <label>
            Panel <input type="color" value={theme.panel} onChange={(e) => handleThemeChange('panel', e.target.value)} />
          </label>
          <label>
            Accent <input type="color" value={theme.accent} onChange={(e) => handleThemeChange('accent', e.target.value)} />
          </label>
          <label>
            Text <input type="color" value={theme.text} onChange={(e) => handleThemeChange('text', e.target.value)} />
          </label>
          <button onClick={resetTheme}>Reset Theme</button>
        </div>
      </aside>
      <section className="chat-panel">
        <header>{activeTextChannel ? `# ${activeTextChannel.name}` : 'No text channel selected'}</header>
        {voiceJoined && (
          <div className="voice-controls">
            <h3>Voice Users Volume</h3>
            {Object.keys(participantVolumes).length === 0 ? (
              <p className="muted">No remote users yet</p>
            ) : (
              Object.entries(participantVolumes).map(([socketId, volume]) => (
                <label key={socketId} className="volume-row">
                  <span>{socketId.slice(0, 8)}</span>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={volume}
                    onChange={(e) => handleVolumeChange(socketId, Number(e.target.value))}
                  />
                  <span>{volume}%</span>
                </label>
              ))
            )}
          </div>
        )}
        <div className="messages">
          {messages.map((message) => (
            <div key={message.id} className="message">
              <strong>{message.author?.username || 'unknown'}:</strong>
              {message.content ? <span className="message-content"> {message.content}</span> : null}
              {message.attachmentType === 'IMAGE' ? (
                <img className="message-media" src={getAttachmentUrl(message.attachmentUrl)} alt={message.attachmentName || 'image'} />
              ) : null}
              {message.attachmentType === 'VIDEO' ? (
                <video className="message-media" controls src={getAttachmentUrl(message.attachmentUrl)} />
              ) : null}
              {message.attachmentType === 'FILE' ? (
                <a href={getAttachmentUrl(message.attachmentUrl)} download className="file-link">
                  {message.attachmentName || 'file'}
                </a>
              ) : null}
            </div>
          ))}
        </div>
        <form className="message-form" onSubmit={sendMessage}>
          <input ref={fileInputRef} type="file" onChange={handleFileSelect} hidden />
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file">
            📎
          </button>
          <div className="emoji-wrapper">
            <button type="button" onClick={() => setShowEmojiPicker((prev) => !prev)} title="Emoji picker">
              😀
            </button>
            {showEmojiPicker ? (
              <div className="emoji-popover">
                <Picker
                  data={data}
                  theme="dark"
                  onEmojiSelect={(emoji) => {
                    setNewMessage((prev) => `${prev}${emoji.native}`);
                    setShowEmojiPicker(false);
                  }}
                />
              </div>
            ) : null}
          </div>
          <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message" />
          <button type="submit" disabled={uploading || (!newMessage.trim() && !pendingAttachment)}>
            Send
          </button>
        </form>
        {pendingAttachment ? <p className="muted">Attached: {pendingAttachment.name}</p> : null}
        {uploading ? <p className="muted">Uploading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
