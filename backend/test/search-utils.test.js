import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessageSearchWhere,
  conversationMatchesQuery,
  normalizeSearchScope,
  parseSearchDate
} from '../src/search-utils.js';

test('normalizes search scopes and rejects unknown values', () => {
  assert.equal(normalizeSearchScope('FILES'), 'files');
  assert.equal(normalizeSearchScope('unknown'), 'all');
  assert.equal(normalizeSearchScope(), 'all');
});

test('builds case-insensitive message filters without losing author safety', () => {
  const after = new Date('2026-01-01T00:00:00.000Z');
  const where = buildMessageSearchWhere({
    query: 'report.pdf',
    authorId: 7,
    after,
    blockedUserIds: [12, 19],
    filesOnly: true
  });
  assert.deepEqual(where.authorId, { equals: 7, notIn: [12, 19] });
  assert.deepEqual(where.createdAt, { gte: after });
  assert.deepEqual(where.attachmentUrl, { not: null });
  assert.equal(where.OR[1].attachmentName.mode, 'insensitive');
});

test('matches direct conversations by title and member identity', () => {
  const conversation = {
    title: 'Design room',
    user: { username: 'maria', displayName: 'Maria S.' },
    members: [{ username: 'alex', displayName: 'Alexander' }]
  };
  assert.equal(conversationMatchesQuery(conversation, 'design'), true);
  assert.equal(conversationMatchesQuery(conversation, 'ALEX'), true);
  assert.equal(conversationMatchesQuery(conversation, 'missing'), false);
});

test('parses valid dates and ignores malformed values', () => {
  assert.equal(parseSearchDate('2026-08-02T12:00:00Z')?.toISOString(), '2026-08-02T12:00:00.000Z');
  assert.equal(parseSearchDate('not-a-date'), null);
});
