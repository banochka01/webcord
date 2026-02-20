import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const CHANNEL_ID_KEY = 'webcord_channel_id';
const GUILD_ID_KEY = 'webcord_guild_id';

async function apiFetch(path, options = {}, token) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

export default function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('webcord_token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('webcord_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [channelId, setChannelId] = useState(() => localStorage.getItem(CHANNEL_ID_KEY) || '');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const [voiceJoined, setVoiceJoined] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef({});

  const isAuthed = Boolean(token && user);

  const peerConfig = useMemo(
    () => ({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }),
    []
  );

  useEffect(() => {
    if (!isAuthed || !channelId) {
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

    const socket = io(API_URL, {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      setError(err.message || 'Socket connection failed');
    });

    socket.on('new-message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('voice-participants', async (participants) => {
      for (const socketId of participants) {
        await createPeerAndOffer(socketId);
      }
    });

    socket.on('voice-user-joined', async ({ socketId }) => {
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
        channelId,
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
  }, [API_URL, isAuthed, token, channelId, peerConfig]);

  useEffect(() => {
    if (socketRef.current && channelId) {
      socketRef.current.emit('join-channel', { channelId: Number(channelId) });
    }
  }, [channelId]);

  async function ensureDefaultGuildAndChannel(authToken) {
    let guild = localStorage.getItem(GUILD_ID_KEY);
    let channel = localStorage.getItem(CHANNEL_ID_KEY);

    if (!guild) {
      const createdGuild = await apiFetch(
        '/guilds',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Global Guild' })
        },
        authToken
      );
      guild = String(createdGuild.id);
      localStorage.setItem(GUILD_ID_KEY, guild);
    }

    if (!channel) {
      const createdChannel = await apiFetch(
        '/channels',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'general', guildId: Number(guild) })
        },
        authToken
      );
      channel = String(createdChannel.id);
      localStorage.setItem(CHANNEL_ID_KEY, channel);
    }

    setChannelId(channel);
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

  async function sendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current || !channelId) {
      return;
    }

    socketRef.current.emit('send-message', {
      channelId: Number(channelId),
      content: newMessage
    });
    setNewMessage('');
  }

  async function getOrCreatePeer(remoteSocketId) {
    if (peersRef.current[remoteSocketId]) {
      return peersRef.current[remoteSocketId];
    }

    const peer = new RTCPeerConnection(peerConfig);
    peersRef.current[remoteSocketId] = peer;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('voice-ice-candidate', {
          channelId: Number(channelId),
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
    };

    return peer;
  }

  async function createPeerAndOffer(remoteSocketId) {
    if (!voiceJoined || !localStreamRef.current || !socketRef.current) {
      return;
    }
    const peer = await getOrCreatePeer(remoteSocketId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socketRef.current.emit('voice-offer', {
      channelId: Number(channelId),
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
    try {
      if (voiceJoined) {
        cleanupVoice();
        setVoiceJoined(false);
        return;
      }

      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceJoined(true);
      socketRef.current?.emit('join-voice', { channelId: Number(channelId) });
    } catch {
      setError('Could not access microphone');
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
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
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
        <p className="muted">#general</p>
        <button onClick={handleJoinVoice}>{voiceJoined ? 'Leave Voice' : 'Join Voice'}</button>
        <button onClick={handleLogout} className="danger">
          Logout
        </button>
      </aside>
      <section className="chat-panel">
        <header>Global Channel</header>
        <div className="messages">
          {messages.map((message) => (
            <div key={message.id} className="message">
              <strong>{message.author?.username || 'unknown'}:</strong> {message.content}
            </div>
          ))}
        </div>
        <form className="message-form" onSubmit={sendMessage}>
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message"
          />
          <button type="submit">Send</button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
