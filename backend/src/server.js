import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { prisma } from './prisma.js';
import { authMiddleware, comparePassword, hashPassword, signToken, verifyToken } from './auth.js';

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const api = express.Router();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

function normalizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    avatarUrl: u.avatarUrl || null,
    statusText: u.statusText || null
  };
}

function attachmentType(mime = '') {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'FILE';
}

async function ensureDefaultGuildForUser(userId) {
  const existingMember = await prisma.guildMember.findFirst({ where: { userId }, include: { guild: true } });
  if (existingMember) {
    await ensureDefaultChannels(existingMember.guild.id);
    return existingMember.guild;
  }

  const existingGuild = await prisma.guild.findFirst({ orderBy: { id: 'asc' } });
  if (existingGuild) {
    await prisma.guildMember.upsert({
      where: { guildId_userId: { guildId: existingGuild.id, userId } },
      update: {},
      create: { guildId: existingGuild.id, userId, role: existingGuild.ownerId === userId ? 'OWNER' : 'MEMBER' }
    });
    await ensureDefaultChannels(existingGuild.id);
    return existingGuild;
  }

  const guild = await prisma.guild.create({
    data: {
      name: 'Global Guild',
      ownerId: userId,
      members: { create: { userId, role: 'OWNER' } },
      channels: { create: [{ name: 'general', type: 'TEXT' }, { name: 'General Voice', type: 'VOICE' }] }
    }
  });
  return guild;
}

async function ensureDefaultChannels(guildId) {
  const channels = await prisma.channel.findMany({ where: { guildId } });
  if (!channels.some((channel) => channel.type === 'TEXT')) {
    await prisma.channel.create({ data: { guildId, name: 'general', type: 'TEXT' } });
  }
  if (!channels.some((channel) => channel.type === 'VOICE')) {
    await prisma.channel.create({ data: { guildId, name: 'General Voice', type: 'VOICE' } });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/health', (_req, res) => res.json({ ok: true }));

api.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const user = await prisma.user.create({ data: { username, password: await hashPassword(password) } });
    await ensureDefaultGuildForUser(user.id);
    const token = signToken(user);
    return res.status(201).json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

api.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await ensureDefaultGuildForUser(user.id);
    const token = signToken(user);
    return res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

api.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  return res.json(normalizeUser(user));
});

api.patch('/me', authMiddleware, async (req, res) => {
  const { displayName, avatarUrl, statusText } = req.body;
  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { displayName, avatarUrl, statusText }
  });
  return res.json(normalizeUser(user));
});

api.get('/guilds', authMiddleware, async (req, res) => {
  let memberships = await prisma.guildMember.findMany({
    where: { userId: req.user.userId },
    include: { guild: true },
    orderBy: { id: 'asc' }
  });
  if (memberships.length === 0) {
    await ensureDefaultGuildForUser(req.user.userId);
    memberships = await prisma.guildMember.findMany({
      where: { userId: req.user.userId },
      include: { guild: true },
      orderBy: { id: 'asc' }
    });
  }
  return res.json(memberships.map((m) => m.guild));
});

api.post('/guilds', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const guild = await prisma.guild.create({
    data: {
      name,
      ownerId: req.user.userId,
      members: { create: { userId: req.user.userId, role: 'OWNER' } }
    }
  });
  return res.status(201).json(guild);
});

api.get('/channels/:guildId', authMiddleware, async (req, res) => {
  const guildId = Number(req.params.guildId);
  if (!guildId) return res.status(400).json({ error: 'Invalid guild id' });

  const membership = await prisma.guildMember.findFirst({ where: { guildId, userId: req.user.userId } });
  if (!membership) return res.status(403).json({ error: 'Not a member of guild' });

  const channels = await prisma.channel.findMany({ where: { guildId }, orderBy: { id: 'asc' } });
  return res.json(channels);
});

api.post('/channels', authMiddleware, async (req, res) => {
  const { name, guildId, type = 'TEXT' } = req.body;
  const parsedGuildId = Number(guildId);
  if (!name || !parsedGuildId) return res.status(400).json({ error: 'name and guildId are required' });
  if (!['TEXT', 'VOICE'].includes(type)) return res.status(400).json({ error: 'Invalid channel type' });

  const membership = await prisma.guildMember.findFirst({ where: { guildId: parsedGuildId, userId: req.user.userId } });
  if (!membership) return res.status(403).json({ error: 'Not a member of guild' });

  const channel = await prisma.channel.create({ data: { name, type, guildId: parsedGuildId } });
  return res.status(201).json(channel);
});

api.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  return res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    type: attachmentType(req.file.mimetype),
    name: req.file.originalname
  });
});

