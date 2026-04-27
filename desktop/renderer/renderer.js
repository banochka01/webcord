const API_URL = localStorage.getItem('webcord_api') || 'https://webcordes.ru/api';
const SOCKET_URL = 'https://webcordes.ru';

const state = {
  token: localStorage.getItem('webcord_token') || '',
  user: JSON.parse(localStorage.getItem('webcord_user') || 'null'),
  guilds: [],
  channels: [],
  friends: [],
  channelId: null,
  guildId: null,
  socket: null
};

const authModal = document.getElementById('authModal');
const authError = document.getElementById('authError');

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io(SOCKET_URL, { path: '/socket.io', auth: { token: state.token } });

  state.socket.on('new-message', (msg) => {
    if (Number(msg.channelId) === Number(state.channelId)) addMessage(msg);
  });

  state.socket.on('presence-updated', ({ userId, online }) => {
    const item = document.querySelector(`[data-friend-id="${userId}"]`);
    if (item) item.querySelector('.presence').textContent = online ? '🟢' : '⚫';
  });

  state.socket.on('dm-new-message', (msg) => {
    window.desktopNative?.notify('Webcord DM', `${msg.author.displayName || msg.author.username}: ${msg.content}`);
  });
}

function renderList(el, items, onClick, activeId) {
  el.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = `item ${Number(activeId) === Number(item.id) ? 'active' : ''}`;
    div.textContent = item.name || item.username || item.displayName;
    div.onclick = () => onClick(item);
    el.appendChild(div);
  });
}

function addMessage(m) {
  const root = document.getElementById('messageList');
  const node = document.createElement('div');
  node.className = 'msg';
  node.innerHTML = `<strong>${m.author.displayName || m.author.username}</strong><div>${m.content}</div>`;
  root.appendChild(node);
  root.scrollTop = root.scrollHeight;
}

async function loadGuilds() {
  state.guilds = await api('/guilds');
  renderList(document.getElementById('guildList'), state.guilds, async (g) => {
    state.guildId = g.id;
    await loadChannels();
  }, state.guildId);

  if (!state.guildId && state.guilds[0]) {
    state.guildId = state.guilds[0].id;
    await loadChannels();
  }
}

async function loadChannels() {
  state.channels = await api(`/channels/${state.guildId}`);
  renderList(document.getElementById('channelList'), state.channels, async (c) => {
    state.channelId = c.id;
    document.getElementById('chatHeader').textContent = `${c.name}`;
    await loadMessages();
    state.socket.emit('join-channel', { channelId: c.id });
  }, state.channelId);

  if (!state.channelId && state.channels[0]) {
    state.channelId = state.channels[0].id;
    await loadMessages();
    state.socket.emit('join-channel', { channelId: state.channelId });
  }
}

async function loadMessages() {
  const messages = await api(`/messages/${state.channelId}`);
  const root = document.getElementById('messageList');
  root.innerHTML = '';
  messages.forEach(addMessage);
}

async function loadFriends() {
  state.friends = await api('/friends');
  const root = document.getElementById('friendsList');
  root.innerHTML = '';
  state.friends.forEach((f) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.dataset.friendId = f.user.id;
    div.innerHTML = `<span class="presence">⚫</span> ${f.user.displayName || f.user.username} (${f.status})`;
    root.appendChild(div);
  });
}

async function boot() {
  if (!state.token) {
    authModal.showModal();
    return;
  }

  authModal.close();
  connectSocket();
  await loadGuilds();
  await loadFriends();
}

document.getElementById('loginBtn').onclick = async () => {
  try {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const payload = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem('webcord_token', payload.token);
    localStorage.setItem('webcord_user', JSON.stringify(payload.user));
    await boot();
  } catch (e) {
    authError.textContent = e.message;
  }
};

document.getElementById('registerBtn').onclick = async () => {
  try {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const payload = await api('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem('webcord_token', payload.token);
    localStorage.setItem('webcord_user', JSON.stringify(payload.user));
    await boot();
  } catch (e) {
    authError.textContent = e.message;
  }
};

document.getElementById('composer').onsubmit = async (e) => {
  e.preventDefault();
  if (!state.channelId) return;
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content) return;

  await api('/messages', { method: 'POST', body: JSON.stringify({ channelId: state.channelId, content }) });
  input.value = '';
};

const quickSwitcher = document.getElementById('quickSwitcher');
const quickInput = document.getElementById('quickInput');
const quickResults = document.getElementById('quickResults');
const hotkeys = document.getElementById('hotkeys');

window.desktopNative?.onShortcut((key) => {
  if (key === 'quick-switcher') {
    quickSwitcher.showModal();
    quickInput.focus();
  }
  if (key === 'hotkeys') hotkeys.showModal();
  if (key === 'escape') {
    quickSwitcher.close();
    hotkeys.close();
  }
});

quickInput.oninput = () => {
  const q = quickInput.value.toLowerCase();
  const items = [...state.guilds, ...state.channels].filter((x) => (x.name || '').toLowerCase().includes(q));
  quickResults.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.textContent = item.name;
    div.onclick = async () => {
      if (state.guilds.find((g) => g.id === item.id)) {
        state.guildId = item.id;
        state.channelId = null;
        await loadChannels();
      } else {
        state.channelId = item.id;
        await loadMessages();
      }
      quickSwitcher.close();
    };
    quickResults.appendChild(div);
  });
};

boot();
