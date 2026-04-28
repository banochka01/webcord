const API_URL = localStorage.getItem('webcord_api') || 'https://webcordes.ru/api';
const SOCKET_URL = API_URL.replace(/\/api$/, '');

const state = {
  token: localStorage.getItem('webcord_token') || '',
  user: JSON.parse(localStorage.getItem('webcord_user') || 'null'),
  guilds: [],
  channels: [],
  friends: [],
  messages: [],
  guildId: localStorage.getItem('webcord_guild_id') || '',
  channelId: localStorage.getItem('webcord_channel_id') || '',
  view: 'friends',
  socket: null
};

const els = {
  authModal: document.getElementById('authModal'),
  authError: document.getElementById('authError'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  registerBtn: document.getElementById('registerBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  friendsHome: document.getElementById('friendsHome'),
  friendsBtn: document.getElementById('friendsBtn'),
  guildList: document.getElementById('guildList'),
  textChannelList: document.getElementById('textChannelList'),
  voiceChannelList: document.getElementById('voiceChannelList'),
  serverName: document.getElementById('serverName'),
  accountName: document.getElementById('accountName'),
  viewTitle: document.getElementById('viewTitle'),
  viewSubtitle: document.getElementById('viewSubtitle'),
  refreshBtn: document.getElementById('refreshBtn'),
  friendsView: document.getElementById('friendsView'),
  chatView: document.getElementById('chatView'),
  friendsList: document.getElementById('friendsList'),
  friendForm: document.getElementById('friendForm'),
  friendName: document.getElementById('friendName'),
  channelForm: document.getElementById('channelForm'),
  newChannelName: document.getElementById('newChannelName'),
  newChannelType: document.getElementById('newChannelType'),
  messageList: document.getElementById('messageList'),
  composer: document.getElementById('composer'),
  messageInput: document.getElementById('messageInput'),
  activityList: document.getElementById('activityList'),
  toast: document.getElementById('toast'),
  quickSwitcher: document.getElementById('quickSwitcher'),
  quickInput: document.getElementById('quickInput'),
  quickResults: document.getElementById('quickResults'),
  hotkeys: document.getElementById('hotkeys')
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function initials(name = 'W') {
  return name.trim().slice(0, 2).toUpperCase() || 'W';
}

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fileUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${API_URL}${value}`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 4200);
}

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
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem('webcord_token', payload.token);
  localStorage.setItem('webcord_user', JSON.stringify(payload.user));
}

function clearSession() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('webcord_token');
  localStorage.removeItem('webcord_user');
  state.socket?.disconnect();
  state.socket = null;
}

function connectSocket() {
  state.socket?.disconnect();
  state.socket = io(SOCKET_URL, { path: '/socket.io', auth: { token: state.token }, transports: ['websocket', 'polling'] });
  state.socket.on('connect_error', (err) => toast(err.message || 'Realtime connection failed'));
  state.socket.on('new-message', (message) => {
    if (Number(message.channelId) === Number(state.channelId)) addMessage(message);
  });
  state.socket.on('message-updated', (message) => {
    state.messages = state.messages.map((item) => (item.id === message.id ? message : item));
    renderMessages();
  });
  state.socket.on('message-deleted', ({ id }) => {
    state.messages = state.messages.filter((item) => item.id !== id);
    renderMessages();
  });
  state.socket.on('dm-new-message', (message) => {
    window.desktopNative?.notify('WebCord DM', `${message.author.displayName || message.author.username}: ${message.content}`);
  });
}

function setView(view) {
  state.view = view;
  els.friendsHome.classList.toggle('active', view === 'friends');
  els.friendsBtn.classList.toggle('active', view === 'friends');
  els.friendsView.classList.toggle('hidden', view !== 'friends');
  els.chatView.classList.toggle('hidden', view !== 'chat');
  renderGuilds();
  renderHeader();
}

function renderHeader() {
  const guild = state.guilds.find((item) => Number(item.id) === Number(state.guildId));
  const channel = state.channels.find((item) => Number(item.id) === Number(state.channelId));
  els.serverName.textContent = guild?.name || 'WebCord';
  els.accountName.textContent = state.user?.displayName || state.user?.username || 'Online';
  if (state.view === 'friends') {
    els.viewTitle.textContent = 'Friends';
    els.viewSubtitle.textContent = `${state.friends.length} contacts and requests`;
  } else {
    els.viewTitle.textContent = channel ? `# ${channel.name}` : 'Select a channel';
    els.viewSubtitle.textContent = `${state.messages.length} messages`;
  }
}

function renderGuilds() {
  els.guildList.innerHTML = '';
  state.guilds.forEach((guild) => {
    const button = document.createElement('button');
    button.className = `rail-button ${Number(guild.id) === Number(state.guildId) && state.view === 'chat' ? 'active' : ''}`;
    button.title = guild.name;
    button.textContent = initials(guild.name);
    button.onclick = async () => {
      state.guildId = guild.id;
      localStorage.setItem('webcord_guild_id', guild.id);
      await loadChannels();
      setView('chat');
      renderGuilds();
    };
    els.guildList.appendChild(button);
  });
}

function renderChannels() {
  const render = (root, channels, label) => {
    root.innerHTML = '';
    channels.forEach((channel) => {
      const button = document.createElement('button');
      button.className = `nav-row ${Number(channel.id) === Number(state.channelId) ? 'active' : ''}`;
      button.innerHTML = `<span>${label}</span>${escapeHtml(channel.name)}`;
      button.onclick = async () => {
        if (channel.type === 'TEXT') {
          state.channelId = channel.id;
          localStorage.setItem('webcord_channel_id', channel.id);
          await loadMessages();
          setView('chat');
          renderChannels();
        }
      };
      root.appendChild(button);
    });
  };
  render(els.textChannelList, state.channels.filter((item) => item.type === 'TEXT'), '#');
  render(els.voiceChannelList, state.channels.filter((item) => item.type === 'VOICE'), 'VC');
}

function messageHtml(message) {
  const name = message.author?.displayName || message.author?.username || 'Unknown';
  let attachment = '';
  if (message.attachmentType === 'IMAGE') {
    attachment = `<img src="${escapeHtml(fileUrl(message.attachmentUrl))}" alt="${escapeHtml(message.attachmentName || 'image')}">`;
  } else if (message.attachmentType === 'VIDEO') {
    attachment = `<video src="${escapeHtml(fileUrl(message.attachmentUrl))}" controls></video>`;
  } else if (message.attachmentType === 'FILE') {
    attachment = `<a href="${escapeHtml(fileUrl(message.attachmentUrl))}" download>${escapeHtml(message.attachmentName || 'Download file')}</a>`;
  }
  return `
    <article class="message-card">
      <div class="avatar">${escapeHtml(initials(name))}</div>
      <div class="message-body">
        <div class="message-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(timeLabel(message.createdAt))}</span></div>
        ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ''}
        ${attachment}
      </div>
    </article>`;
}

function renderMessages() {
  els.messageList.innerHTML = state.messages.length
    ? state.messages.map(messageHtml).join('')
    : '<p class="empty">No messages yet. Start the conversation.</p>';
  els.messageList.scrollTo({ top: els.messageList.scrollHeight, behavior: 'smooth' });
  renderHeader();
}

function addMessage(message) {
  if (state.messages.some((item) => item.id === message.id)) return;
  state.messages.push(message);
  renderMessages();
}

function renderFriends() {
  els.friendsList.innerHTML = '';
  if (state.friends.length === 0) {
    els.friendsList.innerHTML = '<p class="empty">Add a friend to start direct conversations.</p>';
  }
  state.friends.forEach((friend) => {
    const name = friend.user.displayName || friend.user.username;
    const card = document.createElement('article');
    card.className = 'friend-card';
    card.innerHTML = `
      <div class="avatar">${escapeHtml(initials(name))}</div>
      <div><strong>${escapeHtml(name)}</strong><span>${friend.status === 'PENDING' ? (friend.isOutgoingRequest ? 'Request sent' : 'Incoming request') : 'Online recently'}</span></div>
    `;
    if (friend.status === 'PENDING' && !friend.isOutgoingRequest) {
      const button = document.createElement('button');
      button.textContent = 'Accept';
      button.onclick = async () => {
        await api(`/friends/${friend.id}/accept`, { method: 'POST' });
        await loadFriends();
      };
      card.appendChild(button);
    }
    els.friendsList.appendChild(card);
  });
  renderActivity();
  renderHeader();
}

function renderActivity() {
  const people = [state.user, ...state.friends.filter((item) => item.status === 'ACCEPTED').map((item) => item.user)].filter(Boolean).slice(0, 6);
  els.activityList.innerHTML = people.map((person) => {
    const name = person.displayName || person.username;
    return `<article class="activity-card"><div class="avatar">${escapeHtml(initials(name))}</div><div><strong>${escapeHtml(name)}</strong><span>Active now</span></div></article>`;
  }).join('');
}

async function loadGuilds() {
  state.guilds = await api('/guilds');
  if (state.guilds.length === 0) {
    state.guilds = [await api('/guilds', { method: 'POST', body: JSON.stringify({ name: 'WebCord' }) })];
  }
  const stored = state.guilds.find((guild) => Number(guild.id) === Number(state.guildId));
  state.guildId = stored?.id || state.guilds[0]?.id || '';
  if (state.guildId) localStorage.setItem('webcord_guild_id', state.guildId);
  renderGuilds();
}

async function loadChannels() {
  if (!state.guildId) return;
  state.channels = await api(`/channels/${state.guildId}`);
  const textChannels = state.channels.filter((item) => item.type === 'TEXT');
  const stored = textChannels.find((channel) => Number(channel.id) === Number(state.channelId));
  state.channelId = stored?.id || textChannels[0]?.id || '';
  if (state.channelId) localStorage.setItem('webcord_channel_id', state.channelId);
  renderChannels();
  if (state.channelId) await loadMessages();
}

async function loadMessages() {
  if (!state.channelId) {
    state.messages = [];
    renderMessages();
    return;
  }
  state.socket?.emit('join-channel', { channelId: Number(state.channelId) });
  state.messages = await api(`/messages/${state.channelId}`);
  renderMessages();
}

async function loadFriends() {
  state.friends = await api('/friends');
  renderFriends();
}

async function boot() {
  try {
    if (!state.token) {
      els.authModal.showModal();
      return;
    }
    els.authModal.close();
    state.user = await api('/me');
    localStorage.setItem('webcord_user', JSON.stringify(state.user));
    connectSocket();
    await loadGuilds();
    await loadChannels();
    await loadFriends();
    setView(state.channelId ? 'chat' : 'friends');
  } catch (err) {
    clearSession();
    els.authModal.showModal();
    els.authError.textContent = err.message;
  }
}

async function auth(mode) {
  try {
    els.authError.textContent = '';
    const payload = await api(`/${mode}`, {
      method: 'POST',
      body: JSON.stringify({ username: els.username.value.trim(), password: els.password.value })
    });
    setSession(payload);
    await boot();
  } catch (err) {
    els.authError.textContent = err.message;
  }
}

els.loginBtn.onclick = () => auth('login');
els.registerBtn.onclick = () => auth('register');
els.logoutBtn.onclick = () => {
  clearSession();
  els.authModal.showModal();
};
els.friendsHome.onclick = () => setView('friends');
els.friendsBtn.onclick = () => setView('friends');
els.refreshBtn.onclick = () => boot().catch((err) => toast(err.message));

els.friendForm.onsubmit = async (event) => {
  event.preventDefault();
  const username = els.friendName.value.trim();
  if (!username) return;
  try {
    await api('/friends/request', { method: 'POST', body: JSON.stringify({ username }) });
    els.friendName.value = '';
    await loadFriends();
  } catch (err) {
    toast(err.message);
  }
};

els.channelForm.onsubmit = async (event) => {
  event.preventDefault();
  const name = els.newChannelName.value.trim();
  if (!name || !state.guildId) return;
  try {
    const channel = await api('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, type: els.newChannelType.value, guildId: Number(state.guildId) })
    });
    state.channels.push(channel);
    els.newChannelName.value = '';
    if (channel.type === 'TEXT') {
      state.channelId = channel.id;
      localStorage.setItem('webcord_channel_id', channel.id);
      await loadMessages();
      setView('chat');
    }
    renderChannels();
  } catch (err) {
    toast(err.message);
  }
};

