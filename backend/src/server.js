import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
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
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = Number(process.env.PORT || 3000);

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

app.get('/health', (_req, res) => {
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

app.post('/channels', authMiddleware, async (req, res) => {
  try {
    const { name, guildId } = req.body;
    if (!name || !guildId) {
      return res.status(400).json({ error: 'name and guildId are required' });
    }

    const guild = await prisma.guild.findUnique({ where: { id: Number(guildId) } });
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        guildId: Number(guildId)
      }
    });

    return res.status(201).json(channel);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create channel' });
  }
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

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized'));
    }
    socket.user = verifyToken(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});


const voiceParticipants = new Map();

io.on('connection', (socket) => {
  socket.on('join-channel', ({ channelId }) => {
    socket.join(`channel:${channelId}`);
  });

  socket.on('send-message', async ({ channelId, content }) => {
    if (!content?.trim() || !channelId) {
      return;
    }

    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        channelId: Number(channelId),
        authorId: socket.user.userId
      },
      include: {
        author: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    io.to(`channel:${channelId}`).emit('new-message', message);
  });

  socket.on('voice-offer', ({ channelId, offer, targetSocketId }) => {
    socket.to(`channel:${channelId}`).emit('voice-offer', {
      offer,
      fromSocketId: socket.id,
      targetSocketId
    });
  });

  socket.on('voice-answer', ({ channelId, answer, targetSocketId }) => {
    socket.to(`channel:${channelId}`).emit('voice-answer', {
      answer,
      fromSocketId: socket.id,
      targetSocketId
    });
  });

  socket.on('voice-ice-candidate', ({ channelId, candidate, targetSocketId }) => {
    socket.to(`channel:${channelId}`).emit('voice-ice-candidate', {
      candidate,
      fromSocketId: socket.id,
      targetSocketId
    });
  });

  socket.on('join-voice', ({ channelId }) => {
    if (!channelId) {
      return;
    }
    const roomKey = `voice:${channelId}`;
    socket.join(roomKey);

    const participants = voiceParticipants.get(roomKey) || new Set();
    socket.emit('voice-participants', Array.from(participants));
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
