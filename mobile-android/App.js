import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { io } from 'socket.io-client';

const API_URL = 'https://webcordes.ru/api';
const SOCKET_URL = 'https://webcordes.ru';
const TOKEN_KEY = 'webcord_token';

const THEMES = [
  { id: 'telegram', name: 'Telegram Night', bg: '#17212b', panel: '#202c38', bubble: '#2b5278', accent: '#2f80ed', text: '#ffffff', muted: '#93a4b7' },
  { id: 'discord', name: 'Discord Ash', bg: '#1e1f22', panel: '#2b2d31', bubble: '#383a40', accent: '#5865f2', text: '#f2f3f5', muted: '#b5bac1' },
  { id: 'oled', name: 'OLED', bg: '#000000', panel: '#101012', bubble: '#1c1c20', accent: '#4f8cff', text: '#ffffff', muted: '#a6a6ad' },
  { id: 'mint', name: 'Mint', bg: '#101817', panel: '#172523', bubble: '#1d302d', accent: '#34d399', text: '#effffc', muted: '#a8c8c2' },
  { id: 'ruby', name: 'Ruby', bg: '#170d18', panel: '#251428', bubble: '#3e2343', accent: '#d946ef', text: '#fff1ff', muted: '#c9a5cf' }
];

async function api(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'API request failed');
  return data;
}

function assetUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `https://webcordes.ru${value}`;
}

function initials(name = 'W') {
  return name.trim().slice(0, 2).toUpperCase() || 'W';
}

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ person, theme, size = 52 }) {
  const name = person?.displayName || person?.username || 'W';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent }]}>
      {person?.avatarUrl ? <Image source={{ uri: assetUrl(person.avatarUrl) }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(name)}</Text>}
    </View>
  );
}

