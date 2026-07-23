import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { prisma } from './prisma.js';
import { authMiddleware, comparePassword, hashPassword, signToken, verifyToken } from './auth.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3001);
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);
const MAX_CLIENT_DOWNLOAD_SIZE_MB = Number(process.env.CLIENT_DOWNLOAD_MAX_SIZE_MB || 500);
const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 200;
const CLIENT_ORIGINS = String(process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || process.env.ADMIN_USERS || '')
    .split(',')
    .map((username) => normalizeUsername(username))
    .filter(Boolean)
);
const TURN_URLS = String(process.env.TURN_URLS || process.env.TURN_URL || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const TURN_USERNAME = String(process.env.TURN_USERNAME || '').trim();
const TURN_CREDENTIAL = String(process.env.TURN_CREDENTIAL || '').trim();
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
  '.m4a',
  '.m4v',
  '.mp3',
  '.mov',
  '.mp4',
  '.ogg',
  '.oga',
  '.png',
  '.wav',
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
const clientDownloadDir = path.resolve(process.env.CLIENT_DOWNLOAD_DIR || path.resolve(__dirname, '../client-downloads'));
const clientDownloadManifestPath = path.join(clientDownloadDir, 'manifest.json');

for (const dir of [uploadDir, clientDownloadDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

const CLIENT_DOWNLOAD_PLATFORMS = {
  windows: {
    label: 'Windows',
    defaultFileName: 'WebCord-Windows.zip',
    extensions: new Set(['.zip', '.exe', '.msi']),
    contentType: 'application/octet-stream'
  },
  android: {
    label: 'Android',
    defaultFileName: 'WebCord-Android.apk',
    extensions: new Set(['.apk', '.aab']),
    contentType: 'application/vnd.android.package-archive'
  }
};

const clientDownloadUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, clientDownloadDir),
    filename: (req, file, cb) => {
      const platform = normalizeDownloadPlatform(req.params.platform);
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${platform}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: MAX_CLIENT_DOWNLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const platform = normalizeDownloadPlatform(req.params.platform);
    const config = platform ? CLIENT_DOWNLOAD_PLATFORMS[platform] : null;
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (!config || !config.extensions.has(ext)) {
      const error = new Error('Unsupported client download file.');
      error.status = 415;
      error.code = 'UNSUPPORTED_CLIENT_DOWNLOAD';
      cb(error);
      return;
    }

    cb(null, true);
  }
});

const voiceParticipants = new Map();
const callSessions = new Map();
const callParticipants = new Map();
const rateLimitBuckets = new Map();
const publicUserSelect = {
  id: true,
  username: true,
  role: true,
  displayName: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true,
  statusText: true,
  favoriteTrack: true,
  favoriteTrackUrl: true,
  favoriteTrackName: true,
  accentColor: true,
  mutedUntil: true,
  bannedUntil: true
};
const authRateLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'auth' });
const messageRateLimitConfig = { windowMs: 10_000, max: 18, keyPrefix: 'message' };
const messageRateLimit = createRateLimiter(messageRateLimitConfig);
const uploadRateLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'upload' });
const moderationRateLimit = createRateLimiter({ windowMs: 60_000, max: 12, keyPrefix: 'moderation' });
const socialRateLimit = createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'social' });
const voiceSignalRateLimitConfig = { windowMs: 10_000, max: 180, keyPrefix: 'voice-signal' };
const voiceStateRateLimitConfig = { windowMs: 10_000, max: 80, keyPrefix: 'voice-state' };
const ATTACHMENT_TYPES = new Set(['IMAGE', 'VIDEO', 'AUDIO', 'CIRCLE_VIDEO', 'FILE']);
const STORY_MEDIA_TYPES = new Set(['IMAGE', 'VIDEO']);
const USER_ROLES = new Set(['USER', 'ADMIN', 'OWNER']);
const ADMIN_ROLES = new Set(['ADMIN', 'OWNER']);
const REPORT_TARGET_TYPES = new Set(['USER', 'MESSAGE', 'DIRECT_MESSAGE']);
const REPORT_STATUSES = new Set(['OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED']);
const MODERATION_ACTIONS = new Set(['MUTE', 'UNMUTE', 'BAN', 'UNBAN']);
const MESSAGE_REACTIONS = new Set(['❤️', '👍', '😂', '🔥', '👏', '😮']);
const MAX_SIGNAL_SDP_LENGTH = 80_000;
const MAX_ICE_CANDIDATE_LENGTH = 4_096;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminUsername(username) {
  return ADMIN_USERNAMES.has(normalizeUsername(username));
}

function normalizeUserRole(value) {
  const role = String(value || 'USER').trim().toUpperCase();
  return USER_ROLES.has(role) ? role : 'USER';
}

function getEffectiveUserRole(user = {}) {
  const role = normalizeUserRole(user.role);
  if (role === 'OWNER' || isAdminUsername(user.username)) return 'OWNER';
  return role;
}

function isAdminUser(user = {}) {
  return ADMIN_ROLES.has(getEffectiveUserRole(user));
}

function canManageUserRoles(user = {}) {
  return getEffectiveUserRole(user) === 'OWNER';
}

function getVoiceIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (TURN_URLS.length > 0) {
    servers.push(
      TURN_USERNAME || TURN_CREDENTIAL
        ? { urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL }
        : { urls: TURN_URLS }
    );
  }

  return servers;
}

function normalizeDownloadPlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CLIENT_DOWNLOAD_PLATFORMS, platform) ? platform : '';
}

function readClientDownloadManifest() {
  try {
    if (!fs.existsSync(clientDownloadManifestPath)) return {};
    const manifest = JSON.parse(fs.readFileSync(clientDownloadManifestPath, 'utf8'));
    return manifest && typeof manifest === 'object' ? manifest : {};
  } catch (error) {
    console.error('Failed to read client download manifest:', error);
    return {};
  }
}

function writeClientDownloadManifest(manifest) {
  const safeManifest = manifest && typeof manifest === 'object' ? manifest : {};
  fs.writeFileSync(clientDownloadManifestPath, `${JSON.stringify(safeManifest, null, 2)}\n`);
}

function getClientDownloadFilePath(record = {}) {
  const storedFileName = path.basename(String(record.storedFileName || ''));
  if (!storedFileName) return '';
  return path.join(clientDownloadDir, storedFileName);
}

function serializeClientDownload(platform, record = null) {
  const normalizedPlatform = normalizeDownloadPlatform(platform);
  const config = CLIENT_DOWNLOAD_PLATFORMS[normalizedPlatform];
  const filePath = record ? getClientDownloadFilePath(record) : '';
  const available = Boolean(record?.storedFileName && filePath && fs.existsSync(filePath));

  return {
    platform: normalizedPlatform,
    label: config?.label || normalizedPlatform,
    available,
    url: `/downloads/${normalizedPlatform}`,
    fileName: record?.fileName || config?.defaultFileName || 'WebCord-client',
    size: available ? Number(record?.size || 0) : 0,
    sha256: available ? String(record?.sha256 || '') : '',
    updatedAt: available ? record?.updatedAt || null : null,
    updatedBy: available ? record?.updatedBy || null : null
  };
}

function listClientDownloads() {
  const manifest = readClientDownloadManifest();
  return Object.keys(CLIENT_DOWNLOAD_PLATFORMS).map((platform) => serializeClientDownload(platform, manifest[platform]));
}