els.composer.onsubmit = async (event) => {
  event.preventDefault();
  const content = els.messageInput.value.trim();
  if (!content || !state.channelId) return;
  const payload = { channelId: Number(state.channelId), content };
  if (state.socket?.connected) {
    state.socket.emit('send-message', payload);
  } else {
    addMessage(await api('/messages', { method: 'POST', body: JSON.stringify(payload) }));
  }
  els.messageInput.value = '';
};

window.desktopNative?.onShortcut((key) => {
  if (key === 'quick-switcher') {
    els.quickSwitcher.showModal();
    els.quickInput.value = '';
    els.quickResults.innerHTML = '';
    els.quickInput.focus();
  }
  if (key === 'hotkeys') els.hotkeys.showModal();
  if (key === 'escape') {
    els.quickSwitcher.close();
    els.hotkeys.close();
  }
});

els.quickInput.oninput = () => {
  const q = els.quickInput.value.toLowerCase();
  const items = [
    ...state.guilds.map((item) => ({ ...item, kind: 'server' })),
    ...state.channels.map((item) => ({ ...item, kind: 'channel' }))
  ].filter((item) => (item.name || '').toLowerCase().includes(q));
  els.quickResults.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'quick-item';
    row.textContent = `${item.kind === 'server' ? 'Server' : item.type === 'VOICE' ? 'Voice' : 'Channel'}: ${item.name}`;
    row.onclick = async () => {
      if (item.kind === 'server') {
        state.guildId = item.id;
        localStorage.setItem('webcord_guild_id', item.id);
        await loadChannels();
      } else if (item.type === 'TEXT') {
        state.channelId = item.id;
        localStorage.setItem('webcord_channel_id', item.id);
        await loadMessages();
      }
      setView('chat');
      els.quickSwitcher.close();
    };
    els.quickResults.appendChild(row);
  });
};

boot();