function AuthScreen({ onAuth, loading, theme }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [intro]);

  async function submit() {
    if (!username.trim() || !password) return;
    setError('');
    try {
      const payload = await api(`/${mode}`, { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
      await onAuth(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Animated.View style={[styles.authWrap, { opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
      <View style={[styles.logo, { backgroundColor: theme.accent }]}><Text style={styles.logoText}>WC</Text></View>
      <Text style={[styles.authTitle, { color: theme.text }]}>WebCord</Text>
      <Text style={[styles.authSub, { color: theme.muted }]}>Chats, friends, channels, profile and media.</Text>
      <View style={[styles.segment, { backgroundColor: theme.panel }]}>
        <Pressable style={[styles.segmentButton, mode === 'login' && { backgroundColor: theme.accent }]} onPress={() => setMode('login')}><Text style={styles.segmentText}>Sign in</Text></Pressable>
        <Pressable style={[styles.segmentButton, mode === 'register' && { backgroundColor: theme.accent }]} onPress={() => setMode('register')}><Text style={styles.segmentText}>Register</Text></Pressable>
      </View>
      <TextInput style={[styles.authInput, { backgroundColor: theme.panel, color: theme.text }]} placeholder="Username" placeholderTextColor={theme.muted} value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={[styles.authInput, { backgroundColor: theme.panel, color: theme.text }]} placeholder="Password" placeholderTextColor={theme.muted} secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Enter WebCord' : 'Create account'}</Text>}
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [themeId, setThemeId] = useState('telegram');
  const theme = THEMES.find((item) => item.id === themeId) || THEMES[0];
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [channels, setChannels] = useState([]);
  const [friends, setFriends] = useState([]);
  const [messages, setMessages] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [channelId, setChannelId] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState('list');
  const [profileDraft, setProfileDraft] = useState({ displayName: '', statusText: '', bio: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const channelIdRef = useRef(null);

  const activeGuild = guilds.find((guild) => Number(guild.id) === Number(guildId));
  const activeChannel = channels.find((channel) => Number(channel.id) === Number(channelId));
  const textChannels = channels.filter((channel) => channel.type === 'TEXT');
  const voiceChannels = channels.filter((channel) => channel.type === 'VOICE');

  const chatItems = useMemo(() => {
    const channelItems = textChannels.map((channel) => ({
      id: `channel-${channel.id}`,
      kind: 'channel',
      channel,
      title: `# ${channel.name}`,
      subtitle: activeGuild?.name || 'Server'
    }));
    const voiceItems = voiceChannels.map((channel) => ({
      id: `voice-${channel.id}`,
      kind: 'voice',
      channel,
      title: `Voice: ${channel.name}`,
      subtitle: 'Tap to open voice preview'
    }));
    const friendItems = friends.map((friend) => ({
      id: `friend-${friend.id}`,
      kind: 'friend',
      friend,
      title: friend.user.displayName || friend.user.username,
      subtitle: friend.status === 'PENDING' ? 'Friend request' : (friend.user.statusText || 'Friend')
    }));
    return [...channelItems, ...voiceItems, ...friendItems].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  }, [activeGuild, friends, query, textChannels, voiceChannels]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((stored) => { if (stored) setToken(stored); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { channelIdRef.current = channelId; }, [channelId]);
  useEffect(() => {
    setProfileDraft({ displayName: user?.displayName || user?.username || '', statusText: user?.statusText || '', bio: user?.bio || '' });
  }, [user]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;
    socket.on('new-message', (message) => {
      if (Number(message.channelId) === Number(channelIdRef.current)) {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
      }
    });
    socket.on('connect_error', (err) => setError(err.message || 'Realtime connection failed'));
    return () => socket.disconnect();
  }, [token]);

  useEffect(() => { if (token) loadWorkspace().catch((err) => setError(err.message)); }, [token]);
  useEffect(() => { if (token && guildId) loadChannels(guildId).catch((err) => setError(err.message)); }, [token, guildId]);
  useEffect(() => { if (token && channelId) loadMessages(channelId).catch((err) => setError(err.message)); }, [token, channelId]);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [me, loadedGuilds, loadedFriends] = await Promise.all([api('/me', {}, token), api('/guilds', {}, token), api('/friends', {}, token)]);
      setUser(me);
      setFriends(loadedFriends);
      setGuilds(loadedGuilds);
      if (loadedGuilds[0]) setGuildId((prev) => prev || loadedGuilds[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function loadChannels(nextGuildId) {
    const loadedChannels = await api(`/channels/${nextGuildId}`, {}, token);
    setChannels(loadedChannels);
    const firstText = loadedChannels.find((channel) => channel.type === 'TEXT');
    if (firstText && !channelId) setChannelId(firstText.id);
  }

  async function loadMessages(nextChannelId) {
    socketRef.current?.emit('join-channel', { channelId: Number(nextChannelId) });
    setMessages(await api(`/messages/${nextChannelId}`, {}, token));
  }

  async function uploadPickedImage(field) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Gallery permission is required');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.88 });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    const form = new FormData();
    form.append('file', {
      uri: asset.uri,
      name: asset.fileName || `${field || 'image'}.jpg`,
      type: asset.mimeType || 'image/jpeg'
    });
    return api('/upload', { method: 'POST', body: form }, token);
  }

  async function sendPhoto() {
    const uploaded = await uploadPickedImage('photo');
    if (!uploaded || !channelId) return;
    const payload = { channelId: Number(channelId), content: messageInput.trim(), attachmentUrl: uploaded.url, attachmentType: uploaded.type, attachmentName: uploaded.name };
    if (socketRef.current?.connected) socketRef.current.emit('send-message', payload);
    else {
      const created = await api('/messages', { method: 'POST', body: JSON.stringify(payload) }, token);
      setMessages((prev) => [...prev, created]);
    }
    setMessageInput('');
  }

  async function sendMessage() {
    const content = messageInput.trim();
    if (!content || !channelId) return;
    const payload = { channelId: Number(channelId), content };
    if (socketRef.current?.connected) socketRef.current.emit('send-message', payload);
    else {
      const created = await api('/messages', { method: 'POST', body: JSON.stringify(payload) }, token);
      setMessages((prev) => [...prev, created]);
    }
    setMessageInput('');
  }

  async function saveProfile() {
    const updated = await api('/me', { method: 'PATCH', body: JSON.stringify(profileDraft) }, token);
    setUser(updated);
  }

  async function changeProfileImage(field) {
    const uploaded = await uploadPickedImage(field);
    if (!uploaded) return;
    const updated = await api('/me', { method: 'PATCH', body: JSON.stringify({ ...profileDraft, [field]: uploaded.url }) }, token);
    setUser(updated);
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken('');
    setUser(null);
    setMessages([]);
    setScreen('list');
  }

  if (!token) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style="light" />
        <AuthScreen theme={theme} loading={loading} onAuth={async (payload) => { await SecureStore.setItemAsync(TOKEN_KEY, payload.token); setUser(payload.user); setToken(payload.token); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {screen === 'list' ? (
          <View style={styles.listScreen}>
            <View style={styles.header}>
              <View><Text style={[styles.headerTitle, { color: theme.text }]}>WebCord</Text><Text style={[styles.headerSub, { color: theme.muted }]}>{user?.displayName || user?.username}</Text></View>
              <Pressable onPress={() => setScreen('settings')}><Avatar person={user} theme={theme} size={44} /></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serverStrip} contentContainerStyle={styles.serverStripInner}>
              {guilds.map((guild) => (
                <Pressable key={guild.id} onPress={() => setGuildId(guild.id)} style={[styles.serverPill, { backgroundColor: Number(guild.id) === Number(guildId) ? theme.accent : theme.panel }]}>
                  <Text style={styles.serverPillText}>{initials(guild.name)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput style={[styles.search, { backgroundColor: theme.panel, color: theme.text }]} value={query} onChangeText={setQuery} placeholder="Search channels and friends" placeholderTextColor={theme.muted} />
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading ? <ActivityIndicator color={theme.accent} style={styles.loader} /> : null}
            <FlatList
              data={chatItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.chatItem}
                  onPress={() => {
                    if (item.kind === 'channel') { setChannelId(item.channel.id); setScreen('chat'); }
                    if (item.kind === 'voice') { setChannelId(item.channel.id); setScreen('voice'); }
                  }}
                >
                  <View style={[styles.chatAvatar, { backgroundColor: item.kind === 'friend' ? theme.bubble : theme.accent }]}><Text style={styles.chatAvatarText}>{item.kind === 'voice' ? 'VC' : initials(item.title.replace('#', ''))}</Text></View>
                  <View style={styles.chatMeta}><Text style={[styles.chatTitle, { color: theme.text }]}>{item.title}</Text><Text style={[styles.chatSub, { color: theme.muted }]}>{item.subtitle}</Text></View>
                  <Text style={[styles.chevron, { color: theme.accent }]}>Open</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={[styles.empty, { color: theme.muted }]}>No chats yet.</Text>}
            />
          </View>
        ) : null}

        {screen === 'chat' ? (
          <View style={styles.chatScreen}>
            <View style={[styles.chatHeader, { backgroundColor: theme.bg, borderBottomColor: theme.panel }]}>
              <Pressable onPress={() => setScreen('list')} style={styles.backButton}><Text style={[styles.backText, { color: theme.accent }]}>Back</Text></Pressable>
              <View style={styles.chatHeaderTitleWrap}><Text style={[styles.chatHeaderTitle, { color: theme.text }]}>{activeChannel ? `# ${activeChannel.name}` : 'Channel'}</Text><Text style={[styles.chatHeaderSub, { color: theme.muted }]}>{messages.length} messages</Text></View>
            </View>
            <FlatList
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messages}
              renderItem={({ item }) => {
                const own = Number(item.author?.id) === Number(user?.id);
                return (
                  <View style={[styles.bubbleRow, own && styles.bubbleRowOwn]}>
                    {!own && <Avatar person={item.author} theme={theme} size={30} />}
                    <View style={[styles.bubble, { backgroundColor: own ? theme.bubble : theme.panel }, own ? styles.ownBubble : styles.otherBubble]}>
                      {!own && <Text style={[styles.author, { color: theme.accent }]}>{item.author?.displayName || item.author?.username}</Text>}
                      {!!item.content && <Text style={[styles.messageText, { color: theme.text }]}>{item.content}</Text>}
                      {item.attachmentType === 'IMAGE' && <Image source={{ uri: assetUrl(item.attachmentUrl) }} style={styles.messageImage} />}
                      <Text style={[styles.messageTime, { color: theme.muted }]}>{timeLabel(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={[styles.empty, { color: theme.muted }]}>No messages yet.</Text>}
            />
            <View style={[styles.composer, { backgroundColor: theme.bg, borderTopColor: theme.panel }]}>
              <Pressable style={[styles.photoButton, { backgroundColor: theme.panel }]} onPress={sendPhoto}><Text style={{ color: theme.accent, fontWeight: '900' }}>+</Text></Pressable>
              <TextInput value={messageInput} onChangeText={setMessageInput} placeholder="Message" placeholderTextColor={theme.muted} style={[styles.messageInput, { backgroundColor: theme.panel, color: theme.text }]} multiline />
              <Pressable style={[styles.sendButton, { backgroundColor: theme.accent }]} onPress={sendMessage}><Text style={styles.sendText}>Send</Text></Pressable>
            </View>
          </View>
        ) : null}

        {screen === 'voice' ? (
          <View style={styles.chatScreen}>
            <View style={[styles.chatHeader, { backgroundColor: theme.bg, borderBottomColor: theme.panel }]}><Pressable onPress={() => setScreen('list')} style={styles.backButton}><Text style={[styles.backText, { color: theme.accent }]}>Back</Text></Pressable><Text style={[styles.chatHeaderTitle, { color: theme.text }]}>Voice Preview</Text></View>
            <View style={styles.mobileVoiceStage}><Avatar person={user} theme={theme} size={100} /><Text style={[styles.headerTitle, { color: theme.text, fontSize: 24 }]}>Voice channel</Text><Text style={[styles.headerSub, { color: theme.muted }]}>Camera and screen share controls are available in desktop/web.</Text></View>
          </View>
        ) : null}

        {screen === 'settings' ? (
          <ScrollView style={styles.listScreen} contentContainerStyle={styles.settingsContent}>
            <View style={styles.header}><Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text><Pressable onPress={() => setScreen('list')}><Text style={[styles.backText, { color: theme.accent }]}>Done</Text></Pressable></View>
            <View style={[styles.profileCard, { backgroundColor: theme.panel }]}>
              {user?.bannerUrl ? <Image source={{ uri: assetUrl(user.bannerUrl) }} style={styles.banner} /> : <View style={[styles.banner, { backgroundColor: theme.accent }]} />}
              <Avatar person={user} theme={theme} size={78} />
              <Text style={[styles.chatTitle, { color: theme.text, marginTop: 8 }]}>{user?.displayName || user?.username}</Text>
              <Text style={[styles.chatSub, { color: theme.muted }]}>@{user?.username}</Text>
              <View style={styles.profileButtons}><Pressable onPress={() => changeProfileImage('avatarUrl')}><Text style={[styles.chevron, { color: theme.accent }]}>Avatar</Text></Pressable><Pressable onPress={() => changeProfileImage('bannerUrl')}><Text style={[styles.chevron, { color: theme.accent }]}>Banner</Text></Pressable></View>
            </View>
            <TextInput style={[styles.authInput, { backgroundColor: theme.panel, color: theme.text }]} value={profileDraft.displayName} onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, displayName: value }))} placeholder="Display name" placeholderTextColor={theme.muted} />
            <TextInput style={[styles.authInput, { backgroundColor: theme.panel, color: theme.text }]} value={profileDraft.statusText} onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, statusText: value }))} placeholder="Status" placeholderTextColor={theme.muted} />
            <TextInput style={[styles.bioInput, { backgroundColor: theme.panel, color: theme.text }]} value={profileDraft.bio} onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, bio: value }))} placeholder="About me" placeholderTextColor={theme.muted} multiline />
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={saveProfile}><Text style={styles.primaryText}>Save Profile</Text></Pressable>
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>Themes</Text>
            {THEMES.map((item) => <Pressable key={item.id} onPress={() => setThemeId(item.id)} style={[styles.themeRow, { backgroundColor: item.panel }]}><View style={[styles.themeDot, { backgroundColor: item.accent }]} /><Text style={{ color: item.text, fontWeight: '800' }}>{item.name}</Text></Pressable>)}
            <Pressable style={[styles.primaryButton, { backgroundColor: '#f23f42', marginTop: 12 }]} onPress={logout}><Text style={styles.primaryText}>Logout</Text></Pressable>
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  authWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  authTitle: { fontSize: 34, fontWeight: '900', marginBottom: 6 },
  authSub: { fontSize: 15, marginBottom: 22, lineHeight: 22 },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 14 },
  segmentButton: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: '#fff', fontWeight: '800' },
  authInput: { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, marginBottom: 10, fontSize: 16 },
  bioInput: { minHeight: 100, borderRadius: 14, padding: 16, marginBottom: 10, fontSize: 16, textAlignVertical: 'top' },
  primaryButton: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 32, fontWeight: '900' },
  headerSub: { marginTop: 2 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900' },
  listScreen: { flex: 1 },
  serverStrip: { maxHeight: 60 },
  serverStripInner: { paddingHorizontal: 14, gap: 10 },
  serverPill: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  serverPillText: { color: '#fff', fontWeight: '900' },
  search: { height: 46, marginHorizontal: 18, marginBottom: 8, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 },
  chatList: { paddingHorizontal: 10, paddingBottom: 24 },
  chatItem: { minHeight: 72, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  chatAvatarText: { color: '#fff', fontWeight: '900' },
  chatMeta: { flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 16, fontWeight: '900' },
  chatSub: { marginTop: 4 },
  chevron: { fontWeight: '800' },
  chatScreen: { flex: 1 },
  chatHeader: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  backButton: { height: 38, paddingHorizontal: 10, justifyContent: 'center' },
  backText: { fontWeight: '800' },
  chatHeaderTitleWrap: { flex: 1, alignItems: 'center', paddingRight: 48 },
  chatHeaderTitle: { fontSize: 17, fontWeight: '900' },
  chatHeaderSub: { fontSize: 12, marginTop: 2 },
  messages: { paddingHorizontal: 10, paddingVertical: 14 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  ownBubble: { borderBottomRightRadius: 6 },
  otherBubble: { borderBottomLeftRadius: 6 },
  author: { fontWeight: '900', marginBottom: 2 },
  messageText: { fontSize: 16, lineHeight: 22 },
  messageImage: { width: 220, height: 220, borderRadius: 14, marginTop: 6 },
  messageTime: { alignSelf: 'flex-end', fontSize: 11, marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1 },
  photoButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  messageInput: { flex: 1, maxHeight: 120, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16 },
  sendButton: { minWidth: 64, height: 44, marginLeft: 8, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '900' },
  mobileVoiceStage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  settingsContent: { paddingBottom: 32 },
  profileCard: { margin: 18, borderRadius: 18, padding: 14, overflow: 'hidden' },
  banner: { height: 110, borderRadius: 14, marginBottom: -28 },
  profileButtons: { flexDirection: 'row', gap: 18, marginTop: 12 },
  sectionLabel: { marginHorizontal: 18, marginTop: 18, marginBottom: 8, fontWeight: '900' },
  themeRow: { height: 54, marginHorizontal: 18, marginBottom: 8, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  themeDot: { width: 26, height: 26, borderRadius: 13 },
  error: { color: '#ffb4b4', marginHorizontal: 18, marginBottom: 8 },
  loader: { marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 36 }
});