async function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function saveClientDownload(platform, uploadedFile, adminUser = {}) {
  const normalizedPlatform = normalizeDownloadPlatform(platform);
  if (!normalizedPlatform) {
    throw createApiError(400, 'INVALID_DOWNLOAD_PLATFORM', 'Invalid download platform.');
  }
  if (!uploadedFile?.path || !fs.existsSync(uploadedFile.path)) {
    throw createApiError(400, 'DOWNLOAD_FILE_REQUIRED', 'A client file is required.');
  }

  const config = CLIENT_DOWNLOAD_PLATFORMS[normalizedPlatform];
  const manifest = readClientDownloadManifest();
  const previous = manifest[normalizedPlatform];
  const previousPath = previous ? getClientDownloadFilePath(previous) : '';
  const fileName = path.basename(uploadedFile.originalname || config.defaultFileName).replace(/["\r\n]/g, '_');

  manifest[normalizedPlatform] = {
    platform: normalizedPlatform,
    fileName,
    storedFileName: path.basename(uploadedFile.filename),
    mimeType: uploadedFile.mimetype || config.contentType,
    size: uploadedFile.size,
    sha256: await computeFileSha256(uploadedFile.path),
    updatedAt: new Date().toISOString(),
    updatedBy: adminUser.username || null
  };
  writeClientDownloadManifest(manifest);

  if (previousPath && previousPath !== uploadedFile.path && fs.existsSync(previousPath)) {
    fs.rmSync(previousPath, { force: true });
  }

  return serializeClientDownload(normalizedPlatform, manifest[normalizedPlatform]);
}

function deleteClientDownload(platform) {
  const normalizedPlatform = normalizeDownloadPlatform(platform);
  if (!normalizedPlatform) {
    throw createApiError(400, 'INVALID_DOWNLOAD_PLATFORM', 'Invalid download platform.');
  }

  const manifest = readClientDownloadManifest();
  const existing = manifest[normalizedPlatform];
  const filePath = existing ? getClientDownloadFilePath(existing) : '';
  if (filePath && fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  delete manifest[normalizedPlatform];
  writeClientDownloadManifest(manifest);
  return serializeClientDownload(normalizedPlatform, null);
}

function canReadWriteDirectory(dir) {
  try {
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function getReadinessSnapshot() {
  const checks = {
    database: false,
    uploads: canReadWriteDirectory(uploadDir),
    clientDownloads: canReadWriteDirectory(clientDownloadDir)
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error('Readiness database check failed:', error);
  }

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    voiceRooms: voiceParticipants.size
  };
}

function booleanFromPayload(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeVoiceAudioProfile(value) {
  const profile = String(value || '').trim();
  return ['voiceFocus', 'highFidelity', 'lowData'].includes(profile) ? profile : 'voiceFocus';
}

function normalizeVoiceAudioBitrate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 64000;
  return Math.max(24000, Math.min(128000, Math.round(parsed)));
}

function looksCircleVideoName(fileName = '') {
  const source = String(fileName || '').toLowerCase();
  return (
    source.includes('circle-video') ||
    source.includes('round-video') ||
    source.includes('video-note') ||
    source.includes('video_message') ||
    source.includes('video-message') ||
    source.includes('webcord-circle')
  );
}

function getAttachmentType(mimeType = '', fileName = '') {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('video/')) return looksCircleVideoName(fileName) ? 'CIRCLE_VIDEO' : 'VIDEO';
  return 'FILE';
}

function normalizeAttachmentType(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return ATTACHMENT_TYPES.has(normalized) ? normalized : null;
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

function isFutureDate(value) {
  return value ? new Date(value).getTime() > Date.now() : false;
}

function parseDurationMinutes(value, fallbackMinutes, maxMinutes = 525_600) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMinutes;
  return Math.min(maxMinutes, Math.max(1, Math.round(parsed)));
}

function moderationUntil(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}

function parseMessagePagination(query = {}) {
  const limit = Math.min(MAX_MESSAGE_LIMIT, Math.max(1, parsePositiveInt(query.limit) || DEFAULT_MESSAGE_LIMIT));
  const beforeId = parseOptionalPositiveInt(query.beforeId);
  return { limit, beforeId };
}

function normalizeMessageReaction(value) {
  const emoji = String(value || '').trim();
  return MESSAGE_REACTIONS.has(emoji) ? emoji : null;
}

function normalizeMessageMetadata(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function sendCaughtApiError(res, error, fallbackCode, fallbackMessage) {
  if (error?.status && error?.code) {
    return sendApiError(res, error.status, error.code, error.message || fallbackMessage);
  }

  return sendApiError(res, 500, fallbackCode, fallbackMessage);
}

function serializePublicUser(user) {
  if (!user) return null;
  const role = getEffectiveUserRole(user);
  return {
    id: user.id,
    username: user.username,
    role,
    isAdmin: ADMIN_ROLES.has(role),
    canManageRoles: role === 'OWNER',
    displayName: user.displayName || null,
    avatarUrl: user.avatarUrl || null,
    bannerUrl: user.bannerUrl || null,
    bio: user.bio || '',
    statusText: user.statusText || 'Online',
    favoriteTrack: user.favoriteTrack || '',
    favoriteTrackUrl: user.favoriteTrackUrl || null,
    favoriteTrackName: user.favoriteTrackName || null,
    accentColor: user.accentColor || '#7c5cff',
    mutedUntil: user.mutedUntil || null,
    bannedUntil: user.bannedUntil || null,
    isMuted: isFutureDate(user.mutedUntil),
    isBanned: isFutureDate(user.bannedUntil)
  };
}

function serializeModerationReport(report) {
  if (!report) return null;
  return {
    id: report.id,
    targetType: report.targetType,
    reason: report.reason,
    details: report.details || '',
    status: report.status,
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt || null,
    reporter: serializePublicUser(report.reporter),
    targetUser: serializePublicUser(report.targetUser),
    message: report.message
      ? {
          id: report.message.id,
          content: report.message.deletedAt ? '' : report.message.content,
          attachmentName: report.message.attachmentName,
          channelId: report.message.channelId,
          createdAt: report.message.createdAt
        }
      : null,
    directMessage: report.directMessage
      ? {
          id: report.directMessage.id,
          content: report.directMessage.deletedAt ? '' : report.directMessage.content,
          attachmentName: report.directMessage.attachmentName,
          conversationId: report.directMessage.conversationId,
          createdAt: report.directMessage.createdAt
        }
      : null,
    resolvedBy: serializePublicUser(report.resolvedBy)
  };
}

function serializeModerationAction(action) {
  if (!action) return null;
  return {
    id: action.id,
    action: action.action,
    reason: action.reason || '',
    metadata: action.metadata || null,
    createdAt: action.createdAt,
    actor: serializePublicUser(action.actor),
    targetUser: serializePublicUser(action.targetUser)
  };
}

function normalizeReportTargetType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return REPORT_TARGET_TYPES.has(normalized) ? normalized : '';
}

function normalizeReportStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return REPORT_STATUSES.has(normalized) ? normalized : '';
}

function reportStatusToAction(status) {
  return {
    REVIEWED: 'REPORT_REVIEWED',
    RESOLVED: 'REPORT_RESOLVED',
    DISMISSED: 'REPORT_DISMISSED'
  }[status] || '';
}

async function getBlockedUserIds(userId) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: Number(userId) },
    select: { blockedId: true }
  });
  return rows.map((row) => row.blockedId);
}

async function usersHaveBlockBetween(leftId, rightId) {
  if (!leftId || !rightId || Number(leftId) === Number(rightId)) return false;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: Number(leftId), blockedId: Number(rightId) },
        { blockerId: Number(rightId), blockedId: Number(leftId) }
      ]
    },
    select: { id: true }
  });
  return Boolean(block);
}

async function assertUserCanSend(userId) {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { mutedUntil: true, bannedUntil: true }
  });

  if (!user) throw createApiError(401, 'USER_NOT_FOUND', 'User not found.');
  if (isFutureDate(user.bannedUntil)) throw createApiError(403, 'ACCOUNT_BANNED', 'This account is banned.');
  if (isFutureDate(user.mutedUntil)) throw createApiError(403, 'ACCOUNT_MUTED', 'This account is muted.');
}

async function userCanModerateMessages(userId) {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: publicUserSelect
  });
  return isAdminUser(user);
}

function normalizeTargetSocketId(value) {
  const socketId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{3,120}$/.test(socketId) ? socketId : '';
}

function sanitizeSessionDescription(description, expectedType) {
  if (!description || typeof description !== 'object') return null;
  const type = String(description.type || '').trim().toLowerCase();
  const sdp = String(description.sdp || '');
  if (type !== expectedType || !sdp || sdp.length > MAX_SIGNAL_SDP_LENGTH) return null;
  return { type, sdp };
}

function sanitizeIceCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const candidateText = String(candidate.candidate || '');
  if (!candidateText || candidateText.length > MAX_ICE_CANDIDATE_LENGTH) return null;
  const sdpMid = candidate.sdpMid === undefined || candidate.sdpMid === null ? null : String(candidate.sdpMid).slice(0, 80);
  const sdpMLineIndex = Number(candidate.sdpMLineIndex);
  return {
    candidate: candidateText,
    sdpMid,
    sdpMLineIndex: Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 ? sdpMLineIndex : null
  };
}

function sanitizeSignalPayload(eventName, payload = {}) {
  if (eventName.endsWith('offer')) {
    const offer = sanitizeSessionDescription(payload.offer, 'offer');
    return offer ? { offer } : null;
  }
  if (eventName.endsWith('answer')) {
    const answer = sanitizeSessionDescription(payload.answer, 'answer');
    return answer ? { answer } : null;
  }
  if (eventName.endsWith('ice-candidate')) {
    const candidate = sanitizeIceCandidate(payload.candidate);
    return candidate ? { candidate } : null;
  }
  return null;
}

function sanitizeProfilePayload(body = {}) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
    data.bio = String(body.bio ?? '').trim().slice(0, 280);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
    data.displayName = String(body.displayName ?? '').trim().slice(0, 40) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'statusText')) {
    data.statusText = String(body.statusText ?? 'Online').trim().slice(0, 80) || 'Online';
  }

  if (Object.prototype.hasOwnProperty.call(body, 'favoriteTrack')) {
    data.favoriteTrack = String(body.favoriteTrack ?? '').trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'favoriteTrackUrl')) {
    data.favoriteTrackUrl = body.favoriteTrackUrl ? String(body.favoriteTrackUrl).trim() : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'favoriteTrackName')) {
    data.favoriteTrackName = String(body.favoriteTrackName ?? '').trim().slice(0, 160) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'accentColor')) {
    const accentColor = String(body.accentColor || '').trim();
    data.accentColor = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#7c5cff';
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
    data.avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bannerUrl')) {
    data.bannerUrl = body.bannerUrl ? String(body.bannerUrl).trim() : null;
  }

  return data;
}

