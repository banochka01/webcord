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
import {
  authMiddleware,
  comparePassword,
  hashPassword,
  signToken,
  verifyToken
} from './auth.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = Number(process.env.PORT || 3000);

<<<<<<< Updated upstream
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

function getAttachmentType(mimeType = '') {
  if (mimeType.startsWith('image/')) {
    return 'IMAGE';
  }
  if (mimeType.startsWith('video/')) {
    return 'VIDEO';
  }
  return 'FILE';
}

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
=======
app.use(cors({ origin: true, credentials: true }));
>>>>>>> Stashed changes

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user = await prisma.user.create({
      data: {
        username,
        password: await hashPassword(password)
      }
    });

    const token = signToken(user);
    return res.status(201).json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    return res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/guilds', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const guild = await prisma.guild.create({ data: { name } });
    return res.status(201).json(guild);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create guild' });
  }
});

app.get('/channels/:guildId', authMiddleware, async (req, res) => {
  try {
    const guildId = Number(req.params.guildId);
    if (Number.isNaN(guildId)) {
      return res.status(400).json({ error: 'Invalid guild id' });
    }

    const channels = await prisma.channel.findMany({
      where: { guildId },
      orderBy: { id: 'asc' }
    });

    return res.json(channels);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/channels', authMiddleware, async (req, res) => {
  try {
    const { name, guildId, type } = req.body;
    if (!name || !guildId) {
      return res.status(400).json({ error: 'name and guildId are required' });
    }

    const channelType = type || 'TEXT';
    if (!['TEXT', 'VOICE'].includes(channelType)) {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    const guild = await prisma.guild.findUnique({ where: { id: Number(guildId) } });
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        type: channelType,
        guildId: Number(guildId)
      }
    });

    return res.status(201).json(channel);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create channel' });
  }
});

app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  return res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    type: getAttachmentType(req.file.mimetype),
    name: req.file.originalname
  });
});

app.get('/messages/:channelId', authMiddleware, async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (Number.isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }

    const messages = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    return res.json(messages);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Max 25MB.' });
  }

  if (error) {
    return res.status(500).json({ error: 'Unexpected server error' });
  }

  return next();
});

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    console.log("SOCKET AUTH origin=", socket.handshake.headers.origin, "token?", !!token);
    if (!token) return next(new Error('Unauthorized'));
    socket.user = verifyToken(token);
    console.log("SOCKET AUTH OK userId=", socket.user.userId);
    next();
  } catch (e) {
    console.log("SOCKET AUTH FAIL", e?.message);
    next(new Error('Unauthorized'));
  }
});

const voiceParticipants = new Map();

io.on('connection', (socket) => {
  console.log("SOCKET connected", socket.id);

  socket.on('join-channel', ({ channelId }) => {
    console.log("join-channel", socket.id, channelId);
    socket.join(`channel:${channelId}`);
  });

<<<<<<< Updated upstream
  socket.on('send-message', async (payload = {}) => {
    const channelId = Number(payload.channelId);
    const content = payload.content?.trim() || '';

    if (!channelId || Number.isNaN(channelId)) {
      return;
    }

    if (!content && !payload.attachmentUrl) {
      return;
    }

    const message = await prisma.message.create({
      data: {
        content,
        channelId,
        authorId: socket.user.userId,
        attachmentUrl: payload.attachmentUrl || null,
        attachmentType: payload.attachmentType || null,
        attachmentName: payload.attachmentName || null
      },
      include: {
        author: {
          select: {
            id: true,
            username: true
          }
        }
=======
  socket.on('send-message', async ({ channelId, content }) => {
  console.log("send-message", socket.id, channelId, (content || "").slice(0, 80));
  if (!content?.trim() || !channelId) return;

  const message = await prisma.message.create({
    data: {
      content: content.trim(),
      channelId: Number(channelId),
      authorId: socket.user.userId
    },
    include: {
      author: {
        select: { id: true, username: true }
>>>>>>> Stashed changes
      }
    }
  });

  console.log("emit new-message to", `channel:${channelId}`);
  io.to(`channel:${channelId}`).emit('new-message', message);
});

  socket.on('voice-offer', ({ channelId, offer, targetSocketId }) => {
    const payload = {
      offer,
      fromSocketId: socket.id,
      targetSocketId
    };

    if (targetSocketId) {
      io.to(targetSocketId).emit('voice-offer', payload);
      return;
    }

    socket.to(`voice:${channelId}`).emit('voice-offer', payload);
  });

  socket.on('voice-answer', ({ channelId, answer, targetSocketId }) => {
    const payload = {
      answer,
      fromSocketId: socket.id,
      targetSocketId
    };

    if (targetSocketId) {
      io.to(targetSocketId).emit('voice-answer', payload);
      return;
    }

    socket.to(`voice:${channelId}`).emit('voice-answer', payload);
  });

  socket.on('voice-ice-candidate', ({ channelId, candidate, targetSocketId }) => {
    const payload = {
      candidate,
      fromSocketId: socket.id,
      targetSocketId
    };

    if (targetSocketId) {
      io.to(targetSocketId).emit('voice-ice-candidate', payload);
      return;
    }

    socket.to(`voice:${channelId}`).emit('voice-ice-candidate', payload);
  });

  socket.on('join-voice', ({ channelId }) => {
    if (!channelId) {
      return;
    }
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
    if (!roomKey) {
      return;
    }
    socket.leave(roomKey);
    const participants = voiceParticipants.get(roomKey);
    if (participants) {
      participants.delete(socket.id);
      if (participants.size === 0) {
        voiceParticipants.delete(roomKey);
      }
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
        if (participants.size === 0) {
          voiceParticipants.delete(roomKey);
        }
      }
      socket.to(roomKey).emit('voice-user-left', { socketId: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
