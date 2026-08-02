import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { describeDevice, hashSessionSecret } from './reliability.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_now';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === 'change_me_now')) {
  throw new Error('JWT_SECRET must be set to a strong secret in production.');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user, session = null, sessionSecret = '') {
  return jwt.sign({
    userId: user.id,
    username: user.username,
    ...(session ? { sessionId: session.id, sessionSecret } : {})
  }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function createTrackedSession(user, req, overrides = {}) {
  const sessionSecret = crypto.randomBytes(32).toString('base64url');
  const device = describeDevice(
    req?.headers?.['user-agent'],
    overrides.deviceName ?? req?.body?.deviceName,
    overrides.platform ?? req?.body?.platform
  );
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = String(forwardedFor || req?.ip || req?.socket?.remoteAddress || '').slice(0, 80) || null;
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      secretHash: hashSessionSecret(sessionSecret),
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
    }
  });
  return { session, token: signToken(user, session, sessionSecret) };
}

export async function verifyActiveToken(token) {
  const decoded = verifyToken(token);
  if (!decoded.sessionId) return decoded;
  const session = await prisma.userSession.findUnique({ where: { id: String(decoded.sessionId) } });
  if (!session
    || session.userId !== Number(decoded.userId)
    || session.revokedAt
    || session.expiresAt.getTime() <= Date.now()
    || session.secretHash !== hashSessionSecret(decoded.sessionSecret)) {
    throw new Error('Session revoked');
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1_000) {
    prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { ...decoded, sessionId: session.id };
}

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = await verifyActiveToken(token);
    req.authToken = token;
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
