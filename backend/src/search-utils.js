const SEARCH_SCOPES = new Set(['all', 'people', 'channels', 'dm', 'files']);

export function normalizeSearchScope(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return SEARCH_SCOPES.has(normalized) ? normalized : 'all';
}

export function parseSearchDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildMessageSearchWhere({
  query,
  authorId = null,
  before = null,
  after = null,
  blockedUserIds = [],
  filesOnly = false
}) {
  const createdAt = {
    ...(before ? { lte: before } : {}),
    ...(after ? { gte: after } : {})
  };
  const authorFilter = authorId
    ? (blockedUserIds.length ? { equals: authorId, notIn: blockedUserIds } : authorId)
    : (blockedUserIds.length ? { notIn: blockedUserIds } : undefined);
  return {
    deletedAt: null,
    ...(authorFilter !== undefined ? { authorId: authorFilter } : {}),
    ...(before || after ? { createdAt } : {}),
    ...(filesOnly ? { attachmentUrl: { not: null } } : {}),
    OR: [
      { content: { contains: query, mode: 'insensitive' } },
      { attachmentName: { contains: query, mode: 'insensitive' } },
      { transcript: { contains: query, mode: 'insensitive' } }
    ]
  };
}

export function conversationMatchesQuery(conversation, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return false;
  return [
    conversation?.title,
    conversation?.user?.displayName,
    conversation?.user?.username,
    ...(conversation?.members || []).flatMap((member) => [member?.displayName, member?.username])
  ].some((value) => String(value || '').toLocaleLowerCase().includes(needle));
}