async function adminMiddleware(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: publicUserSelect
    });

    if (!user || !isAdminUser(user)) {
      return sendApiError(res, 403, 'ADMIN_FORBIDDEN', 'Admin access denied.');
    }

    req.adminUser = serializePublicUser(user);
    return next();
  } catch (error) {
    console.error('Admin authorization failed:', error);
    return sendApiError(res, 500, 'ADMIN_AUTH_FAILED', 'Failed to verify admin access.');
  }
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
  if (conversation.type === 'GROUP') return null;
  if (conversation.userOneId === userId) return conversation.userTwo;
  if (conversation.userTwoId === userId) return conversation.userOne;
  return conversation.members?.find((member) => member.userId !== userId)?.user || null;
}

function getConversationMembers(conversation) {
  const members = conversation.members?.map((member) => member.user).filter(Boolean) || [];
  if (members.length > 0) return members;
  return [conversation.userOne, conversation.userTwo].filter(Boolean);
}

function getConversationMemberIds(conversation) {
  const memberIds = conversation.members?.map((member) => member.userId).filter(Boolean) || [];
  if (memberIds.length > 0) return [...new Set(memberIds.map(Number))];
  return [conversation.userOneId, conversation.userTwoId].filter(Boolean).map(Number);
}

async function isConversationMember(conversationId, userId) {
  const member = await prisma.directConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: Number(conversationId),
        userId: Number(userId)
      }
    }
  });
  if (member) return true;

  const conversation = await prisma.directConversation.findUnique({
    where: { id: Number(conversationId) },
    select: { userOneId: true, userTwoId: true }
  });
  return Boolean(conversation && [conversation.userOneId, conversation.userTwoId].includes(Number(userId)));
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
    user: serializePublicUser(counterpart)
  };
}

function serializeFriendship(friendship, currentUserId) {
  const counterpart = getFriendshipCounterpart(friendship, currentUserId);
  return {
    id: friendship.id,
    createdAt: friendship.createdAt,
    user: serializePublicUser(counterpart)
  };
}

function serializeDirectConversation(conversation, currentUserId) {
  const counterpart = getConversationCounterpart(conversation, currentUserId);
  const lastMessage = conversation.messages?.[0] || null;
  const members = getConversationMembers(conversation).map(serializePublicUser).filter(Boolean);
  const type = conversation.type || 'DIRECT';
  const fallbackTitle = type === 'GROUP'
    ? members
        .filter((member) => member.id !== currentUserId)
        .map((member) => member.displayName || member.username)
        .slice(0, 4)
        .join(', ')
    : counterpart?.displayName || counterpart?.username || 'Direct message';

  return {
    id: conversation.id,
    type,
    title: conversation.title || fallbackTitle || 'Group',
    avatarUrl: conversation.avatarUrl || null,
    updatedAt: conversation.updatedAt,
    user: serializePublicUser(counterpart),
    members,
    memberCount: members.length,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          attachmentType: lastMessage.attachmentType,
          attachmentName: lastMessage.attachmentName,
          createdAt: lastMessage.createdAt,
          author: serializePublicUser(lastMessage.author)
        }
      : null
  };
}

function serializeStory(story, currentUserId) {
  const views = story.views || [];
  return {
    id: story.id,
    caption: story.caption || '',
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType || 'IMAGE',
    musicUrl: story.musicUrl || null,
    musicTitle: story.musicTitle || '',
    musicArtist: story.musicArtist || '',
    musicAttachment: story.musicAttachment || '',
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    author: serializePublicUser(story.author),
    viewed: views.some((view) => view.viewerId === currentUserId),
    viewCount: views.length
  };
}

function normalizeStoryMediaType(value, mediaUrl = '') {
  const raw = String(value || '').toUpperCase();
  if (STORY_MEDIA_TYPES.has(raw)) return raw;
  const source = String(mediaUrl || '').toLowerCase().split('?')[0];
  if (['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.3gp'].some((ext) => source.endsWith(ext))) {
    return 'VIDEO';
  }
  return 'IMAGE';
}

function sanitizeStoryMusicPayload(body = {}) {
  const musicUrl = String(body.musicUrl || '').trim();
  return {
    musicUrl: musicUrl || null,
    musicTitle: String(body.musicTitle || '').trim().slice(0, 96),
    musicArtist: String(body.musicArtist || '').trim().slice(0, 96),
    musicAttachment: String(body.musicAttachment || '').trim().slice(0, 128)
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
  const [friendships, requests, conversations, blockedRows] = await Promise.all([
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
        OR: [
          { userOneId: userId },
          { userTwoId: userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        members: {
          include: {
            user: { select: publicUserSelect }
          },
          orderBy: { joinedAt: 'asc' }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: publicUserSelect }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }]
      },
      select: { blockerId: true, blockedId: true }
    })
  ]);
  const blockedIds = new Set(
    blockedRows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId))
  );
  const hasBlockedMember = (conversation) =>
    getConversationMemberIds(conversation).some((memberId) => Number(memberId) !== Number(userId) && blockedIds.has(Number(memberId)));

  return {
    friends: friendships
      .filter((item) => !blockedIds.has(getFriendshipCounterpart(item, userId)?.id))
      .map((item) => serializeFriendship(item, userId)),
    requests: requests
      .filter((item) => !blockedIds.has((item.senderId === userId ? item.receiverId : item.senderId)))
      .map((item) => serializeFriendRequest(item, userId)),
    conversations: conversations
      .filter((item) => item.type !== 'DIRECT' || !hasBlockedMember(item))
      .map((item) => serializeDirectConversation(item, userId)),
    blockedUserIds: [...blockedIds]
  };
}

function emitSocialRefresh(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean).map(Number))];
  uniqueUserIds.forEach((userId) => {
    io.to(`user:${userId}`).emit('social:refresh');
  });
}

function emitStoriesRefresh(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean).map(Number))];
  uniqueUserIds.forEach((userId) => {
    io.to(`user:${userId}`).emit('stories:refresh');
  });
}

function serializeCallSession(call) {
  if (!call) return null;
  return {
    id: call.id,
    conversationId: call.conversationId,
    title: call.title,
    video: Boolean(call.video),
    callerId: call.callerId,
    memberIds: call.memberIds,
    status: call.status,
    createdAt: call.createdAt
  };
}

function getCallRoomKey(callId) {
  const value = String(callId || '').trim();
  return value ? `call:${value}` : '';
}

function getCallParticipantList(roomKey) {
  const participants = callParticipants.get(roomKey) || new Map();
  return Array.from(participants.entries()).map(([socketId, participant]) => serializeVoiceParticipant(socketId, participant));
}

function leaveCallRoom(socket) {
  const roomKey = socket.data.callRoomKey;
  if (!roomKey) return;
  const callId = socket.data.callId;

  socket.leave(roomKey);

  const participants = callParticipants.get(roomKey);
  if (participants) {
    participants.delete(socket.id);
    if (participants.size === 0) {
      callParticipants.delete(roomKey);
      if (callId) callSessions.delete(callId);
    }
  }

  socket.to(roomKey).emit('call-user-left', { socketId: socket.id, username: socket.user.username });
  delete socket.data.callRoomKey;
  delete socket.data.callId;
}

function emitCallSignal(socket, eventName, { callId, targetSocketId, ...payload }) {
  if (!checkSocketRateLimit(socket, voiceSignalRateLimitConfig)) return;
  const roomKey = getCallRoomKey(callId);
  if (!roomKey || socket.data.callRoomKey !== roomKey) return;
  const sanitizedPayload = sanitizeSignalPayload(eventName, payload);
  if (!sanitizedPayload) {
    socket.emit('socket-error', { code: 'INVALID_CALL_SIGNAL', error: 'Invalid call signal' });
    return;
  }
  const safeTargetSocketId = normalizeTargetSocketId(targetSocketId);

  const signalPayload = {
    ...sanitizedPayload,
    callId,
    fromSocketId: socket.id,
    targetSocketId: safeTargetSocketId || undefined
  };

  if (safeTargetSocketId) {
    const targetSocket = io.sockets.sockets.get(safeTargetSocketId);
    if (!targetSocket || targetSocket.data.callRoomKey !== roomKey) return;
    io.to(safeTargetSocketId).emit(eventName, signalPayload);
    return;
  }

  socket.to(roomKey).emit(eventName, signalPayload);
}

async function createChannelMessage({ channelId, userId, content, attachmentUrl, attachmentType, attachmentName, transcript, forwardedFromName, replyToId }) {
  await assertUserCanSend(userId);

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true, guildId: true }
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

  const message = await prisma.message.create({
    data: {
      channelId,
      content,
      authorId: userId,
      attachmentUrl,
      attachmentType,
      attachmentName,
      transcript: normalizeMessageMetadata(transcript, 4_000),
      forwardedFromName: normalizeMessageMetadata(forwardedFromName, 120),
      replyToId: replyToId || null
    },
    include: {
      author: { select: publicUserSelect },
      reactions: { select: { emoji: true, userId: true } },
      replyTo: {
        include: {
          author: { select: publicUserSelect }
        }
      }
    }
  });

  return { ...message, guildId: channel.guildId };
}

