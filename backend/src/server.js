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

const PORT = Number(process.env.PORT || 3001);
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);
const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 200;
const CLIENT_ORIGINS = String(process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const BLOCKED_UPLOAD_EXTENSIONS = new Set(['.cjs', '.htm', '.html', '.js', '.mjs', '.svg', '.xhtml', '.xml']);
const BLOCKED_UPLOAD_MIME_TYPES = new Set([
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/javascript',
  'text/xml'
]);
const INLINE_UPLOAD_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.m4v',
  '.mov',
  '.mp4',
  '.ogg',
  '.png',
  '.webm',
  '.webp'
]);
const NATIVE_CLIENT_ORIGINS = [
  'capacitor://localhost',
  'ionic://localhost',
  'app://localhost',
  'file://',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost',
  'https://localhost'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads'));

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
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();

    if (BLOCKED_UPLOAD_EXTENSIONS.has(ext) || BLOCKED_UPLOAD_MIME_TYPES.has(mimeType)) {
      const error = new Error('This file type is not allowed.');
      error.status = 415;
      error.code = 'UNSUPPORTED_UPLOAD_TYPE';
      cb(error);
      return;
    }

    cb(null, true);
  }
});

const voiceParticipants = new Map();
const rateLimitBuckets = new Map();
const publicUserSelect = {
  id: true,
  username: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true
};
const authRateLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'auth' });
const messageRateLimitConfig = { windowMs: 10_000, max: 18, keyPrefix: 'message' };
const messageRateLimit = createRateLimiter(messageRateLimitConfig);
const uploadRateLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'upload' });

function getAttachmentType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  return 'FILE';
}

function sendApiError(res, status, code, error) {
  return res.status(status).json({ code, error });
}

function createApiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function consumeRateLimit({ identity, windowMs, max, keyPrefix }) {
  const key = `${keyPrefix}:${identity || 'anonymous'}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  return {
    allowed: bucket.count <= max,
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
  };
}

function createRateLimiter({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const identity = req.user?.userId || req.ip || 'anonymous';
    const result = consumeRateLimit({ identity, windowMs, max, keyPrefix });

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return sendApiError(res, 429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
    }

    return next();
  };
}

function checkSocketRateLimit(socket, config = messageRateLimitConfig) {
  const result = consumeRateLimit({
    ...config,
    identity: socket.user?.userId || socket.id
  });

  if (!result.allowed) {
    socket.emit('socket-error', {
      code: 'RATE_LIMITED',
      error: 'Too many messages. Try again shortly.',
      retryAfter: result.retryAfter
    });
    return false;
  }

  return true;
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return null;
  return parsePositiveInt(value);
}

function parseMessagePagination(query = {}) {
  const limit = Math.min(MAX_MESSAGE_LIMIT, Math.max(1, parsePositiveInt(query.limit) || DEFAULT_MESSAGE_LIMIT));
  const beforeId = parseOptionalPositiveInt(query.beforeId);
  return { limit, beforeId };
}

function sendCaughtApiError(res, error, fallbackCode, fallbackMessage) {
  if (error?.status && error?.code) {
    return sendApiError(res, error.status, error.code, error.message || fallbackMessage);
  }

  return sendApiError(res, 500, fallbackCode, fallbackMessage);
}

function getUploadDisposition(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (INLINE_UPLOAD_EXTENSIONS.has(ext)) return '';

  const filename = path.basename(filePath || 'download').replace(/["\r\n]/g, '_');
  return `attachment; filename="${filename}"`;
}

function normalizeUserPair(leftId, rightId) {
  const first = Number(leftId);
  const second = Number(rightId);
  return first < second ? [first, second] : [second, first];
}

function getFriendshipCounterpart(friendship, userId) {
  return friendship.userOneId === userId ? friendship.userTwo : friendship.userOne;
}

function getConversationCounterpart(conversation, userId) {
  return conversation.userOneId === userId ? conversation.userTwo : conversation.userOne;
}

function serializeFriendRequest(request, currentUserId) {
  const incoming = request.receiverId === currentUserId;
  const counterpart = incoming ? request.sender : request.receiver;

  return {
    id: request.id,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    direction: incoming ? 'INCOMING' : 'OUTGOING',
    user: counterpart ? { id: counterpart.id, username: counterpart.username, avatarUrl: counterpart.avatarUrl, bannerUrl: counterpart.bannerUrl, bio: counterpart.bio } : null
  };
}

function serializeFriendship(friendship, currentUserId) {
  const counterpart = getFriendshipCounterpart(friendship, currentUserId);
  return {
    id: friendship.id,
    createdAt: friendship.createdAt,
    user: counterpart ? { id: counterpart.id, username: counterpart.username, avatarUrl: counterpart.avatarUrl, bannerUrl: counterpart.bannerUrl, bio: counterpart.bio } : null
  };
}

function serializeDirectConversation(conversation, currentUserId) {
  const counterpart = getConversationCounterpart(conversation, currentUserId);
  const lastMessage = conversation.messages?.[0] || null;

  return {
    id: conversation.id,
    updatedAt: conversation.updatedAt,
    user: counterpart ? { id: counterpart.id, username: counterpart.username, avatarUrl: counterpart.avatarUrl, bannerUrl: counterpart.bannerUrl, bio: counterpart.bio } : null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          attachmentType: lastMessage.attachmentType,
          attachmentName: lastMessage.attachmentName,
          createdAt: lastMessage.createdAt,
          author: lastMessage.author ? { id: lastMessage.author.id, username: lastMessage.author.username, avatarUrl: lastMessage.author.avatarUrl } : null
        }
      : null
  };
}

async function ensureBootstrapData() {
  let guild = await prisma.guild.findFirst({ orderBy: { id: 'asc' } });

  if (!guild) {
    guild = await prisma.guild.create({ data: { name: 'WebCord' } });
  }

  let textChannel = await prisma.channel.findFirst({
    where: { guildId: guild.id, type: 'TEXT' },
    orderBy: { id: 'asc' }
  });

  if (!textChannel) {
    textChannel = await prisma.channel.create({
      data: { guildId: guild.id, name: 'general', type: 'TEXT' }
    });
  }

  let voiceChannel = await prisma.channel.findFirst({
    where: { guildId: guild.id, type: 'VOICE' },
    orderBy: { id: 'asc' }
  });

  if (!voiceChannel) {
    voiceChannel = await prisma.channel.create({
      data: { guildId: guild.id, name: 'General Voice', type: 'VOICE' }
    });
  }

  return { guild, textChannel, voiceChannel };
}

async function getSocialSnapshot(userId) {
  const [friendships, requests, conversations] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }]
      },
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect }
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.friendRequest.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }]
      },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.directConversation.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }]
      },
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: publicUserSelect }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  return {
    friends: friendships.map((item) => serializeFriendship(item, userId)),
    requests: requests.map((item) => serializeFriendRequest(item, userId)),
    conversations: conversations.map((item) => serializeDirectConversation(item, userId))
  };
}

function emitSocialRefresh(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean).map(Number))];
  uniqueUserIds.forEach((userId) => {
    io.to(`user:${userId}`).emit('social:refresh');
  });
}

async function createChannelMessage({ channelId, userId, content, attachmentUrl, attachmentType, attachmentName, replyToId }) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true }
  });

  if (!channel || channel.type !== 'TEXT') {
    return null;
  }

  if (replyToId) {
    const replyTarget = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { channelId: true }
    });

    if (!replyTarget || replyTarget.channelId !== channelId) {
      throw createApiError(400, 'INVALID_REPLY_TARGET', 'Reply target was not found in this channel.');
    }
  }

  return prisma.message.create({
    data: {
      channelId,
      content,
      authorId: userId,
      attachmentUrl,
      attachmentType,
      attachmentName,
      replyToId: replyToId || null
    },
    include: {
      author: { select: publicUserSelect },
      replyTo: {
        include: {
          author: { select: publicUserSelect }
        }
      }
    }
  });
}

async function createDirectConversationMessage({ conversationId, userId, content, attachmentUrl, attachmentType, attachmentName, replyToId }) {
  const conversation = await prisma.directConversation.findUnique({
    where: { id: conversationId }
  });

  if (!conversation || ![conversation.userOneId, conversation.userTwoId].includes(userId)) {
    return { conversation: null, message: null };
  }

  if (replyToId) {
    const replyTarget = await prisma.directMessage.findUnique({
      where: { id: replyToId },
      select: { conversationId: true }
    });

    if (!replyTarget || replyTarget.conversationId !== conversationId) {
      throw createApiError(400, 'INVALID_REPLY_TARGET', 'Reply target was not found in this conversation.');
    }
  }

  const message = await prisma.directMessage.create({
    data: {
      conversationId,
      content,
      authorId: userId,
      attachmentUrl,
      attachmentType,
      attachmentName,
      replyToId: replyToId || null
    },
    include: {
      author: { select: publicUserSelect },
      replyTo: {
        include: {
          author: { select: publicUserSelect }
        }
      }
    }
  });

  await prisma.directConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });

  return { conversation, message };
}

function isAllowedCorsOrigin(origin, callback) {
  const isLocalDevOrigin =
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin || '');

  if (
    !origin ||
    isLocalDevOrigin ||
    NATIVE_CLIENT_ORIGINS.includes(origin) ||
    CLIENT_ORIGINS.length === 0 ||
    CLIENT_ORIGINS.includes('*') ||
    CLIENT_ORIGINS.includes(origin)
  ) {
    callback(null, true);
    return;
  }

  callback(new Error('Not allowed by CORS'));
}

app.set('trust proxy', 1);
app.use(cors({ origin: isAllowedCorsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  '/uploads',
  express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const disposition = getUploadDisposition(filePath);
      if (disposition) res.setHeader('Content-Disposition', disposition);
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, voiceRooms: voiceParticipants.size });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, voiceRooms: voiceParticipants.size });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

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

    await ensureBootstrapData();

    return res.status(201).json({
      token: signToken(user),
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await ensureBootstrapData();

    return res.json({
      token: signToken(user),
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/bootstrap', authMiddleware, async (req, res) => {
  try {
    const { guild, textChannel, voiceChannel } = await ensureBootstrapData();
    const channels = await prisma.channel.findMany({
      where: { guildId: guild.id },
      orderBy: [{ type: 'asc' }, { id: 'asc' }]
    });

    let social = { friends: [], requests: [], conversations: [] };
    let currentUser = null;

    try {
      [social, currentUser] = await Promise.all([
        getSocialSnapshot(req.user.userId),
        prisma.user.findUnique({
          where: { id: req.user.userId },
          select: publicUserSelect
        })
      ]);
    } catch (partialError) {
      console.error('Bootstrap partial failure:', partialError);
    }

    return res.json({
      guild,
      channels,
      social,
      currentUser,
      defaults: {
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to bootstrap app data' });
  }
});

app.get('/api/me/profile', authMiddleware, async (req, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: publicUserSelect
    });
    return res.json(currentUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.patch('/api/me/profile', authMiddleware, async (req, res) => {
  try {
    const bio = String(req.body.bio ?? '').trim().slice(0, 280);
    const data = { bio };

    if (Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl')) {
      data.avatarUrl = req.body.avatarUrl ? String(req.body.avatarUrl).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'bannerUrl')) {
      data.bannerUrl = req.body.bannerUrl ? String(req.body.bannerUrl).trim() : null;
    }

    const currentUser = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: publicUserSelect
    });

    emitSocialRefresh([req.user.userId]);
    return res.json(currentUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/social', authMiddleware, async (req, res) => {
  try {
    return res.json(await getSocialSnapshot(req.user.userId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch social data' });
  }
});

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const currentUserId = req.user.userId;

    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }

    const targetUser = await prisma.user.findUnique({ where: { username } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ error: 'You cannot add yourself' });
    }

    const [userOneId, userTwoId] = normalizeUserPair(currentUserId, targetUser.id);
    const existingFriendship = await prisma.friendship.findUnique({
      where: { userOneId_userTwoId: { userOneId, userTwoId } }
    });

    if (existingFriendship) {
      return res.status(409).json({ error: 'You are already friends' });
    }

    const existingPending = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUser.id, status: 'PENDING' },
          { senderId: targetUser.id, receiverId: currentUserId, status: 'PENDING' }
        ]
      }
    });

    if (existingPending) {
      return res.status(409).json({ error: 'A pending friend request already exists' });
    }

    const sameDirectionRequest = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId: currentUserId,
          receiverId: targetUser.id
        }
      },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect }
      }
    });

    const request = sameDirectionRequest
      ? await prisma.friendRequest.update({
          where: { id: sameDirectionRequest.id },
          data: { status: 'PENDING' },
          include: {
            sender: { select: publicUserSelect },
            receiver: { select: publicUserSelect }
          }
        })
      : await prisma.friendRequest.create({
          data: {
            senderId: currentUserId,
            receiverId: targetUser.id
          },
          include: {
            sender: { select: publicUserSelect },
            receiver: { select: publicUserSelect }
          }
        });

    emitSocialRefresh([currentUserId, targetUser.id]);
    return res.status(201).json(serializeFriendRequest(request, currentUserId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to send friend request' });
  }
});

app.post('/api/friends/respond', authMiddleware, async (req, res) => {
  try {
    const requestId = Number(req.body.requestId);
    const action = String(req.body.action || '').toUpperCase();
    const currentUserId = req.user.userId;

    if (!requestId || Number.isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!request || request.receiverId !== currentUserId) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(409).json({ error: 'Friend request already processed' });
    }

    const nextStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';

    await prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({
        where: { id: request.id },
        data: { status: nextStatus }
      });

      if (nextStatus === 'ACCEPTED') {
        const [userOneId, userTwoId] = normalizeUserPair(request.senderId, request.receiverId);

        await tx.friendship.upsert({
          where: { userOneId_userTwoId: { userOneId, userTwoId } },
          create: { userOneId, userTwoId },
          update: {}
        });

        await tx.directConversation.upsert({
          where: { userOneId_userTwoId: { userOneId, userTwoId } },
          create: { userOneId, userTwoId },
          update: {}
        });
      }
    });

    emitSocialRefresh([request.senderId, request.receiverId]);
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to process friend request' });
  }
});

app.post('/api/dms/open', authMiddleware, async (req, res) => {
  try {
    const targetUserId = Number(req.body.userId);
    const currentUserId = req.user.userId;

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    const [userOneId, userTwoId] = normalizeUserPair(currentUserId, targetUserId);

    const friendship = await prisma.friendship.findUnique({
      where: { userOneId_userTwoId: { userOneId, userTwoId } }
    });

    if (!friendship) {
      return res.status(403).json({ error: 'Only friends can use direct messages' });
    }

    const conversation = await prisma.directConversation.upsert({
      where: { userOneId_userTwoId: { userOneId, userTwoId } },
      create: { userOneId, userTwoId },
      update: {},
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: publicUserSelect }
          }
        }
      }
    });

    emitSocialRefresh([currentUserId, targetUserId]);
    return res.json(serializeDirectConversation(conversation, currentUserId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to open direct conversation' });
  }
});

app.get('/api/dms/:conversationId/messages', authMiddleware, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const currentUserId = req.user.userId;

    if (!conversationId || Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation || ![conversation.userOneId, conversation.userTwoId].includes(currentUserId)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        authorId: { not: currentUserId },
        readAt: null
      },
      data: { readAt: new Date() }
    });

    const { limit, beforeId } = parseMessagePagination(req.query);
    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(beforeId ? { id: { lt: beforeId } } : {})
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        author: { select: publicUserSelect },
        replyTo: {
          include: {
            author: { select: publicUserSelect }
          }
        }
      }
    });

    return res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch direct messages' });
  }
});

app.get('/api/guilds', authMiddleware, async (_req, res) => {
  try {
    const guilds = await prisma.guild.findMany({ orderBy: { id: 'asc' } });
    return res.json(guilds);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

app.get('/api/channels/:guildId', authMiddleware, async (req, res) => {
  try {
    const guildId = Number(req.params.guildId);
    if (!guildId || Number.isNaN(guildId)) {
      return res.status(400).json({ error: 'Invalid guild id' });
    }

    const channels = await prisma.channel.findMany({
      where: { guildId },
      orderBy: [{ type: 'asc' }, { id: 'asc' }]
    });

    return res.json(channels);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/channels', authMiddleware, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const guildId = Number(req.body.guildId);
    const type = String(req.body.type || 'TEXT').toUpperCase();

    if (!name || !guildId) {
      return res.status(400).json({ error: 'name and guildId are required' });
    }

    if (!['TEXT', 'VOICE'].includes(type)) {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channel = await prisma.channel.create({
      data: { name, guildId, type }
    });

    io.to(`guild:${guildId}`).emit('channel-created', channel);
    return res.status(201).json(channel);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create channel' });
  }
});

app.get('/api/messages/:channelId', authMiddleware, async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!channelId || Number.isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }

    const { limit, beforeId } = parseMessagePagination(req.query);
    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(beforeId ? { id: { lt: beforeId } } : {})
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        author: { select: publicUserSelect },
        replyTo: {
          include: {
            author: { select: publicUserSelect }
          }
        }
      }
    });

    return res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const channelId = Number(req.body.channelId);
    const content = String(req.body.content || '').trim();
    const attachmentUrl = req.body.attachmentUrl || null;
    const attachmentType = req.body.attachmentType || null;
    const attachmentName = req.body.attachmentName || null;
    const replyToId = parseOptionalPositiveInt(req.body.replyToId);

    if (!channelId || Number.isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }

    if (!content && !attachmentUrl) {
      return res.status(400).json({ error: 'Message content or attachment is required' });
    }
    if (req.body.replyToId && !replyToId) {
      return sendApiError(res, 400, 'INVALID_REPLY_TARGET', 'Invalid reply target');
    }

    const message = await createChannelMessage({
      channelId,
      userId: req.user.userId,
      content,
      attachmentUrl,
      attachmentType,
      attachmentName,
      replyToId
    });

    if (!message) {
      return res.status(404).json({ error: 'Text channel not found' });
    }

    io.to(`channel:${channelId}`).emit('new-message', message);
    return res.status(201).json(message);
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'MESSAGE_SEND_FAILED', 'Failed to send message');
  }
});

app.post('/api/dms/:conversationId/messages', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const content = String(req.body.content || '').trim();
    const attachmentUrl = req.body.attachmentUrl || null;
    const attachmentType = req.body.attachmentType || null;
    const attachmentName = req.body.attachmentName || null;
    const replyToId = parseOptionalPositiveInt(req.body.replyToId);

    if (!conversationId || Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    if (!content && !attachmentUrl) {
      return res.status(400).json({ error: 'Message content or attachment is required' });
    }
    if (req.body.replyToId && !replyToId) {
      return sendApiError(res, 400, 'INVALID_REPLY_TARGET', 'Invalid reply target');
    }

    const { conversation, message } = await createDirectConversationMessage({
      conversationId,
      userId: req.user.userId,
      content,
      attachmentUrl,
      attachmentType,
      attachmentName,
      replyToId
    });

    if (!conversation || !message) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    io.to(`dm:${conversationId}`).emit('direct-message:new', {
      ...message,
      conversationId
    });
    emitSocialRefresh([conversation.userOneId, conversation.userTwoId]);

    return res.status(201).json({
      ...message,
      conversationId
    });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'MESSAGE_SEND_FAILED', 'Failed to send direct message');
  }
});

app.patch('/api/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const content = String(req.body.content || '').trim();

    if (!messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    if (!content) {
      return sendApiError(res, 400, 'MESSAGE_EMPTY', 'Message content is required');
    }

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== req.user.userId || existing.deletedAt) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: {
        author: { select: publicUserSelect },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`channel:${message.channelId}`).emit('message:updated', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_EDIT_FAILED', 'Failed to edit message');
  }
});

app.delete('/api/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    if (!messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== req.user.userId) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        deletedAt: new Date()
      },
      include: {
        author: { select: publicUserSelect },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`channel:${message.channelId}`).emit('message:updated', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_DELETE_FAILED', 'Failed to delete message');
  }
});

app.patch('/api/dms/:conversationId/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);
    const content = String(req.body.content || '').trim();

    if (!conversationId || Number.isNaN(conversationId) || !messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    if (!content) {
      return sendApiError(res, 400, 'MESSAGE_EMPTY', 'Message content is required');
    }

    const conversation = await prisma.directConversation.findUnique({ where: { id: conversationId } });
    const existing = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (
      !conversation ||
      ![conversation.userOneId, conversation.userTwoId].includes(req.user.userId) ||
      !existing ||
      existing.conversationId !== conversationId ||
      existing.authorId !== req.user.userId ||
      existing.deletedAt
    ) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.directMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: {
        author: { select: publicUserSelect },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`dm:${conversationId}`).emit('direct-message:updated', { ...message, conversationId });
    emitSocialRefresh([conversation.userOneId, conversation.userTwoId]);
    return res.json({ ...message, conversationId });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_EDIT_FAILED', 'Failed to edit direct message');
  }
});

app.delete('/api/dms/:conversationId/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);

    if (!conversationId || Number.isNaN(conversationId) || !messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }

    const conversation = await prisma.directConversation.findUnique({ where: { id: conversationId } });
    const existing = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (
      !conversation ||
      ![conversation.userOneId, conversation.userTwoId].includes(req.user.userId) ||
      !existing ||
      existing.conversationId !== conversationId ||
      existing.authorId !== req.user.userId
    ) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.directMessage.update({
      where: { id: messageId },
      data: {
        content: '',
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        deletedAt: new Date()
      },
      include: {
        author: { select: publicUserSelect },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`dm:${conversationId}`).emit('direct-message:updated', { ...message, conversationId });
    emitSocialRefresh([conversation.userOneId, conversation.userTwoId]);
    return res.json({ ...message, conversationId });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_DELETE_FAILED', 'Failed to delete direct message');
  }
});

app.post('/api/upload', authMiddleware, uploadRateLimit, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  return res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    type: getAttachmentType(req.file.mimetype),
    name: req.file.originalname
  });
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Max 25MB.' });
  }

  if (error?.code === 'UNSUPPORTED_UPLOAD_TYPE') {
    return sendApiError(res, error.status || 415, error.code, error.message || 'This file type is not allowed.');
  }

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }

  return next();
});

const io = new Server(server, {
  cors: { origin: isAllowedCorsOrigin, credentials: true },
  path: '/socket.io'
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized'));
    }

    socket.user = verifyToken(token);
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

function getVoiceRoomKey(channelId) {
  const parsedChannelId = Number(channelId);
  if (!parsedChannelId || Number.isNaN(parsedChannelId)) return '';
  return `voice:${parsedChannelId}`;
}

function getVoiceParticipantList(roomKey) {
  const participants = voiceParticipants.get(roomKey) || new Map();
  return Array.from(participants.entries()).map(([socketId, participant]) => ({
    socketId,
    userId: participant.userId,
    username: participant.username
  }));
}

function leaveVoiceRoom(socket) {
  const roomKey = socket.data.voiceRoomKey;
  if (!roomKey) return;

  socket.leave(roomKey);

  const participants = voiceParticipants.get(roomKey);
  if (participants) {
    participants.delete(socket.id);
    if (participants.size === 0) {
      voiceParticipants.delete(roomKey);
    }
  }

  socket.to(roomKey).emit('voice-user-left', { socketId: socket.id, username: socket.user.username });
  delete socket.data.voiceRoomKey;
}

function emitVoiceSignal(socket, eventName, { channelId, targetSocketId, ...payload }) {
  const roomKey = getVoiceRoomKey(channelId);
  if (!roomKey || socket.data.voiceRoomKey !== roomKey) return;

  const signalPayload = {
    ...payload,
    fromSocketId: socket.id,
    targetSocketId
  };

  if (targetSocketId) {
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket || targetSocket.data.voiceRoomKey !== roomKey) return;
    io.to(targetSocketId).emit(eventName, signalPayload);
    return;
  }

  socket.to(roomKey).emit(eventName, signalPayload);
}

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.userId}`);

  socket.on('join-guild', ({ guildId }) => {
    const parsedGuildId = Number(guildId);
    if (!parsedGuildId || Number.isNaN(parsedGuildId)) return;
    socket.join(`guild:${parsedGuildId}`);
  });

  socket.on('join-channel', ({ channelId }) => {
    const parsedChannelId = Number(channelId);
    if (!parsedChannelId || Number.isNaN(parsedChannelId)) return;

    if (socket.data.textRoomKey) {
      socket.leave(socket.data.textRoomKey);
    }

    const roomKey = `channel:${parsedChannelId}`;
    socket.join(roomKey);
    socket.data.textRoomKey = roomKey;
  });

  socket.on('join-direct-conversation', async ({ conversationId }) => {
    try {
      const parsedConversationId = Number(conversationId);
      if (!parsedConversationId || Number.isNaN(parsedConversationId)) return;

      const conversation = await prisma.directConversation.findUnique({
        where: { id: parsedConversationId }
      });

      if (!conversation || ![conversation.userOneId, conversation.userTwoId].includes(socket.user.userId)) {
        return;
      }

      if (socket.data.directRoomKey) {
        socket.leave(socket.data.directRoomKey);
      }

      const roomKey = `dm:${parsedConversationId}`;
      socket.join(roomKey);
      socket.data.directRoomKey = roomKey;
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('send-message', async (payload = {}) => {
    try {
      if (!checkSocketRateLimit(socket)) return;

      const channelId = Number(payload.channelId);
      const content = String(payload.content || '').trim();
      const attachmentUrl = payload.attachmentUrl || null;
      const attachmentType = payload.attachmentType || null;
      const attachmentName = payload.attachmentName || null;
      const replyToId = parseOptionalPositiveInt(payload.replyToId);

      if (!channelId || Number.isNaN(channelId)) return;
      if (!content && !attachmentUrl) return;
      if (payload.replyToId && !replyToId) {
        socket.emit('socket-error', { code: 'INVALID_REPLY_TARGET', error: 'Invalid reply target' });
        return;
      }

      const message = await createChannelMessage({
        channelId,
        userId: socket.user.userId,
        content,
        attachmentUrl,
        attachmentType,
        attachmentName,
        replyToId
      });

      if (!message) {
        socket.emit('socket-error', { error: 'Text channel not found' });
        return;
      }

      io.to(`channel:${channelId}`).emit('new-message', message);
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { code: error?.code, error: error?.message || 'Failed to send message' });
    }
  });

  socket.on('send-direct-message', async (payload = {}) => {
    try {
      if (!checkSocketRateLimit(socket)) return;

      const conversationId = Number(payload.conversationId);
      const content = String(payload.content || '').trim();
      const attachmentUrl = payload.attachmentUrl || null;
      const attachmentType = payload.attachmentType || null;
      const attachmentName = payload.attachmentName || null;
      const replyToId = parseOptionalPositiveInt(payload.replyToId);

      if (!conversationId || Number.isNaN(conversationId)) return;
      if (!content && !attachmentUrl) return;
      if (payload.replyToId && !replyToId) {
        socket.emit('socket-error', { code: 'INVALID_REPLY_TARGET', error: 'Invalid reply target' });
        return;
      }

      const { conversation, message } = await createDirectConversationMessage({
        conversationId,
        userId: socket.user.userId,
        content,
        attachmentUrl,
        attachmentType,
        attachmentName,
        replyToId
      });

      if (!conversation || !message) {
        socket.emit('socket-error', { error: 'Conversation not found' });
        return;
      }

      io.to(`dm:${conversationId}`).emit('direct-message:new', {
        ...message,
        conversationId
      });
      emitSocialRefresh([conversation.userOneId, conversation.userTwoId]);
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { code: error?.code, error: error?.message || 'Failed to send direct message' });
    }
  });

  socket.on('join-voice', async ({ channelId }) => {
    try {
      const parsedChannelId = Number(channelId);
      if (!parsedChannelId || Number.isNaN(parsedChannelId)) return;

      const channel = await prisma.channel.findUnique({
        where: { id: parsedChannelId },
        select: { id: true, type: true }
      });

      if (!channel || channel.type !== 'VOICE') {
        socket.emit('socket-error', { error: 'Voice channel not found' });
        return;
      }

      leaveVoiceRoom(socket);

      const roomKey = getVoiceRoomKey(parsedChannelId);
      socket.join(roomKey);
      socket.emit('voice-participants', getVoiceParticipantList(roomKey));

      const participants = voiceParticipants.get(roomKey) || new Map();
      participants.set(socket.id, {
        userId: socket.user.userId,
        username: socket.user.username
      });
      voiceParticipants.set(roomKey, participants);

      socket.to(roomKey).emit('voice-user-joined', {
        socketId: socket.id,
        userId: socket.user.userId,
        username: socket.user.username
      });
      socket.data.voiceRoomKey = roomKey;
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { error: 'Failed to join voice' });
    }
  });

  socket.on('leave-voice', () => leaveVoiceRoom(socket));

  socket.on('voice-offer', ({ channelId, offer, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-offer', { channelId, offer, targetSocketId });
  });

  socket.on('voice-answer', ({ channelId, answer, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-answer', { channelId, answer, targetSocketId });
  });

  socket.on('voice-ice-candidate', ({ channelId, candidate, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-ice-candidate', { channelId, candidate, targetSocketId });
  });

  socket.on('disconnect', () => leaveVoiceRoom(socket));
});

await prisma.$connect();
await ensureBootstrapData();

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
