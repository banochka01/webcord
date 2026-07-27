export function normalizeClockValue(value, fallback) {
  const normalized = String(value || '').trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : fallback;
}

export function normalizePushPreferences(value = {}) {
  const notificationMode = String(value.notificationMode || 'all').toLowerCase() === 'mentions'
    ? 'mentions'
    : 'all';
  return {
    notificationMode,
    quietHoursEnabled: Boolean(value.quietHoursEnabled),
    quietHoursStart: normalizeClockValue(value.quietHoursStart, '22:00'),
    quietHoursEnd: normalizeClockValue(value.quietHoursEnd, '08:00'),
    timezoneOffset: Math.max(-840, Math.min(840, Number(value.timezoneOffset) || 0))
  };
}

export function isPushQuietHours(subscription, now = new Date()) {
  if (!subscription.quietHoursEnabled) return false;
  const toMinutes = (value) => {
    const [hours, minutes] = normalizeClockValue(value, '00:00').split(':').map(Number);
    return hours * 60 + minutes;
  };
  const local = new Date(now.getTime() - Number(subscription.timezoneOffset || 0) * 60_000);
  const current = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = toMinutes(subscription.quietHoursStart);
  const end = toMinutes(subscription.quietHoursEnd);
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
}

export function extractMentionUsernames(content, normalize = (value) => String(value || '').trim().toLowerCase()) {
  return [...new Set(
    Array.from(
      String(content || '').matchAll(/(?<![\w.])@([a-zA-Z0-9_.-]{2,32})/g),
      (match) => normalize(match[1].replace(/[.-]+$/, ''))
    ).filter(Boolean)
  )];
}