async function createDirectConversationMessage({ conversationId, userId, content, attachmentUrl, attachmentType, attachmentName, transcript, forwardedFromName, replyToId }) {
  const conversation = await prisma.directConversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        include: {
          user: { select: publicUserSelect }
        }
      }
    }
  });

  if (!conversation || !getConversationMemberIds(conversation).includes(userId)) {
    return { conversation: null, message: null };
  }

  if (conversation.type === 'DIRECT') {
    const counterpartId = getConversationMemberIds(conversation).find((memberId) => Number(memberId) !== Number(userId));
    if (counterpartId && await usersHaveBlockBetween(userId, counterpartId)) {
      throw createApiError(403, 'USER_BLOCKED', 'This direct conversation is blocked.');
    }
  }

  await assertUserCanSend(userId);

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
      transcript: normalizeMessageMetadata(transcript, 4_000),
      forwardedFromName: normalizeMessageMetadata(forwardedFromName, 120),
      replyToId: replyToId || null
    },
    include: {
      author: { select: publicUserSelect },
      reactions: { select: { emoji: true, userId: true } },
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

  callback(null, false);
}

app.disable('x-powered-by');
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

app.get('/api/ready', async (_req, res) => {
  const readiness = await getReadinessSnapshot();
  res.status(readiness.ok ? 200 : 503).json(readiness);
});

app.get('/api/voice/ice-servers', authMiddleware, (_req, res) => {
  res.json({ iceServers: getVoiceIceServers() });
});

app.get('/api/downloads', (_req, res) => {
  res.json({ downloads: listClientDownloads() });
});

app.get('/api/downloads/:platform', (req, res) => {
  const platform = normalizeDownloadPlatform(req.params.platform);
  if (!platform) {
    return sendApiError(res, 404, 'DOWNLOAD_NOT_FOUND', 'Download not found.');
  }

  const manifest = readClientDownloadManifest();
  return res.json({ download: serializeClientDownload(platform, manifest[platform]) });
});

app.get('/downloads/:platform', (req, res) => {
  const platform = normalizeDownloadPlatform(req.params.platform);
  if (!platform) {
    return sendApiError(res, 404, 'DOWNLOAD_NOT_FOUND', 'Download not found.');
  }

  const manifest = readClientDownloadManifest();
  const record = manifest[platform];
  const download = serializeClientDownload(platform, record);
  const filePath = record ? getClientDownloadFilePath(record) : '';
  if (!download.available || !filePath) {
    return sendApiError(res, 404, 'DOWNLOAD_NOT_READY', 'This client download is not available yet.');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.download(filePath, download.fileName, {
    headers: {
      'Content-Type': record.mimeType || CLIENT_DOWNLOAD_PLATFORMS[platform].contentType
    }
  });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    if (isAdminUsername(username)) {
      return sendApiError(res, 403, 'ADMIN_USERNAME_RESERVED', 'This username is reserved.');
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
      user: serializePublicUser(user)
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

    if (isFutureDate(user.bannedUntil)) {
      return sendApiError(res, 403, 'ACCOUNT_BANNED', 'This account is banned.');
    }

    await ensureBootstrapData();

    return res.json({
      token: signToken(user),
      user: serializePublicUser(user)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      users,
      guilds,
      textChannels,
      voiceChannels,
      messages,
      directConversations,
      directMessages,
      pendingFriendRequests,
      recentUsers,
      roleUsers,
      manageableUsers,
      openReports,
      recentReports,
      recentModerationActions,
      mutedUsers,
      bannedUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.guild.count(),
      prisma.channel.count({ where: { type: 'TEXT' } }),
      prisma.channel.count({ where: { type: 'VOICE' } }),
      prisma.message.count({ where: { deletedAt: null } }),
      prisma.directConversation.count(),
      prisma.directMessage.count({ where: { deletedAt: null } }),
      prisma.friendRequest.count({ where: { status: 'PENDING' } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: publicUserSelect
      }),
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'OWNER'] } },
        orderBy: [{ role: 'desc' }, { username: 'asc' }],
        take: 50,
        select: publicUserSelect
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: publicUserSelect
      }),
      prisma.moderationReport.count({ where: { status: 'OPEN' } }),
      prisma.moderationReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          reporter: { select: publicUserSelect },
          targetUser: { select: publicUserSelect },
          message: true,
          directMessage: true,
          resolvedBy: { select: publicUserSelect }
        }
      }),
      prisma.moderationAction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          actor: { select: publicUserSelect },
          targetUser: { select: publicUserSelect }
        }
      }),
      prisma.user.count({ where: { mutedUntil: { gt: new Date() } } }),
      prisma.user.count({ where: { bannedUntil: { gt: new Date() } } })
    ]);

    return res.json({
      admin: req.adminUser,
      allowedAdmins: [...ADMIN_USERNAMES].sort(),
      canManageRoles: canManageUserRoles(req.adminUser),
      stats: {
        users,
        guilds,
        textChannels,
        voiceChannels,
        messages,
        directConversations,
        directMessages,
        pendingFriendRequests,
        voiceRooms: voiceParticipants.size,
        openReports,
        mutedUsers,
        bannedUsers
      },
      recentUsers: recentUsers.map(serializePublicUser),
      roleUsers: roleUsers.map(serializePublicUser),
      manageableUsers: manageableUsers.map(serializePublicUser),
      downloads: listClientDownloads(),
      recentReports: recentReports.map(serializeModerationReport),
      recentModerationActions: recentModerationActions.map(serializeModerationAction),
      runtime: {
        nodeEnv: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.round(process.uptime())
      }
    });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'ADMIN_OVERVIEW_FAILED', 'Failed to load admin overview.');
  }
});

app.put('/api/admin/downloads/:platform', authMiddleware, adminMiddleware, (req, res, next) => {
  clientDownloadUpload.single('file')(req, res, next);
}, async (req, res) => {
  try {
    const download = await saveClientDownload(req.params.platform, req.file, req.adminUser);
    return res.json({ download, downloads: listClientDownloads() });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.rmSync(req.file.path, { force: true });
    }
    return sendCaughtApiError(res, error, 'DOWNLOAD_UPDATE_FAILED', 'Failed to update client download.');
  }
});

app.delete('/api/admin/downloads/:platform', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const download = deleteClientDownload(req.params.platform);
    return res.json({ download, downloads: listClientDownloads() });
  } catch (error) {
    return sendCaughtApiError(res, error, 'DOWNLOAD_DELETE_FAILED', 'Failed to delete client download.');
  }
});

app.patch('/api/admin/users/:userId/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!canManageUserRoles(req.adminUser)) {
      return sendApiError(res, 403, 'ROLE_MANAGEMENT_FORBIDDEN', 'Only owners can assign admin roles.');
    }

    const userId = parsePositiveInt(req.params.userId);
    const role = normalizeUserRole(req.body.role);

    if (!userId) {
      return sendApiError(res, 400, 'INVALID_USER_ID', 'Invalid user id.');
    }

    if (!USER_ROLES.has(String(req.body.role || '').trim().toUpperCase())) {
      return sendApiError(res, 400, 'INVALID_USER_ROLE', 'Invalid user role.');
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect
    });

    if (!target) {
      return sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    if (getEffectiveUserRole(target) === 'OWNER' && role !== 'OWNER' && !isAdminUsername(target.username)) {
      const ownerCount = await prisma.user.count({
        where: { role: 'OWNER', id: { not: target.id } }
      });

      if (ownerCount === 0 && ADMIN_USERNAMES.size === 0) {
        return sendApiError(res, 409, 'LAST_OWNER_REQUIRED', 'At least one owner must remain.');
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: publicUserSelect
    });

    return res.json({ user: serializePublicUser(updated) });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'ROLE_UPDATE_FAILED', 'Failed to update user role.');
  }
});

app.get('/api/admin/moderation/reports', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const status = normalizeReportStatus(req.query.status) || undefined;
    const reports = await prisma.moderationReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { select: publicUserSelect },
        targetUser: { select: publicUserSelect },
        message: true,
        directMessage: true,
        resolvedBy: { select: publicUserSelect }
      }
    });

    return res.json(reports.map(serializeModerationReport));
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'REPORTS_FETCH_FAILED', 'Failed to load moderation reports.');
  }
});

app.patch('/api/admin/moderation/reports/:reportId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reportId = parsePositiveInt(req.params.reportId);
    const status = normalizeReportStatus(req.body.status);
    const reason = String(req.body.reason || '').trim().slice(0, 500);

    if (!reportId) {
      return sendApiError(res, 400, 'INVALID_REPORT_ID', 'Invalid report id.');
    }
    if (!status || status === 'OPEN') {
      return sendApiError(res, 400, 'INVALID_REPORT_STATUS', 'Invalid report status.');
    }

    const action = reportStatusToAction(status);
    const report = await prisma.$transaction(async (tx) => {
      const updated = await tx.moderationReport.update({
        where: { id: reportId },
        data: {
          status,
          resolvedById: req.user.userId,
          resolvedAt: new Date()
        },
        include: {
          reporter: { select: publicUserSelect },
          targetUser: { select: publicUserSelect },
          message: true,
          directMessage: true,
          resolvedBy: { select: publicUserSelect }
        }
      });

      if (action) {
        await tx.moderationAction.create({
          data: {
            actorId: req.user.userId,
            targetUserId: updated.targetUserId,
            action,
            reason,
            metadata: { reportId: updated.id, targetType: updated.targetType }
          }
        });
      }

      return updated;
    });

    return res.json({ report: serializeModerationReport(report) });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'REPORT_UPDATE_FAILED', 'Failed to update report.');
  }
});