api.get('/messages/:channelId', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  if (!channelId) return res.status(400).json({ error: 'Invalid channel id' });

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const membership = await prisma.guildMember.findFirst({ where: { guildId: channel.guildId, userId: req.user.userId } });
  if (!membership) return res.status(403).json({ error: 'Not a member of guild' });

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      replyTo: { select: { id: true, content: true, author: { select: { username: true } } } }
    }
  });
  return res.json(messages);
});

api.post('/messages', authMiddleware, async (req, res) => {
  const { channelId, content = '', attachmentUrl, attachmentType: at, attachmentName, replyToId } = req.body;
  const parsedChannelId = Number(channelId);
  if (!parsedChannelId) return res.status(400).json({ error: 'Invalid channel id' });
  if (!content.trim() && !attachmentUrl) return res.status(400).json({ error: 'Message cannot be empty' });

  const channel = await prisma.channel.findUnique({ where: { id: parsedChannelId } });
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const membership = await prisma.guildMember.findFirst({ where: { guildId: channel.guildId, userId: req.user.userId } });
  if (!membership) return res.status(403).json({ error: 'Not a member of guild' });

  const message = await prisma.message.create({
    data: {
      channelId: parsedChannelId,
      authorId: req.user.userId,
      content: content.trim(),
      attachmentUrl: attachmentUrl || null,
      attachmentType: at || null,
      attachmentName: attachmentName || null,
      replyToId: replyToId ? Number(replyToId) : null
    },
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
  });

  io.to(`channel:${parsedChannelId}`).emit('new-message', message);
  return res.status(201).json(message);
});

api.patch('/messages/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { content } = req.body;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const updated = await prisma.message.update({
    where: { id },
    data: { content: content?.trim() || message.content, editedAt: new Date() },
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
  });

  io.to(`channel:${message.channelId}`).emit('message-updated', updated);
  return res.json(updated);
});

api.delete('/messages/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  await prisma.message.update({ where: { id }, data: { deletedAt: new Date(), content: '[deleted]' } });
  io.to(`channel:${message.channelId}`).emit('message-deleted', { id, channelId: message.channelId });
  return res.status(204).send();
});

api.get('/friends', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      addressee: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
    }
  });

  return res.json(friendships.map((f) => ({
    id: f.id,
    status: f.status,
    user: f.requesterId === userId ? f.addressee : f.requester,
    isOutgoingRequest: f.requesterId === userId
  })));
});

api.post('/friends/request', authMiddleware, async (req, res) => {
  const { username } = req.body;
  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });

  const [a, b] = [req.user.userId, target.id].sort((x, y) => x - y);
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a }
      ]
    }
  });
  if (existing) return res.status(409).json({ error: 'Friendship already exists' });

  const friendship = await prisma.friendship.create({
    data: { requesterId: req.user.userId, addresseeId: target.id, status: 'PENDING' }
  });
  return res.status(201).json(friendship);
});

api.post('/friends/:id/accept', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) return res.status(404).json({ error: 'Friendship not found' });
  if (friendship.addresseeId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const updated = await prisma.friendship.update({ where: { id }, data: { status: 'ACCEPTED' } });
  return res.json(updated);
});

api.post('/dm/channels', authMiddleware, async (req, res) => {
  const otherUserId = Number(req.body.userId);
  if (!otherUserId || otherUserId === req.user.userId) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const existing = await prisma.dMChannel.findFirst({
    where: {
      members: {
        every: { userId: { in: [req.user.userId, otherUserId] } }
      }
    },
    include: { members: true }
  });

  if (existing && existing.members.length === 2) return res.json(existing);

  const channel = await prisma.dMChannel.create({
    data: {
      members: { create: [{ userId: req.user.userId }, { userId: otherUserId }] }
    },
    include: {
      members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } }
    }
  });
  return res.status(201).json(channel);
});

api.get('/dm/channels', authMiddleware, async (req, res) => {
  const channels = await prisma.dMChannel.findMany({
    where: { members: { some: { userId: req.user.userId } } },
    include: {
      members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });
  return res.json(channels);
});

api.get('/dm/messages/:dmChannelId', authMiddleware, async (req, res) => {
  const dmChannelId = Number(req.params.dmChannelId);
  const member = await prisma.dMChannelMember.findFirst({ where: { dmChannelId, userId: req.user.userId } });
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const messages = await prisma.dMMessage.findMany({
    where: { dmChannelId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
  });
  return res.json(messages);
});

api.post('/dm/messages', authMiddleware, async (req, res) => {
  const dmChannelId = Number(req.body.dmChannelId);
  const content = req.body.content?.trim();
  if (!dmChannelId || !content) return res.status(400).json({ error: 'dmChannelId and content are required' });

  const member = await prisma.dMChannelMember.findFirst({ where: { dmChannelId, userId: req.user.userId } });
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const message = await prisma.dMMessage.create({
    data: { dmChannelId, content, authorId: req.user.userId },
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
  });

  io.to(`dm:${dmChannelId}`).emit('dm-new-message', message);
  return res.status(201).json(message);
});

app.use('/api', api);
app.use('/', api);

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Max 25MB.' });
  }
  if (error) return res.status(500).json({ error: 'Unexpected server error' });
  return next();
});

