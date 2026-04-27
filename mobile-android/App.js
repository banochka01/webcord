import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API request failed');
  return data;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  return (
    <View style={styles.authWrap}>
      <Text style={styles.title}>Webcord Android</Text>
      <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#9f92c8" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#9f92c8" secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.primaryBtn}
        onPress={async () => {
          try {
            const payload = await api(`/${mode}`, {
              method: 'POST',
              body: JSON.stringify({ username, password })
            });
            await onAuth(payload);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <Text style={styles.btnText}>{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
        <Text style={styles.switchText}>{mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [guilds, setGuilds] = useState([]);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [channelId, setChannelId] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);

  const selectedChannel = useMemo(
    () => channels.find((c) => Number(c.id) === Number(channelId)),
    [channels, channelId]
  );

  useEffect(() => {
    SecureStore.getItemAsync('webcord_token').then((stored) => stored && setToken(stored));
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      reconnection: true
    });

    socketRef.current = socket;
    socket.on('new-message', (message) => {
      if (Number(message.channelId) === Number(channelId)) {
        setMessages((prev) => [...prev, message]);
      }
    });

    return () => socket.disconnect();
  }, [token, channelId]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const g = await api('/guilds', {}, token);
        setGuilds(g);
        const f = await api('/friends', {}, token);
        setFriends(f);
        if (g[0]) setGuildId(g[0].id);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !guildId) return;
    (async () => {
      try {
        const c = await api(`/channels/${guildId}`, {}, token);
        setChannels(c);
        if (c[0]) {
          setChannelId(c[0].id);
          socketRef.current?.emit('join-channel', { channelId: c[0].id });
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [token, guildId]);

  useEffect(() => {
    if (!token || !channelId) return;
    (async () => {
      const m = await api(`/messages/${channelId}`, {}, token);
      setMessages(m);
      socketRef.current?.emit('join-channel', { channelId });
    })().catch((e) => setError(e.message));
  }, [token, channelId]);

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <AuthScreen
          onAuth={async (payload) => {
            await SecureStore.setItemAsync('webcord_token', payload.token);
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
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>{selectedChannel ? `# ${selectedChannel.name}` : 'Webcord'}</Text>
          <Pressable onPress={async () => { await SecureStore.deleteItemAsync('webcord_token'); setToken(''); }}><Text style={styles.switchText}>Выход</Text></Pressable>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.layout}>
          <View style={styles.sidebar}>
            <Text style={styles.sectionTitle}>Servers</Text>
            <FlatList
              data={guilds}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <Pressable style={[styles.chip, item.id === guildId && styles.chipActive]} onPress={() => setGuildId(item.id)}>
                  <Text style={styles.chipText}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Text style={styles.sectionTitle}>Friends</Text>
            <FlatList
              data={friends}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => <Text style={styles.friendItem}>{item.user.displayName || item.user.username}</Text>}
            />
          </View>

          <View style={styles.chatWrap}>
            <FlatList
              data={messages}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.messageBubble}>
                  <Text style={styles.messageAuthor}>{item.author.displayName || item.author.username}</Text>
                  <Text style={styles.messageText}>{item.content}</Text>
                </View>
              )}
            />

            <View style={styles.composer}>
              <TextInput
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Сообщение"
                placeholderTextColor="#9f92c8"
                style={styles.messageInput}
              />
              <Pressable
                style={styles.primaryBtn}
                onPress={async () => {
                  if (!messageInput.trim()) return;
                  await api('/messages', {
                    method: 'POST',
                    body: JSON.stringify({ channelId, content: messageInput })
                  }, token);
                  setMessageInput('');
                }}
              >
                <Text style={styles.btnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0a12' },
  authWrap: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { color: '#f1ecff', fontSize: 28, fontWeight: '700', marginBottom: 20 },
  input: { backgroundColor: '#171126', color: '#fff', borderRadius: 10, padding: 12, marginBottom: 10 },
  error: { color: '#ff8ea1', marginBottom: 10 },
  primaryBtn: { backgroundColor: '#8f5bff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  switchText: { color: '#ccb7ff', marginTop: 10 },
  topBar: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#2f2452', flexDirection: 'row', justifyContent: 'space-between' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  layout: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 140, borderRightWidth: 1, borderRightColor: '#2f2452', padding: 8 },
  sectionTitle: { color: '#bfa8ff', fontSize: 12, marginVertical: 6 },
  chip: { backgroundColor: '#1a1430', borderRadius: 8, padding: 8, marginBottom: 6 },
  chipActive: { backgroundColor: '#8f5bff' },
  chipText: { color: '#fff', fontSize: 12 },
  friendItem: { color: '#ddd2ff', marginBottom: 4, fontSize: 12 },
  chatWrap: { flex: 1, padding: 8 },
  messageBubble: { backgroundColor: '#1a1430', padding: 8, borderRadius: 8, marginBottom: 6 },
  messageAuthor: { color: '#fff', fontWeight: '700', marginBottom: 3 },
  messageText: { color: '#e8ddff' },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  messageInput: { flex: 1, backgroundColor: '#171126', color: '#fff', borderRadius: 10, padding: 10 }
});