app.post('/api/admin/users/:userId/moderation', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.userId);
    const action = String(req.body.action || '').trim().toUpperCase();
    const reason = String(req.body.reason || '').trim().slice(0, 500);

    if (!userId) {
      return sendApiError(res, 400, 'INVALID_USER_ID', 'Invalid user id.');
    }
    if (!MODERATION_ACTIONS.has(action)) {
      return sendApiError(res, 400, 'INVALID_MODERATION_ACTION', 'Invalid moderation action.');
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect
    });
    if (!target) {
      return sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }
    if (String(target.id) === String(req.user.userId)) {
      return sendApiError(res, 400, 'SELF_MODERATION_FORBIDDEN', 'You cannot moderate yourself.');
    }
    if (getEffectiveUserRole(target) === 'OWNER' && getEffectiveUserRole(req.adminUser) !== 'OWNER') {
      return sendApiError(res, 403, 'OWNER_MODERATION_FORBIDDEN', 'Only owners can moderate owners.');
    }

    const data = {};
    let until = null;
    if (action === 'MUTE') {
      const minutes = parseDurationMinutes(req.body.durationMinutes, 60, 43_200);
      until = moderationUntil(minutes);
      data.mutedUntil = until;
    } else if (action === 'UNMUTE') {
      data.mutedUntil = null;
    } else if (action === 'BAN') {
      const minutes = parseDurationMinutes(req.body.durationMinutes, 525_600, 5_256_000);
      until = moderationUntil(minutes);
      data.bannedUntil = until;
    } else if (action === 'UNBAN') {
      data.bannedUntil = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data,
        select: publicUserSelect
      });

      await tx.moderationAction.create({
        data: {
          actorId: req.user.userId,
          targetUserId: userId,
          action,
          reason,
          metadata: until ? { until: until.toISOString() } : {}
        }
      });

      return user;
    });

    emitSocialRefresh([userId]);
    return res.json({ user: serializePublicUser(updated) });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'MODERATION_ACTION_FAILED', 'Failed to apply moderation action.');
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
      currentUser: serializePublicUser(currentUser),
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
    return res.json(serializePublicUser(currentUser));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.patch('/api/me/profile', authMiddleware, async (req, res) => {
  try {
    const currentUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: sanitizeProfilePayload(req.body),
      select: publicUserSelect
    });

    emitSocialRefresh([req.user.userId]);
    return res.json(serializePublicUser(currentUser));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/me/blocks', authMiddleware, async (req, res) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: { select: publicUserSelect }
      }
    });

    return res.json(blocks.map((block) => ({
      id: block.id,
      createdAt: block.createdAt,
      user: serializePublicUser(block.blocked)
    })));
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'BLOCKS_FETCH_FAILED', 'Failed to fetch blocked users.');
  }
});

app.post('/api/users/:userId/block', authMiddleware, socialRateLimit, async (req, res) => {
  try {
    const blockedId = parsePositiveInt(req.params.userId);
    const blockerId = req.user.userId;

    if (!blockedId) {
      return sendApiError(res, 400, 'INVALID_USER_ID', 'Invalid user id.');
    }
    if (blockedId === blockerId) {
      return sendApiError(res, 400, 'SELF_BLOCK_FORBIDDEN', 'You cannot block yourself.');
    }

    const target = await prisma.user.findUnique({
      where: { id: blockedId },
      select: publicUserSelect
    });
    if (!target) {
      return sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {}
      });

      await tx.friendRequest.updateMany({
        where: {
          status: 'PENDING',
          OR: [
            { senderId: blockerId, receiverId: blockedId },
            { senderId: blockedId, receiverId: blockerId }
          ]
        },
        data: { status: 'DECLINED' }
      });
    });

    emitSocialRefresh([blockerId, blockedId]);
    return res.status(201).json({ user: serializePublicUser(target) });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'BLOCK_USER_FAILED', 'Failed to block user.');
  }
});

app.delete('/api/users/:userId/block', authMiddleware, socialRateLimit, async (req, res) => {
  try {
    const blockedId = parsePositiveInt(req.params.userId);
    const blockerId = req.user.userId;

    if (!blockedId) {
      return sendApiError(res, 400, 'INVALID_USER_ID', 'Invalid user id.');
    }

    await prisma.userBlock.deleteMany({
      where: { blockerId, blockedId }
    });

    emitSocialRefresh([blockerId, blockedId]);
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'UNBLOCK_USER_FAILED', 'Failed to unblock user.');
  }
});

app.post('/api/moderation/reports', authMiddleware, moderationRateLimit, async (req, res) => {
  try {
    const reporterId = req.user.userId;
    const targetType = normalizeReportTargetType(req.body.targetType);
    const reason = String(req.body.reason || '').trim().slice(0, 120);
    const details = String(req.body.details || '').trim().slice(0, 700);
    let targetUserId = parseOptionalPositiveInt(req.body.targetUserId);
    let messageId = null;
    let directMessageId = null;

    if (!targetType) {
      return sendApiError(res, 400, 'INVALID_REPORT_TARGET', 'Invalid report target.');
    }
    if (reason.length < 3) {
      return sendApiError(res, 400, 'REPORT_REASON_REQUIRED', 'Report reason is required.');
    }

    if (targetType === 'USER') {
      if (!targetUserId || targetUserId === reporterId) {
        return sendApiError(res, 400, 'INVALID_REPORT_TARGET', 'Invalid reported user.');
      }
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true }
      });
      if (!target) return sendApiError(res, 404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found.');
    }

    if (targetType === 'MESSAGE') {
      messageId = parseOptionalPositiveInt(req.body.messageId);
      if (!messageId) return sendApiError(res, 400, 'INVALID_REPORT_TARGET', 'Invalid message report.');
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { authorId: true }
      });
      if (!message) return sendApiError(res, 404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found.');
      targetUserId = message.authorId;
    }

    if (targetType === 'DIRECT_MESSAGE') {
      directMessageId = parseOptionalPositiveInt(req.body.directMessageId);
      if (!directMessageId) return sendApiError(res, 400, 'INVALID_REPORT_TARGET', 'Invalid direct message report.');
      const directMessage = await prisma.directMessage.findUnique({
        where: { id: directMessageId },
        select: { authorId: true, conversationId: true }
      });
      if (!directMessage) return sendApiError(res, 404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found.');
      if (!await isConversationMember(directMessage.conversationId, reporterId)) {
        return sendApiError(res, 403, 'REPORT_FORBIDDEN', 'You cannot report a message from this conversation.');
      }
      targetUserId = directMessage.authorId;
    }

    if (targetUserId === reporterId) {
      return sendApiError(res, 400, 'SELF_REPORT_FORBIDDEN', 'You cannot report yourself.');
    }

    const report = await prisma.moderationReport.create({
      data: {
        reporterId,
        targetType,
        targetUserId,
        messageId,
        directMessageId,
        reason,
        details
      },
      include: {
        reporter: { select: publicUserSelect },
        targetUser: { select: publicUserSelect },
        message: true,
        directMessage: true,
        resolvedBy: { select: publicUserSelect }
      }
    });

    return res.status(201).json({ report: serializeModerationReport(report) });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'REPORT_CREATE_FAILED', 'Failed to create report.');
  }
});

app.get('/api/stories', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const friendRows = await prisma.friendship.findMany({
      where: {
        OR: [{ userOneId: req.user.userId }, { userTwoId: req.user.userId }]
      },
      select: { userOneId: true, userTwoId: true }
    });
    const visibleAuthorIds = [
      req.user.userId,
      ...friendRows.map((row) => row.userOneId === req.user.userId ? row.userTwoId : row.userOneId)
    ];
    const stories = await prisma.story.findMany({
      where: {
        expiresAt: { gt: now },
        authorId: { in: [...new Set(visibleAuthorIds)] }
      },
      include: {
        author: { select: publicUserSelect },
        views: true
      },
      orderBy: [{ createdAt: 'desc' }]
    });
    return res.json(stories.map((story) => serializeStory(story, req.user.userId)));
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'STORIES_FETCH_FAILED', 'Failed to fetch stories');
  }
});

