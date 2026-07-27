import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMentionUsernames,
  isPushQuietHours,
  normalizeClockValue,
  normalizePushPreferences
} from '../src/push-utils.js';

test('normalizes notification preferences and clamps timezone offsets', () => {
  assert.deepEqual(normalizePushPreferences({
    notificationMode: 'MENTIONS',
    quietHoursEnabled: true,
    quietHoursStart: '23:15',
    quietHoursEnd: 'not-a-time',
    timezoneOffset: 2000
  }), {
    notificationMode: 'mentions',
    quietHoursEnabled: true,
    quietHoursStart: '23:15',
    quietHoursEnd: '08:00',
    timezoneOffset: 840
  });
  assert.equal(normalizeClockValue('09:05', '00:00'), '09:05');
  assert.equal(normalizeClockValue('24:00', '00:00'), '00:00');
});

test('detects quiet hours that cross midnight in the subscriber timezone', () => {
  const subscription = {
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    timezoneOffset: -180
  };
  assert.equal(isPushQuietHours(subscription, new Date('2026-07-28T01:00:00.000Z')), true);
  assert.equal(isPushQuietHours(subscription, new Date('2026-07-28T10:00:00.000Z')), false);
});

test('extracts unique normalized mentions without email fragments', () => {
  assert.deepEqual(
    extractMentionUsernames('Hi @Alice, @alice and @bob_dev. mail a@b.co'),
    ['alice', 'bob_dev']
  );
});