const io = new Server(server, { cors: { origin: CLIENT_URL, credentials: true }, path: '/socket.io' });
const onlineUsers = new Map();
const voiceParticipants = new Map();

function broadcastPresence(userId, online) {
  io.emit('presence-updated', { userId, online, at: new Date().toISOString() });
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    socket.user = verifyToken(token);
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.userId;
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastPresence(userId, true);

  socket.on('join-channel', ({ channelId }) => socket.join(`channel:${channelId}`));
  socket.on('join-dm', ({ dmChannelId }) => socket.join(`dm:${dmChannelId}`));

  socket.on('send-message', async (payload = {}) => {
    const channelId = Number(payload.channelId);
    const content = payload.content?.trim() || '';
    if (!channelId || (!content && !payload.attachmentUrl)) return;

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return;
    const membership = await prisma.guildMember.findFirst({ where: { guildId: channel.guildId, userId } });
    if (!membership) return;

    const message = await prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content,
        attachmentUrl: payload.attachmentUrl || null,
        attachmentType: payload.attachmentType || null,
        attachmentName: payload.attachmentName || null,
        replyToId: payload.replyToId ? Number(payload.replyToId) : null
      },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
    });

    io.to(`channel:${channelId}`).emit('new-message', message);
  });

  socket.on('send-dm-message', async ({ dmChannelId, content }) => {
    if (!dmChannelId || !content?.trim()) return;
    const message = await prisma.dMMessage.create({
      data: { dmChannelId: Number(dmChannelId), authorId: userId, content: content.trim() },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
    });
    io.to(`dm:${dmChannelId}`).emit('dm-new-message', message);
  });

  socket.on('voice-offer', ({ channelId, offer, targetSocketId }) => {
    const payload = { offer, fromSocketId: socket.id, targetSocketId };
    if (targetSocketId) return io.to(targetSocketId).emit('voice-offer', payload);
    return socket.to(`voice:${channelId}`).emit('voice-offer', payload);
  });

  socket.on('voice-answer', ({ channelId, answer, targetSocketId }) => {
    const payload = { answer, fromSocketId: socket.id, targetSocketId };
    if (targetSocketId) return io.to(targetSocketId).emit('voice-answer', payload);
    return socket.to(`voice:${channelId}`).emit('voice-answer', payload);
  });

  socket.on('voice-ice-candidate', ({ channelId, candidate, targetSocketId }) => {
    const payload = { candidate, fromSocketId: socket.id, targetSocketId };
    if (targetSocketId) return io.to(targetSocketId).emit('voice-ice-candidate', payload);
    return socket.to(`voice:${channelId}`).emit('voice-ice-candidate', payload);
  });

  socket.on('join-voice', ({ channelId }) => {
    if (!channelId) return;
    const roomKey = `voice:${channelId}`;
    socket.join(roomKey);

    const participants = voiceParticipants.get(roomKey) || new Set();
    socket.emit('voice-participants', Array.from(participants).map((socketId) => ({ socketId })));
    participants.add(socket.id);
    voiceParticipants.set(roomKey, participants);

    socket.to(roomKey).emit('voice-user-joined', { socketId: socket.id });
    socket.data.voiceRoomKey = roomKey;
  });

  socket.on('leave-voice', () => {
    const roomKey = socket.data.voiceRoomKey;
    if (!roomKey) return;
    socket.leave(roomKey);
    const participants = voiceParticipants.get(roomKey);
    if (participants) {
      participants.delete(socket.id);
      if (participants.size === 0) voiceParticipants.delete(roomKey);
    }
    socket.to(roomKey).emit('voice-user-left', { socketId: socket.id });
    delete socket.data.voiceRoomKey;
  });

  socket.on('disconnect', () => {
    const roomKey = socket.data.voiceRoomKey;
    if (roomKey) {
      const participants = voiceParticipants.get(roomKey);
      if (participants) {
        participants.delete(socket.id);
        if (participants.size === 0) voiceParticipants.delete(roomKey);
      }
      socket.to(roomKey).emit('voice-user-left', { socketId: socket.id });
    }

    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        broadcastPresence(userId, false);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