app.post('/api/stories', authMiddleware, async (req, res) => {
  try {
    const mediaUrl = String(req.body.mediaUrl || '').trim();
    const caption = String(req.body.caption || '').trim().slice(0, 180);
    const music = sanitizeStoryMusicPayload(req.body);
    const mediaType = normalizeStoryMediaType(req.body.mediaType, mediaUrl);
    if (!mediaUrl) {
      return sendApiError(res, 400, 'STORY_MEDIA_REQUIRED', 'Story media is required');
    }

    const story = await prisma.story.create({
      data: {
        authorId: req.user.userId,
        mediaUrl,
        mediaType,
        caption,
        ...music,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      include: {
        author: { select: publicUserSelect },
        views: true
      }
    });

    const friendRows = await prisma.friendship.findMany({
      where: {
        OR: [{ userOneId: req.user.userId }, { userTwoId: req.user.userId }]
      },
      select: { userOneId: true, userTwoId: true }
    });
    emitStoriesRefresh([
      req.user.userId,
      ...friendRows.map((row) => (row.userOneId === req.user.userId ? row.userTwoId : row.userOneId))
    ]);
    return res.status(201).json(serializeStory(story, req.user.userId));
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'STORY_CREATE_FAILED', 'Failed to create story');
  }
});

app.post('/api/stories/:storyId/view', authMiddleware, async (req, res) => {
  try {
    const storyId = Number(req.params.storyId);
    if (!storyId || Number.isNaN(storyId)) {
      return sendApiError(res, 400, 'INVALID_STORY_ID', 'Invalid story id');
    }

    const story = await prisma.story.findFirst({
      where: { id: storyId, expiresAt: { gt: new Date() } },
      select: { id: true }
    });
    if (!story) {
      return sendApiError(res, 404, 'STORY_NOT_FOUND', 'Story not found');
    }

    await prisma.storyView.upsert({
      where: {
        storyId_viewerId: {
          storyId,
          viewerId: req.user.userId
        }
      },
      create: {
        storyId,
        viewerId: req.user.userId
      },
      update: { viewedAt: new Date() }
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'STORY_VIEW_FAILED', 'Failed to mark story as viewed');
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

    if (await usersHaveBlockBetween(currentUserId, targetUser.id)) {
      return sendApiError(res, 403, 'USER_BLOCKED', 'Friend requests are blocked for this user.');
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

    if (nextStatus === 'ACCEPTED' && await usersHaveBlockBetween(request.senderId, request.receiverId)) {
      return sendApiError(res, 403, 'USER_BLOCKED', 'This friend request is blocked.');
    }

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
          create: {
            type: 'DIRECT',
            userOneId,
            userTwoId,
            members: {
              create: [
                { userId: userOneId },
                { userId: userTwoId }
              ]
            }
          },
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

    if (await usersHaveBlockBetween(currentUserId, targetUserId)) {
      return sendApiError(res, 403, 'USER_BLOCKED', 'This direct conversation is blocked.');
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
      create: {
        type: 'DIRECT',
        userOneId,
        userTwoId,
        members: {
          create: [
            { userId: userOneId },
            { userId: userTwoId }
          ]
        }
      },
      update: {},
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        members: {
          include: {
            user: { select: publicUserSelect }
          },
          orderBy: { joinedAt: 'asc' }
        },
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

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const title = String(req.body.title || '').trim().slice(0, 80);
    const avatarUrl = req.body.avatarUrl ? String(req.body.avatarUrl).trim() : null;
    const requestedIds = Array.isArray(req.body.userIds)
      ? req.body.userIds.map((value) => Number(value)).filter((value) => value && !Number.isNaN(value))
      : [];
    const memberIds = [...new Set([currentUserId, ...requestedIds])];

    if (!title) {
      return sendApiError(res, 400, 'GROUP_TITLE_REQUIRED', 'Group title is required');
    }

    if (memberIds.length < 3) {
      return sendApiError(res, 400, 'GROUP_MEMBERS_REQUIRED', 'Choose at least two friends for a group');
    }

    if (memberIds.length > 50) {
      return sendApiError(res, 400, 'GROUP_TOO_LARGE', 'Groups are limited to 50 members');
    }

    const requestedFriendIds = memberIds.filter((userId) => userId !== currentUserId);
    const blockedLinks = await prisma.userBlock.count({
      where: {
        OR: requestedFriendIds.flatMap((friendId) => [
          { blockerId: currentUserId, blockedId: friendId },
          { blockerId: friendId, blockedId: currentUserId }
        ])
      }
    });

    if (blockedLinks > 0) {
      return sendApiError(res, 403, 'GROUP_BLOCKED_USER', 'Groups cannot include blocked users.');
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: requestedFriendIds.flatMap((friendId) => {
          const [userOneId, userTwoId] = normalizeUserPair(currentUserId, friendId);
          return [{ userOneId, userTwoId }];
        })
      }
    });

    if (friendships.length !== requestedFriendIds.length) {
      return sendApiError(res, 403, 'GROUP_FRIENDS_ONLY', 'Groups can only include friends');
    }

    const conversation = await prisma.directConversation.create({
      data: {
        type: 'GROUP',
        title,
        avatarUrl,
        ownerId: currentUserId,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: userId === currentUserId ? 'OWNER' : 'MEMBER'
          }))
        }
      },
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        members: {
          include: {
            user: { select: publicUserSelect }
          },
          orderBy: { joinedAt: 'asc' }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: publicUserSelect }
          }
        }
      }
    });

    emitSocialRefresh(memberIds);
    return res.status(201).json(serializeDirectConversation(conversation, currentUserId));
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'GROUP_CREATE_FAILED', 'Failed to create group');
  }
});

app.post('/api/dms/:conversationId/calls', authMiddleware, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!conversationId || Number.isNaN(conversationId)) {
      return sendApiError(res, 400, 'INVALID_CONVERSATION_ID', 'Invalid conversation id');
    }

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: {
        userOne: { select: publicUserSelect },
        userTwo: { select: publicUserSelect },
        members: {
          include: {
            user: { select: publicUserSelect }
          },
          orderBy: { joinedAt: 'asc' }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: publicUserSelect }
          }
        }
      }
    });

    if (!conversation || !getConversationMemberIds(conversation).includes(req.user.userId)) {
      return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    if (conversation.type === 'DIRECT') {
      const counterpartId = getConversationMemberIds(conversation).find((memberId) => Number(memberId) !== Number(req.user.userId));
      if (counterpartId && await usersHaveBlockBetween(req.user.userId, counterpartId)) {
        return sendApiError(res, 403, 'USER_BLOCKED', 'This direct call is blocked.');
      }
    }

    const serialized = serializeDirectConversation(conversation, req.user.userId);
    const call = {
      id: crypto.randomUUID(),
      conversationId,
      title: serialized.title,
      video: booleanFromPayload(req.body.video),
      callerId: req.user.userId,
      memberIds: getConversationMemberIds(conversation),
      status: 'RINGING',
      createdAt: new Date().toISOString()
    };
    callSessions.set(call.id, call);

    const payload = serializeCallSession(call);
    call.memberIds.forEach((userId) => {
      io.to(`user:${userId}`).emit(userId === req.user.userId ? 'call:outgoing' : 'call:incoming', payload);
    });

    return res.status(201).json(payload);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'CALL_START_FAILED', 'Failed to start call');
  }
});

app.post('/api/calls/:callId/respond', authMiddleware, async (req, res) => {
  try {
    const callId = String(req.params.callId || '').trim();
    const action = String(req.body.action || '').toUpperCase();
    const call = callSessions.get(callId);

    if (!call || !call.memberIds.includes(req.user.userId)) {
      return sendApiError(res, 404, 'CALL_NOT_FOUND', 'Call not found');
    }

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      return sendApiError(res, 400, 'INVALID_CALL_ACTION', 'Invalid call action');
    }

    if (action === 'ACCEPT') {
      call.status = 'ACTIVE';
      callSessions.set(call.id, call);
      const payload = serializeCallSession(call);
      call.memberIds.forEach((userId) => io.to(`user:${userId}`).emit('call:accepted', payload));
      return res.json(payload);
    }

    io.to(`user:${call.callerId}`).emit('call:declined', {
      ...serializeCallSession(call),
      declinedBy: req.user.userId
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'CALL_RESPONSE_FAILED', 'Failed to respond to call');
  }
});

