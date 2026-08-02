import crypto from 'node:crypto';
import fs from 'node:fs';

let cachedCredentials;
let cachedAccessToken;

function parseServiceAccount(environment = process.env) {
  const encoded = String(environment.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
  const inline = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : String(environment.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const credentialsPath = String(environment.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const raw = inline || (credentialsPath && fs.existsSync(credentialsPath)
    ? fs.readFileSync(credentialsPath, 'utf8')
    : '');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const projectId = String(environment.FIREBASE_PROJECT_ID || parsed.project_id || '').trim();
  if (!projectId || !parsed.client_email || !parsed.private_key) {
    throw new Error('Firebase service account is incomplete.');
  }
  return { projectId, clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

export function firebasePushConfigured(environment = process.env) {
  return Boolean(
    String(environment.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim()
    || String(environment.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
    || (String(environment.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
      && String(environment.FIREBASE_PROJECT_ID || '').trim())
  );
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  cachedCredentials ||= parseServiceAccount();
  if (!cachedCredentials) return null;
  const now = Math.floor(Date.now() / 1_000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: cachedCredentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3_600
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), cachedCredentials.privateKey).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`Firebase OAuth failed (${response.status}).`);
  cachedAccessToken = { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3_600) * 1_000 };
  return cachedAccessToken.value;
}

function stringData(payload = {}) {
  return Object.fromEntries(Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

function invalidTokenResponse(status, payload) {
  const statusText = String(payload?.error?.status || '').toUpperCase();
  const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
  const fcmCode = details.find((item) => item?.errorCode)?.errorCode;
  return status === 404 || statusText === 'NOT_FOUND' || ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(fcmCode);
}

async function sendOne(credentials, accessToken, record, payload) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: record.token,
        notification: { title: String(payload.title || 'WebCord').slice(0, 120), body: String(payload.body || '').slice(0, 300) },
        data: stringData(payload.data || {}),
        android: { priority: payload.urgent ? 'HIGH' : 'NORMAL', notification: { channel_id: 'webcord_messages', sound: 'default' } }
      }
    })
  });
  const responsePayload = await response.json().catch(() => ({}));
  return { ok: response.ok, invalid: !response.ok && invalidTokenResponse(response.status, responsePayload), token: record.token };
}

export async function sendFirebasePushToUsers(prisma, userIds, payload = {}) {
  if (!firebasePushConfigured()) return { enabled: false, sent: 0, failed: 0 };
  const uniqueIds = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!uniqueIds.length) return { enabled: true, sent: 0, failed: 0 };
  try {
    cachedCredentials ||= parseServiceAccount();
    const accessToken = await getAccessToken();
    if (!cachedCredentials || !accessToken) return { enabled: false, sent: 0, failed: 0 };
    const records = await prisma.devicePushToken.findMany({ where: { userId: { in: uniqueIds } }, orderBy: { updatedAt: 'desc' } });
    const results = [];
    for (let offset = 0; offset < records.length; offset += 20) {
      const settled = await Promise.allSettled(records.slice(offset, offset + 20).map((record) => sendOne(cachedCredentials, accessToken, record, payload)));
      results.push(...settled.map((item) => item.status === 'fulfilled' ? item.value : ({ ok: false, invalid: false, token: null })));
    }
    const invalidTokens = results.filter((item) => item.invalid && item.token).map((item) => item.token);
    if (invalidTokens.length) await prisma.devicePushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    return { enabled: true, sent: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length };
  } catch (error) {
    console.error('Firebase push failed:', error?.message || error);
    return { enabled: true, sent: 0, failed: 1 };
  }
}
