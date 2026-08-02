import crypto from 'node:crypto';

const VERSION_PARTS = 3;
const MAX_ERROR_MESSAGE = 2_000;
const MAX_ERROR_STACK = 12_000;
const MAX_ERROR_CONTEXT = 12_000;

export function hashSessionSecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return Array.from({ length: VERSION_PARTS }, (_, index) => Number(match[index + 1] || 0));
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < VERSION_PARTS; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function clampText(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

export function sanitizeErrorReport(payload = {}) {
  const message = clampText(payload.message, MAX_ERROR_MESSAGE);
  if (!message) return null;
  const stack = clampText(payload.stack, MAX_ERROR_STACK) || null;
  const platform = clampText(payload.platform, 40).toUpperCase() || 'UNKNOWN';
  const appVersion = clampText(payload.appVersion, 40) || 'unknown';
  let context = null;
  if (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)) {
    try {
      const serialized = JSON.stringify(payload.context);
      if (Buffer.byteLength(serialized, 'utf8') <= MAX_ERROR_CONTEXT) context = payload.context;
    } catch {
      context = null;
    }
  }
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${platform}\n${message}\n${String(stack || '').split('\n').slice(0, 3).join('\n')}`)
    .digest('hex');
  return { message, stack, platform, appVersion, context, fingerprint };
}

export function describeDevice(userAgent = '', requestedName = '', requestedPlatform = '') {
  const agent = String(userAgent || '');
  const platform = clampText(requestedPlatform, 32).toUpperCase()
    || (/android/i.test(agent) ? 'ANDROID' : /windows/i.test(agent) ? 'WINDOWS' : 'WEB');
  const fallback = platform === 'ANDROID' ? 'WebCord for Android' : platform === 'WINDOWS' ? 'WebCord for Windows' : 'WebCord Web';
  return {
    platform,
    deviceName: clampText(requestedName, 80) || fallback,
    userAgent: clampText(agent, 500) || null
  };
}

export function roleAtLeast(actual, minimum) {
  const rank = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 };
  return (rank[String(actual || 'MEMBER')] ?? -1) >= (rank[String(minimum || 'MEMBER')] ?? 0);
}