app.post('/api/calls/:callId/end', authMiddleware, async (req, res) => {
  try {
    const callId = String(req.params.callId || '').trim();
    const call = callSessions.get(callId);
    if (!call || !call.memberIds.includes(req.user.userId)) {
      return sendApiError(res, 404, 'CALL_NOT_FOUND', 'Call not found');
    }

    const payload = {
      ...serializeCallSession(call),
      endedBy: req.user.userId
    };
    call.memberIds.forEach((userId) => io.to(`user:${userId}`).emit('call:ended', payload));
    const roomKey = getCallRoomKey(callId);
    io.to(roomKey).emit('call:ended', payload);
    callSessions.delete(callId);
    callParticipants.delete(roomKey);
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'CALL_END_FAILED', 'Failed to end call');
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
      where: { id: conversationId },
      include: {
        members: true
      }
    });

    if (!conversation || !getConversationMemberIds(conversation).includes(currentUserId)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.type === 'DIRECT') {
      const counterpartId = getConversationMemberIds(conversation).find((memberId) => Number(memberId) !== Number(currentUserId));
      if (counterpartId && await usersHaveBlockBetween(currentUserId, counterpartId)) {
        return sendApiError(res, 403, 'USER_BLOCKED', 'This direct conversation is blocked.');
      }
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
    const search = normalizeMessageMetadata(req.query.search, 120);
    const pinnedOnly = String(req.query.pinned || '') === 'true';
    const blockedUserIds = await getBlockedUserIds(currentUserId);
    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(pinnedOnly ? { pinnedAt: { not: null } } : {}),
        ...(search ? {
          OR: [
            { content: { contains: search } },
            { attachmentName: { contains: search } },
            { transcript: { contains: search } },
            { forwardedFromName: { contains: search } }
          ]
        } : {}),
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
        ...(beforeId ? { id: { lt: beforeId } } : {})
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
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

app.post('/api/channels', authMiddleware, adminMiddleware, async (req, res) => {
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
    const search = normalizeMessageMetadata(req.query.search, 120);
    const pinnedOnly = String(req.query.pinned || '') === 'true';
    const blockedUserIds = await getBlockedUserIds(req.user.userId);
    const messages = await prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(pinnedOnly ? { pinnedAt: { not: null } } : {}),
        ...(search ? {
          OR: [
            { content: { contains: search } },
            { attachmentName: { contains: search } },
            { transcript: { contains: search } },
            { forwardedFromName: { contains: search } }
          ]
        } : {}),
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
        ...(beforeId ? { id: { lt: beforeId } } : {})
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
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
    const attachmentType = normalizeAttachmentType(req.body.attachmentType);
    const attachmentName = req.body.attachmentName || null;
    const transcript = req.body.transcript;
    const forwardedFromName = req.body.forwardedFromName;
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
      transcript,
      forwardedFromName,
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
    const attachmentType = normalizeAttachmentType(req.body.attachmentType);
    const attachmentName = req.body.attachmentName || null;
    const transcript = req.body.transcript;
    const forwardedFromName = req.body.forwardedFromName;
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
      transcript,
      forwardedFromName,
      replyToId
    });

    if (!conversation || !message) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    io.to(`dm:${conversationId}`).emit('direct-message:new', {
      ...message,
      conversationId
    });
    emitSocialRefresh(getConversationMemberIds(conversation));

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
    await assertUserCanSend(req.user.userId);

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== req.user.userId || existing.deletedAt) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`channel:${message.channelId}`).emit('message:updated', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'MESSAGE_EDIT_FAILED', 'Failed to edit message');
  }
});

app.put('/api/messages/:messageId/pin', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    if (!messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.deletedAt) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    const message = await prisma.message.update({
      where: { id: messageId },
      data: existing.pinnedAt
        ? { pinnedAt: null, pinnedById: null }
        : { pinnedAt: new Date(), pinnedById: req.user.userId },
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });
    io.to(`channel:${message.channelId}`).emit('message:updated', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_PIN_FAILED', 'Failed to update pin');
  }
});

app.put('/api/messages/:messageId/reactions', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const emoji = normalizeMessageReaction(req.body.emoji);
    if (!messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    if (!emoji) {
      return sendApiError(res, 400, 'INVALID_REACTION', 'Unsupported message reaction');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, deletedAt: true }
    });
    if (!message || message.deletedAt) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const key = { messageId, userId: req.user.userId, emoji };
    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: key }
    });
    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.messageReaction.create({ data: key });
    }

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      orderBy: { id: 'asc' },
      select: { emoji: true, userId: true }
    });
    const payload = { messageId, channelId: message.channelId, reactions };
    io.to(`channel:${message.channelId}`).emit('message:reaction', payload);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_REACTION_FAILED', 'Failed to update reaction');
  }
});

app.delete('/api/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const messageId = Number(req.params.messageId);
    if (!messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }

    const [existing, canModerate] = await Promise.all([
      prisma.message.findUnique({ where: { id: messageId } }),
      userCanModerateMessages(req.user.userId)
    ]);
    if (!existing || existing.deletedAt || (existing.authorId !== req.user.userId && !canModerate)) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        transcript: null,
        forwardedFromName: null,
        pinnedAt: null,
        pinnedById: null,
        deletedAt: new Date()
      },
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
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
    await assertUserCanSend(req.user.userId);

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: { members: true }
    });
    const existing = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (
      !conversation ||
      !getConversationMemberIds(conversation).includes(req.user.userId) ||
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
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`dm:${conversationId}`).emit('direct-message:updated', { ...message, conversationId });
    emitSocialRefresh(getConversationMemberIds(conversation));
    return res.json({ ...message, conversationId });
  } catch (error) {
    console.error(error);
    return sendCaughtApiError(res, error, 'MESSAGE_EDIT_FAILED', 'Failed to edit direct message');
  }
});

app.put('/api/dms/:conversationId/messages/:messageId/pin', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);
    if (!conversationId || Number.isNaN(conversationId) || !messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    const [conversation, existing] = await Promise.all([
      prisma.directConversation.findUnique({
        where: { id: conversationId },
        include: { members: true }
      }),
      prisma.directMessage.findUnique({ where: { id: messageId } })
    ]);
    if (
      !conversation ||
      !getConversationMemberIds(conversation).includes(req.user.userId) ||
      !existing ||
      existing.conversationId !== conversationId ||
      existing.deletedAt
    ) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    const message = await prisma.directMessage.update({
      where: { id: messageId },
      data: existing.pinnedAt
        ? { pinnedAt: null, pinnedById: null }
        : { pinnedAt: new Date(), pinnedById: req.user.userId },
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });
    const payload = { ...message, conversationId };
    io.to(`dm:${conversationId}`).emit('direct-message:updated', payload);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_PIN_FAILED', 'Failed to update pin');
  }
});

app.put('/api/dms/:conversationId/messages/:messageId/reactions', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);
    const emoji = normalizeMessageReaction(req.body.emoji);
    if (!conversationId || Number.isNaN(conversationId) || !messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }
    if (!emoji) {
      return sendApiError(res, 400, 'INVALID_REACTION', 'Unsupported message reaction');
    }

    const [conversation, message] = await Promise.all([
      prisma.directConversation.findUnique({
        where: { id: conversationId },
        include: { members: true }
      }),
      prisma.directMessage.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, deletedAt: true }
      })
    ]);
    if (
      !conversation ||
      !getConversationMemberIds(conversation).includes(req.user.userId) ||
      !message ||
      message.conversationId !== conversationId ||
      message.deletedAt
    ) {
      return sendApiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const key = { directMessageId: messageId, userId: req.user.userId, emoji };
    const existing = await prisma.directMessageReaction.findUnique({
      where: { directMessageId_userId_emoji: key }
    });
    if (existing) {
      await prisma.directMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.directMessageReaction.create({ data: key });
    }

    const reactions = await prisma.directMessageReaction.findMany({
      where: { directMessageId: messageId },
      orderBy: { id: 'asc' },
      select: { emoji: true, userId: true }
    });
    const payload = { messageId, conversationId, reactions };
    io.to(`dm:${conversationId}`).emit('direct-message:reaction', payload);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_REACTION_FAILED', 'Failed to update reaction');
  }
});

app.delete('/api/dms/:conversationId/messages/:messageId', authMiddleware, messageRateLimit, async (req, res) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const messageId = Number(req.params.messageId);

    if (!conversationId || Number.isNaN(conversationId) || !messageId || Number.isNaN(messageId)) {
      return sendApiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id');
    }

    const [conversation, existing, canModerate] = await Promise.all([
      prisma.directConversation.findUnique({
        where: { id: conversationId },
        include: { members: true }
      }),
      prisma.directMessage.findUnique({ where: { id: messageId } }),
      userCanModerateMessages(req.user.userId)
    ]);
    const isMember = conversation ? getConversationMemberIds(conversation).includes(req.user.userId) : false;
    if (
      !conversation ||
      !existing ||
      existing.conversationId !== conversationId ||
      existing.deletedAt ||
      (!canModerate && (!isMember || existing.authorId !== req.user.userId))
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
        transcript: null,
        forwardedFromName: null,
        pinnedAt: null,
        pinnedById: null,
        deletedAt: new Date()
      },
      include: {
        author: { select: publicUserSelect },
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { include: { author: { select: publicUserSelect } } }
      }
    });

    io.to(`dm:${conversationId}`).emit('direct-message:updated', { ...message, conversationId });
    emitSocialRefresh(getConversationMemberIds(conversation));
    return res.json({ ...message, conversationId });
  } catch (error) {
    console.error(error);
    return sendApiError(res, 500, 'MESSAGE_DELETE_FAILED', 'Failed to delete direct message');
  }
});

app.post('/api/upload', authMiddleware, uploadRateLimit, async (req, res, next) => {
  try {
    await assertUserCanSend(req.user.userId);
    return next();
  } catch (error) {
    return sendCaughtApiError(res, error, 'UPLOAD_FORBIDDEN', 'Upload is not allowed.');
  }
}, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  return res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    type: getAttachmentType(req.file.mimetype, req.file.originalname || req.file.filename),
    name: req.file.originalname
  });
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large for this endpoint.' });
  }

  if (error?.code === 'UNSUPPORTED_UPLOAD_TYPE') {
    return sendApiError(res, error.status || 415, error.code, error.message || 'This file type is not allowed.');
  }

  if (error?.code === 'UNSUPPORTED_CLIENT_DOWNLOAD') {
    return sendApiError(res, error.status || 415, error.code, error.message || 'Unsupported client download file.');
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

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized'));
    }

    socket.user = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: socket.user.userId },
      select: { id: true, bannedUntil: true }
    });
    if (!user || isFutureDate(user.bannedUntil)) {
      return next(new Error('Unauthorized'));
    }
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
  return Array.from(participants.entries()).map(([socketId, participant]) => serializeVoiceParticipant(socketId, participant));
}

