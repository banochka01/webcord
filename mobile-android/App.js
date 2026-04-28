import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { io } from 'socket.io-client';

const API_URL = 'https://webcordes.ru/api';
const SOCKET_URL = 'https://webcordes.ru';
const TOKEN_KEY = 'webcord_token';

async function api(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'API request failed');
  return data;
}

function initials(name = 'W') {
  return name.trim().slice(0, 2).toUpperCase() || 'W';
}

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AuthScreen({ onAuth, loading }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [intro]);

  async function submit() {
    if (!username.trim() || !password) return;
    setError('');
    try {
      const payload = await api(`/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password })
      });
      await onAuth(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Animated.View
      style={[
        styles.authWrap,
        {
          opacity: intro,
          transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
        }
      ]}
    >
      <View style={styles.logo}><Text style={styles.logoText}>WC</Text></View>
      <Text style={styles.authTitle}>WebCord</Text>
      <Text style={styles.authSub}>Secure chats, channels, and realtime messages.</Text>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton, mode === 'login' && styles.segmentActive]} onPress={() => setMode('login')}>
          <Text style={styles.segmentText}>Sign in</Text>
        </Pressable>
        <Pressable style={[styles.segmentButton, mode === 'register' && styles.segmentActive]} onPress={() => setMode('register')}>
          <Text style={styles.segmentText}>Register</Text>
        </Pressable>
      </View>
      <TextInput style={styles.authInput} placeholder="Username" placeholderTextColor="#8e96a3" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={styles.authInput} placeholder="Password" placeholderTextColor="#8e96a3" secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.primaryButton} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Enter WebCord' : 'Create account'}</Text>}
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const channelIdRef = useRef(null);
  const listFade = useRef(new Animated.Value(0)).current;

  const activeChannel = useMemo(
    () => channels.find((channel) => Number(channel.id) === Number(channelId)),
    [channels, channelId]
  );

  const chatItems = useMemo(() => {
    const channelItems = channels
      .filter((channel) => channel.type === 'TEXT')
      .map((channel) => ({
        id: `channel-${channel.id}`,
        kind: 'channel',
        channel,
        title: `# ${channel.name}`,
        subtitle: guilds.find((guild) => Number(guild.id) === Number(guildId))?.name || 'Server'
      }));
    const friendItems = friends
      .filter((friend) => friend.status === 'ACCEPTED')
      .map((friend) => ({
        id: `friend-${friend.user.id}`,
        kind: 'friend',
        title: friend.user.displayName || friend.user.username,
        subtitle: 'Direct messages coming soon'
      }));
    return [...channelItems, ...friendItems].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  }, [channels, friends, guilds, guildId, query]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((stored) => {
        if (stored) setToken(stored);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    channelIdRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    Animated.timing(listFade, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [listFade, screen]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    socketRef.current = socket;
    socket.on('new-message', (message) => {
      if (Number(message.channelId) === Number(channelIdRef.current)) {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
      }
    });
    socket.on('connect_error', (err) => setError(err.message || 'Realtime connection failed'));
    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadWorkspace().catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!token || !guildId) return;
    loadChannels(guildId).catch((err) => setError(err.message));
  }, [token, guildId]);

  useEffect(() => {
    if (!token || !channelId) return;
    loadMessages(channelId).catch((err) => setError(err.message));
  }, [token, channelId]);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [me, loadedGuilds, loadedFriends] = await Promise.all([
        api('/me', {}, token),
        api('/guilds', {}, token),
        api('/friends', {}, token)
      ]);
      setUser(me);
      setFriends(loadedFriends);
      setGuilds(loadedGuilds);
      if (loadedGuilds[0]) setGuildId(loadedGuilds[0].id);
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
    const loadedMessages = await api(`/messages/${nextChannelId}`, {}, token);
    setMessages(loadedMessages);
  }

  async function sendMessage() {
    const content = messageInput.trim();
    if (!content || !channelId) return;
    const payload = { channelId: Number(channelId), content };
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-message', payload);
    } else {
      const created = await api('/messages', { method: 'POST', body: JSON.stringify(payload) }, token);
      setMessages((prev) => [...prev, created]);
    }
    setMessageInput('');
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
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <AuthScreen
          loading={loading}
          onAuth={async (payload) => {
            await SecureStore.setItemAsync(TOKEN_KEY, payload.token);
            setUser(payload.user);
            setToken(payload.token);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {screen === 'list' ? (
          <Animated.View style={[styles.listScreen, { opacity: listFade }]}>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Chats</Text>
                <Text style={styles.headerSub}>{user?.displayName || user?.username || 'WebCord'}</Text>
              </View>
              <Pressable onPress={logout} style={styles.iconButton}><Text style={styles.iconText}>Exit</Text></Pressable>
            </View>

            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#8e96a3"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading ? <ActivityIndicator color="#5e8cff" style={styles.loader} /> : null}

            <FlatList
              data={chatItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.chatItem}
                  onPress={() => {
                    if (item.kind === 'channel') {
                      setChannelId(item.channel.id);
                      setScreen('chat');
                    }
                  }}
                >
                  <View style={styles.chatAvatar}><Text style={styles.chatAvatarText}>{initials(item.title.replace('#', ''))}</Text></View>
                  <View style={styles.chatMeta}>
                    <Text style={styles.chatTitle}>{item.title}</Text>
                    <Text style={styles.chatSub}>{item.subtitle}</Text>
                  </View>
                  <Text style={styles.chevron}>Open</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No chats yet.</Text>}
            />
          </Animated.View>
        ) : (
          <View style={styles.chatScreen}>
            <View style={styles.chatHeader}>
              <Pressable onPress={() => setScreen('list')} style={styles.backButton}><Text style={styles.backText}>Back</Text></Pressable>
              <View style={styles.chatHeaderTitleWrap}>
                <Text style={styles.chatHeaderTitle}>{activeChannel ? `# ${activeChannel.name}` : 'Channel'}</Text>
                <Text style={styles.chatHeaderSub}>{messages.length} messages</Text>
              </View>
            </View>

            <FlatList
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messages}
              renderItem={({ item }) => {
                const own = Number(item.author?.id) === Number(user?.id);
                return (
                  <View style={[styles.bubbleRow, own && styles.bubbleRowOwn]}>
                    {!own && <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{initials(item.author?.displayName || item.author?.username || 'U')}</Text></View>}
                    <View style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble]}>
                      {!own && <Text style={styles.author}>{item.author?.displayName || item.author?.username}</Text>}
                      <Text style={styles.messageText}>{item.content}</Text>
                      <Text style={styles.messageTime}>{timeLabel(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
            />

            <View style={styles.composer}>
              <TextInput
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Message"
                placeholderTextColor="#8e96a3"
                style={styles.messageInput}
                multiline
              />
              <Pressable style={styles.sendButton} onPress={sendMessage}>
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#17212b' },
  authWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: '#5e8cff', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  authTitle: { color: '#fff', fontSize: 34, fontWeight: '900', marginBottom: 6 },
  authSub: { color: '#b8c7d9', fontSize: 15, marginBottom: 22, lineHeight: 22 },
  segment: { flexDirection: 'row', backgroundColor: '#202c38', borderRadius: 14, padding: 4, marginBottom: 14 },
  segmentButton: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#2f80ed' },
  segmentText: { color: '#fff', fontWeight: '800' },
  authInput: { minHeight: 50, backgroundColor: '#202c38', color: '#fff', borderRadius: 14, paddingHorizontal: 16, marginBottom: 10, fontSize: 16 },
  primaryButton: { minHeight: 52, backgroundColor: '#2f80ed', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: 32, fontWeight: '900' },
  headerSub: { color: '#93a4b7', marginTop: 2 },
  iconButton: { height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#233140', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#d7e3ef', fontWeight: '800' },
  listScreen: { flex: 1 },
  search: { height: 46, marginHorizontal: 18, marginBottom: 8, borderRadius: 14, backgroundColor: '#202c38', color: '#fff', paddingHorizontal: 16, fontSize: 16 },
  chatList: { paddingHorizontal: 10, paddingBottom: 24 },
  chatItem: { minHeight: 72, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2f80ed', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  chatAvatarText: { color: '#fff', fontWeight: '900' },
  chatMeta: { flex: 1, minWidth: 0 },
  chatTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  chatSub: { color: '#93a4b7', marginTop: 4 },
  chevron: { color: '#6ea8ff', fontWeight: '800' },
  chatScreen: { flex: 1, backgroundColor: '#0f1720' },
  chatHeader: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1d2a36', backgroundColor: '#17212b' },
  backButton: { height: 38, paddingHorizontal: 10, justifyContent: 'center' },
  backText: { color: '#6ea8ff', fontWeight: '800' },
  chatHeaderTitleWrap: { flex: 1, alignItems: 'center', paddingRight: 48 },
  chatHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  chatHeaderSub: { color: '#93a4b7', fontSize: 12, marginTop: 2 },
  messages: { paddingHorizontal: 10, paddingVertical: 14 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  smallAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#2f80ed', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  smallAvatarText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  ownBubble: { backgroundColor: '#2b5278', borderBottomRightRadius: 6 },
  otherBubble: { backgroundColor: '#202c38', borderBottomLeftRadius: 6 },
  author: { color: '#7db3ff', fontWeight: '900', marginBottom: 2 },
  messageText: { color: '#f2f6fb', fontSize: 16, lineHeight: 22 },
  messageTime: { color: '#a9bacb', alignSelf: 'flex-end', fontSize: 11, marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#17212b', borderTopWidth: 1, borderTopColor: '#1d2a36' },
  messageInput: { flex: 1, maxHeight: 120, minHeight: 44, borderRadius: 22, backgroundColor: '#202c38', color: '#fff', paddingHorizontal: 16, paddingVertical: 11, fontSize: 16 },
  sendButton: { minWidth: 64, height: 44, marginLeft: 8, borderRadius: 22, backgroundColor: '#2f80ed', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '900' },
  error: { color: '#ffb4b4', marginHorizontal: 18, marginBottom: 8 },
  loader: { marginTop: 20 },
  empty: { color: '#93a4b7', textAlign: 'center', marginTop: 36 }
});