function serializeVoiceParticipant(socketId, participant = {}) {
  return {
    socketId,
    userId: participant.userId,
    username: participant.username,
    user: serializePublicUser(participant.user),
    muted: Boolean(participant.muted),
    camera: Boolean(participant.camera),
    screen: Boolean(participant.screen),
    speaking: Boolean(participant.speaking),
    audioProfile: normalizeVoiceAudioProfile(participant.audioProfile),
    audioBitrate: normalizeVoiceAudioBitrate(participant.audioBitrate)
  };
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
  if (!checkSocketRateLimit(socket, voiceSignalRateLimitConfig)) return;
  const roomKey = getVoiceRoomKey(channelId);
  if (!roomKey || socket.data.voiceRoomKey !== roomKey) return;
  const sanitizedPayload = sanitizeSignalPayload(eventName, payload);
  if (!sanitizedPayload) {
    socket.emit('socket-error', { code: 'INVALID_VOICE_SIGNAL', error: 'Invalid voice signal' });
    return;
  }
  const safeTargetSocketId = normalizeTargetSocketId(targetSocketId);

  const signalPayload = {
    ...sanitizedPayload,
    fromSocketId: socket.id,
    targetSocketId: safeTargetSocketId || undefined
  };

  if (safeTargetSocketId) {
    const targetSocket = io.sockets.sockets.get(safeTargetSocketId);
    if (!targetSocket || targetSocket.data.voiceRoomKey !== roomKey) return;
    io.to(safeTargetSocketId).emit(eventName, signalPayload);
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
        where: { id: parsedConversationId },
        include: { members: true }
      });

      if (!conversation || !getConversationMemberIds(conversation).includes(socket.user.userId)) {
        return;
      }

      if (conversation.type === 'DIRECT') {
        const counterpartId = getConversationMemberIds(conversation).find((memberId) => Number(memberId) !== Number(socket.user.userId));
        if (counterpartId && await usersHaveBlockBetween(socket.user.userId, counterpartId)) return;
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
      const attachmentType = normalizeAttachmentType(payload.attachmentType);
      const attachmentName = payload.attachmentName || null;
      const transcript = payload.transcript;
      const forwardedFromName = payload.forwardedFromName;
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
        transcript,
        forwardedFromName,
        replyToId
      });

      if (!message) {
        socket.emit('socket-error', { error: 'Text channel not found' });
        return;
      }

      io.to(`channel:${channelId}`).emit('new-message', message);
      if (message.guildId) io.to(`guild:${message.guildId}`).emit('guild-message:new', message);
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
      const attachmentType = normalizeAttachmentType(payload.attachmentType);
      const attachmentName = payload.attachmentName || null;
      const transcript = payload.transcript;
      const forwardedFromName = payload.forwardedFromName;
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
        transcript,
        forwardedFromName,
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
      getConversationMemberIds(conversation).forEach((userId) => {
        io.to(`user:${userId}`).emit('direct-message:notify', {
          ...message,
          conversationId
        });
      });
      emitSocialRefresh(getConversationMemberIds(conversation));
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { code: error?.code, error: error?.message || 'Failed to send direct message' });
    }
  });

  socket.on('join-call', async ({ callId }) => {
    try {
      const parsedCallId = String(callId || '').trim();
      const call = callSessions.get(parsedCallId);
      if (!call || !call.memberIds.includes(socket.user.userId)) {
        socket.emit('socket-error', { error: 'Call not found' });
        return;
      }

      const participantUser = await prisma.user.findUnique({
        where: { id: socket.user.userId },
        select: publicUserSelect
      });

      leaveCallRoom(socket);

      const roomKey = getCallRoomKey(parsedCallId);
      socket.join(roomKey);
      socket.emit('call-participants', {
        callId: parsedCallId,
        participants: getCallParticipantList(roomKey)
      });

      const participants = callParticipants.get(roomKey) || new Map();
      participants.set(socket.id, {
        userId: socket.user.userId,
        username: socket.user.username,
        user: participantUser,
        muted: false,
        camera: false,
        screen: false,
        speaking: false,
        audioProfile: 'voiceFocus',
        audioBitrate: 64000
      });
      callParticipants.set(roomKey, participants);
      socket.data.callRoomKey = roomKey;
      socket.data.callId = parsedCallId;
      call.status = 'ACTIVE';
      callSessions.set(call.id, call);

      socket.to(roomKey).emit('call-user-joined', {
        callId: parsedCallId,
        participant: serializeVoiceParticipant(socket.id, participants.get(socket.id))
      });
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { error: 'Failed to join call' });
    }
  });

  socket.on('leave-call', () => leaveCallRoom(socket));

  socket.on('call-state', (payload = {}) => {
    if (!checkSocketRateLimit(socket, voiceStateRateLimitConfig)) return;
    const roomKey = socket.data.callRoomKey;
    const callId = socket.data.callId;
    if (!roomKey || !callId) return;

    const participants = callParticipants.get(roomKey);
    const participant = participants?.get(socket.id);
    if (!participants || !participant) return;

    participant.muted = booleanFromPayload(payload.muted);
    participant.camera = booleanFromPayload(payload.camera);
    participant.screen = booleanFromPayload(payload.screen);
    participant.speaking = booleanFromPayload(payload.speaking);
    participant.audioProfile = normalizeVoiceAudioProfile(payload.audioProfile);
    participant.audioBitrate = normalizeVoiceAudioBitrate(payload.audioBitrate);
    participants.set(socket.id, participant);

    io.to(roomKey).emit('call-state', {
      callId,
      participant: serializeVoiceParticipant(socket.id, participant)
    });
  });

  socket.on('call-offer', ({ callId, offer, targetSocketId }) => {
    emitCallSignal(socket, 'call-offer', { callId, offer, targetSocketId });
  });

  socket.on('call-answer', ({ callId, answer, targetSocketId }) => {
    emitCallSignal(socket, 'call-answer', { callId, answer, targetSocketId });
  });

  socket.on('call-ice-candidate', ({ callId, candidate, targetSocketId }) => {
    emitCallSignal(socket, 'call-ice-candidate', { callId, candidate, targetSocketId });
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

      const participantUser = await prisma.user.findUnique({
        where: { id: socket.user.userId },
        select: publicUserSelect
      });

      leaveVoiceRoom(socket);

      const roomKey = getVoiceRoomKey(parsedChannelId);
      socket.join(roomKey);
      socket.emit('voice-participants', getVoiceParticipantList(roomKey));

      const participants = voiceParticipants.get(roomKey) || new Map();
      participants.set(socket.id, {
        userId: socket.user.userId,
        username: socket.user.username,
        user: participantUser,
        muted: false,
        camera: false,
        screen: false,
        speaking: false,
        audioProfile: 'voiceFocus',
        audioBitrate: 64000
      });
      voiceParticipants.set(roomKey, participants);

      socket.to(roomKey).emit('voice-user-joined', serializeVoiceParticipant(socket.id, participants.get(socket.id)));
      socket.data.voiceRoomKey = roomKey;
    } catch (error) {
      console.error(error);
      socket.emit('socket-error', { error: 'Failed to join voice' });
    }
  });

  socket.on('leave-voice', () => leaveVoiceRoom(socket));

  socket.on('voice-state', (payload = {}) => {
    if (!checkSocketRateLimit(socket, voiceStateRateLimitConfig)) return;
    const roomKey = socket.data.voiceRoomKey;
    if (!roomKey) return;

    const participants = voiceParticipants.get(roomKey);
    const participant = participants?.get(socket.id);
    if (!participants || !participant) return;

    participant.muted = booleanFromPayload(payload.muted);
    participant.camera = booleanFromPayload(payload.camera);
    participant.screen = booleanFromPayload(payload.screen);
    participant.speaking = booleanFromPayload(payload.speaking);
    participant.audioProfile = normalizeVoiceAudioProfile(payload.audioProfile);
    participant.audioBitrate = normalizeVoiceAudioBitrate(payload.audioBitrate);
    participants.set(socket.id, participant);

    io.to(roomKey).emit('voice-state', serializeVoiceParticipant(socket.id, participant));
  });

  socket.on('voice-offer', ({ channelId, offer, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-offer', { channelId, offer, targetSocketId });
  });

  socket.on('voice-answer', ({ channelId, answer, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-answer', { channelId, answer, targetSocketId });
  });

  socket.on('voice-ice-candidate', ({ channelId, candidate, targetSocketId }) => {
    emitVoiceSignal(socket, 'voice-ice-candidate', { channelId, candidate, targetSocketId });
  });

  socket.on('disconnect', () => {
    leaveCallRoom(socket);
    leaveVoiceRoom(socket);
  });
});

await prisma.$connect();
await ensureBootstrapData();

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
