import crypto from 'node:crypto';

const ACTIVITY_KINDS = new Set([
  'MENTION',
  'REPLY',
  'REACTION',
  'DIRECT_MESSAGE',
  'FRIEND_REQUEST',
  'CALL',
  'EVENT',
  'SYSTEM'
]);
const RSVP_STATUSES = new Set(['GOING', 'INTERESTED', 'NOT_GOING']);
const SPACE_ROLE_RANK = Object.freeze({ MEMBER: 0, MODERATOR: 1, ADMIN: 2, OWNER: 3 });
const SPACE_ROLES = new Set(Object.keys(SPACE_ROLE_RANK));

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function apiError(res, status, code, message) {
  return res.status(status).json({ error: message, code });
}

const pollInclude = {
  createdBy: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      accentColor: true
    }
  },
  options: {
    orderBy: { position: 'asc' },
    include: {
      votes: { select: { userId: true } }
    }
  }
};

function serializePoll(poll, currentUserId) {
  if (!poll) return null;
  const totalVoters = new Set(
    poll.options.flatMap((option) => option.votes.map((vote) => vote.userId))
  ).size;
  return {
    id: poll.id,
    question: poll.question,
    allowsMultiple: poll.allowsMultiple,
    anonymous: poll.anonymous,
    closesAt: poll.closesAt,
    closed: Boolean(poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now()),
    createdAt: poll.createdAt,
    createdBy: poll.createdBy,
    totalVoters,
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position,
      voteCount: option.votes.length,
      selected: option.votes.some((vote) => vote.userId === currentUserId),
      voters: poll.anonymous ? [] : option.votes.map((vote) => vote.userId)
    }))
  };
}

function serializeEvent(event, currentUserId) {
  const rsvps = event.rsvps || [];
  const counts = { GOING: 0, INTERESTED: 0, NOT_GOING: 0 };
  for (const rsvp of rsvps) {
    if (counts[rsvp.status] !== undefined) counts[rsvp.status] += 1;
  }
  return {
    id: event.id,
    guildId: event.guildId,
    title: event.title,
    description: event.description,
    location: event.location,
    coverUrl: event.coverUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    createdAt: event.createdAt,
    creator: event.creator,
    rsvp: rsvps.find((item) => item.userId === currentUserId)?.status || null,
    rsvpCounts: counts
  };
}

export async function recordActivity(prisma, {
  userId,
  actorId = null,
  kind,
  title,
  body = '',
  channelId = null,
  conversationId = null,
  messageId = null,
  directMessageId = null,
  metadata = null
}) {
  if (!userId || Number(userId) === Number(actorId)) return null;
  const normalizedKind = ACTIVITY_KINDS.has(kind) ? kind : 'SYSTEM';
  return prisma.activityEvent.create({
    data: {
      userId: Number(userId),
      actorId: actorId ? Number(actorId) : null,
      kind: normalizedKind,
      title: cleanText(title, 120),
      body: cleanText(body, 320),
      channelId: positiveInt(channelId),
      conversationId: positiveInt(conversationId),
      messageId: positiveInt(messageId),
      directMessageId: positiveInt(directMessageId),
      metadata
    }
  });
}

export function installSpacesRoutes({
  app,
  prisma,
  io,
  authMiddleware,
  messageRateLimit,
  adminMiddleware,
  publicUserSelect,
  createChannelMessage,
  createDirectConversationMessage,
  getConversationMemberIds
}) {
  function spaceAccessError(minimumRole = 'MEMBER') {
    const error = new Error(minimumRole === 'MEMBER'
      ? 'You do not have access to this community.'
      : 'Your community role does not allow this action.');
    error.status = 403;
    error.code = 'SPACE_ACCESS_DENIED';
    return error;
  }

  async function membershipFor(guildId, userId) {
    if (!guildId || !userId) return null;
    return prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: Number(guildId), userId: Number(userId) } },
      include: { user: { select: publicUserSelect } }
    });
  }

  async function requireSpaceRole(guildId, userId, minimumRole = 'MEMBER') {
    const membership = await membershipFor(guildId, userId);
    if (!membership || SPACE_ROLE_RANK[membership.role] < SPACE_ROLE_RANK[minimumRole]) {
      throw spaceAccessError(minimumRole);
    }
    return membership;
  }

  async function guildIdForChannel(channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: Number(channelId) },
      select: { guildId: true }
    });
    return channel?.guildId || null;
  }

  async function requireChannelAccess(channelId, userId, action = 'view') {
    const channel = await prisma.channel.findUnique({
      where: { id: Number(channelId) },
      include: { permissions: { where: { userId: Number(userId) } } }
    });
    if (!channel) {
      const error = new Error('Channel not found.');
      error.status = 404;
      error.code = 'CHANNEL_NOT_FOUND';
      throw error;
    }
    const membership = await requireSpaceRole(channel.guildId, userId);
    const permission = channel.permissions[0] || null;
    const privileged = SPACE_ROLE_RANK[membership.role] >= SPACE_ROLE_RANK.MODERATOR;
    if (!privileged && (SPACE_ROLE_RANK[membership.role] < SPACE_ROLE_RANK[channel.minimumRole]
      || (channel.isPrivate && !permission?.canView)
      || (action === 'post' && permission && !permission.canPost))) {
      throw spaceAccessError(channel.minimumRole);
    }
    return { channel, membership, permission };
  }

  async function recordSpaceAudit({ guildId, actorId = null, targetUserId = null, action, metadata = null }) {
    return prisma.guildAuditLog.create({
      data: { guildId, actorId, targetUserId, action, metadata }
    });
  }

  const messageInclude = {
    author: { select: publicUserSelect },
    reactions: { select: { emoji: true, userId: true } },
    replyTo: { include: { author: { select: publicUserSelect } } },
    poll: { include: pollInclude },
    _count: { select: { replies: { where: { deletedAt: null } } } }
  };

  const directMessageInclude = {
    author: { select: publicUserSelect },
    reactions: { select: { emoji: true, userId: true } },
    replyTo: { include: { author: { select: publicUserSelect } } },
    poll: { include: pollInclude },
    _count: { select: { replies: { where: { deletedAt: null } } } }
  };

  function decorateMessage(message, currentUserId) {
    if (!message) return null;
    return {
      ...message,
      threadReplyCount: message._count?.replies || 0,
      poll: serializePoll(message.poll, currentUserId),
      _count: undefined
    };
  }

  async function conversationForMember(conversationId, userId) {
    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: { members: true }
    });
    return conversation && getConversationMemberIds(conversation).includes(userId)
      ? conversation
      : null;
  }

  app.get('/api/activity', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(100, positiveInt(req.query.limit) || 50);
      const kind = cleanText(req.query.kind, 40).toUpperCase();
      const where = {
        userId: req.user.userId,
        ...(ACTIVITY_KINDS.has(kind) ? { kind } : {})
      };
      const [items, unreadCount] = await Promise.all([
        prisma.activityEvent.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: publicUserSelect } }
        }),
        prisma.activityEvent.count({
          where: { userId: req.user.userId, readAt: null }
        })
      ]);
      return res.json({
        unreadCount,
        activities: items.map((item) => ({
          ...item,
          actor: item.actor || null,
          unread: !item.readAt
        }))
      });
    } catch (error) {
      console.error('Activity fetch failed:', error);
      return apiError(res, 500, 'ACTIVITY_FETCH_FAILED', 'Failed to load activity.');
    }
  });

  app.post('/api/activity/read', authMiddleware, async (req, res) => {
    try {
      const ids = Array.isArray(req.body.ids)
        ? req.body.ids.map(positiveInt).filter(Boolean).slice(0, 200)
        : [];
      await prisma.activityEvent.updateMany({
        where: {
          userId: req.user.userId,
          readAt: null,
          ...(ids.length ? { id: { in: ids } } : {})
        },
        data: { readAt: new Date() }
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Activity read failed:', error);
      return apiError(res, 500, 'ACTIVITY_READ_FAILED', 'Failed to update activity.');
    }
  });

  app.get('/api/threads/channel/:messageId', authMiddleware, async (req, res) => {
    try {
      const messageId = positiveInt(req.params.messageId);
      if (!messageId) return apiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid message id.');
      const root = await prisma.message.findFirst({
        where: { id: messageId, deletedAt: null },
        include: messageInclude
      });
      if (!root) return apiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
      await requireChannelAccess(root.channelId, req.user.userId);
      const replies = await prisma.message.findMany({
        where: { replyToId: messageId, channelId: root.channelId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: messageInclude
      });
      return res.json({
        scope: 'channel',
        root: decorateMessage(root, req.user.userId),
        replies: replies.map((item) => decorateMessage(item, req.user.userId))
      });
    } catch (error) {
      console.error('Thread fetch failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'THREAD_FETCH_FAILED', error?.message || 'Failed to load thread.');
    }
  });

  app.get('/api/threads/dm/:conversationId/:messageId', authMiddleware, async (req, res) => {
    try {
      const conversationId = positiveInt(req.params.conversationId);
      const messageId = positiveInt(req.params.messageId);
      if (!conversationId || !messageId) {
        return apiError(res, 400, 'INVALID_MESSAGE_ID', 'Invalid conversation or message id.');
      }
      const conversation = await conversationForMember(conversationId, req.user.userId);
      if (!conversation) return apiError(res, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      const root = await prisma.directMessage.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        include: directMessageInclude
      });
      if (!root) return apiError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
      const replies = await prisma.directMessage.findMany({
        where: { replyToId: messageId, conversationId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: directMessageInclude
      });
      return res.json({
        scope: 'dm',
        root: decorateMessage(root, req.user.userId),
        replies: replies.map((item) => decorateMessage(item, req.user.userId))
      });
    } catch (error) {
      console.error('Direct thread fetch failed:', error);
      return apiError(res, 500, 'THREAD_FETCH_FAILED', 'Failed to load thread.');
    }
  });

  app.post('/api/polls', authMiddleware, messageRateLimit, async (req, res) => {
    try {
      const question = cleanText(req.body.question, 240);
      const options = Array.isArray(req.body.options)
        ? req.body.options.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 10)
        : [];
      const channelId = positiveInt(req.body.channelId);
      const conversationId = positiveInt(req.body.conversationId);
      const closesAt = parseDate(req.body.closesAt);
      if (!question || options.length < 2) {
        return apiError(res, 400, 'INVALID_POLL', 'A poll needs a question and at least two options.');
      }
      if (Boolean(channelId) === Boolean(conversationId)) {
        return apiError(res, 400, 'INVALID_POLL_SCOPE', 'Choose one poll destination.');
      }

      let message;
      let conversation = null;
      if (channelId) {
        message = await createChannelMessage({
          channelId,
          userId: req.user.userId,
          content: question,
          attachmentUrl: null,
          attachmentType: null,
          attachmentName: null,
          transcript: null,
          forwardedFromName: null,
          replyToId: null,
          silent: Boolean(req.body.silent)
        });
      } else {
        const result = await createDirectConversationMessage({
          conversationId,
          userId: req.user.userId,
          content: question,
          attachmentUrl: null,
          attachmentType: null,
          attachmentName: null,
          transcript: null,
          forwardedFromName: null,
          replyToId: null,
          silent: Boolean(req.body.silent)
        });
        message = result.message;
        conversation = result.conversation;
      }
      if (!message) return apiError(res, 404, 'POLL_DESTINATION_NOT_FOUND', 'Poll destination not found.');

      const poll = await prisma.poll.create({
        data: {
          question,
          allowsMultiple: Boolean(req.body.allowsMultiple),
          anonymous: Boolean(req.body.anonymous),
          closesAt,
          createdById: req.user.userId,
          channelId,
          conversationId,
          messageId: channelId ? message.id : null,
          directMessageId: conversationId ? message.id : null,
          options: {
            create: options.map((label, position) => ({ label, position }))
          }
        },
        include: pollInclude
      });
      const payload = {
        ...message,
        poll: serializePoll(poll, req.user.userId),
        threadReplyCount: 0,
        ...(conversationId ? { conversationId } : {})
      };
      if (channelId) io.to(`channel:${channelId}`).emit('new-message', payload);
      if (conversationId) {
        io.to(`dm:${conversationId}`).emit('direct-message:new', payload);
        const recipients = getConversationMemberIds(conversation)
          .filter((userId) => userId !== req.user.userId);
        await Promise.all(recipients.map((userId) => recordActivity(prisma, {
          userId,
          actorId: req.user.userId,
          kind: 'DIRECT_MESSAGE',
          title: 'New poll',
          body: question,
          conversationId,
          directMessageId: message.id
        })));
      }
      return res.status(201).json(payload);
    } catch (error) {
      console.error('Poll create failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'POLL_CREATE_FAILED', error?.message || 'Failed to create poll.');
    }
  });

  app.post('/api/polls/:pollId/votes', authMiddleware, messageRateLimit, async (req, res) => {
    try {
      const pollId = positiveInt(req.params.pollId);
      const optionIds = Array.isArray(req.body.optionIds)
        ? [...new Set(req.body.optionIds.map(positiveInt).filter(Boolean))].slice(0, 10)
        : [];
      const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: pollInclude
      });
      if (!poll) return apiError(res, 404, 'POLL_NOT_FOUND', 'Poll not found.');
      if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
        return apiError(res, 409, 'POLL_CLOSED', 'This poll is closed.');
      }
      if (poll.conversationId && !await conversationForMember(poll.conversationId, req.user.userId)) {
        return apiError(res, 404, 'POLL_NOT_FOUND', 'Poll not found.');
      }
      if (poll.channelId) {
        await requireChannelAccess(poll.channelId, req.user.userId, 'post');
      }
      const validIds = new Set(poll.options.map((option) => option.id));
      const selected = optionIds.filter((id) => validIds.has(id));
      if (!poll.allowsMultiple && selected.length > 1) {
        return apiError(res, 400, 'POLL_SINGLE_CHOICE', 'Choose one option.');
      }
      await prisma.$transaction(async (tx) => {
        await tx.pollVote.deleteMany({
          where: {
            userId: req.user.userId,
            option: { pollId }
          }
        });
        if (selected.length) {
          await tx.pollVote.createMany({
            data: selected.map((optionId) => ({ optionId, userId: req.user.userId })),
            skipDuplicates: true
          });
        }
      });
      const updated = await prisma.poll.findUnique({ where: { id: pollId }, include: pollInclude });
      const serialized = serializePoll(updated, req.user.userId);
      const room = poll.channelId ? `channel:${poll.channelId}` : `dm:${poll.conversationId}`;
      io.to(room).emit('poll:updated', {
        pollId,
        messageId: poll.messageId || poll.directMessageId,
        poll: serialized
      });
      return res.json(serialized);
    } catch (error) {
      console.error('Poll vote failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'POLL_VOTE_FAILED', error?.message || 'Failed to update vote.');
    }
  });

  app.post('/api/spaces', authMiddleware, messageRateLimit, async (req, res) => {
    try {
      const name = cleanText(req.body.name, 80);
      if (name.length < 2) return apiError(res, 400, 'INVALID_SPACE_NAME', 'Community name is too short.');
      const ownedSpaces = await prisma.guildMember.count({ where: { userId: req.user.userId, role: 'OWNER' } });
      if (ownedSpaces >= 10) return apiError(res, 409, 'SPACE_LIMIT_REACHED', 'A user can own up to 10 communities.');
      const description = cleanText(req.body.description, 600);
      const guild = await prisma.$transaction(async (tx) => {
        const created = await tx.guild.create({
          data: {
            name,
            description,
            accentColor: cleanText(req.body.accentColor, 20) || '#7c5cff',
            iconUrl: cleanText(req.body.iconUrl, 800) || null,
            members: { create: { userId: req.user.userId, role: 'OWNER' } },
            channels: {
              create: [
                { name: 'general', type: 'TEXT' },
                { name: 'Voice lounge', type: 'VOICE' }
              ]
            }
          },
          include: { channels: true, members: true }
        });
        await tx.guildAuditLog.create({
          data: { guildId: created.id, actorId: req.user.userId, action: 'SPACE_CREATED' }
        });
        return created;
      });
      return res.status(201).json(guild);
    } catch (error) {
      console.error('Space create failed:', error);
      return apiError(res, 500, 'SPACE_CREATE_FAILED', 'Failed to create community.');
    }
  });

  app.delete('/api/spaces/:guildId', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.params.guildId);
      const membership = await requireSpaceRole(guildId, req.user.userId, 'OWNER');
      if (membership.role !== 'OWNER') throw spaceAccessError('OWNER');
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) return apiError(res, 404, 'SPACE_NOT_FOUND', 'Community not found.');
      if (cleanText(req.body.confirmName, 80) !== guild.name) {
        return apiError(res, 400, 'SPACE_NAME_CONFIRMATION_REQUIRED', 'Enter the exact community name to delete it.');
      }
      await prisma.guild.delete({ where: { id: guildId } });
      return res.json({ ok: true });
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'SPACE_DELETE_FAILED', error?.message || 'Failed to delete community.');
    }
  });

  app.get('/api/channels/:channelId/permissions', authMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const guildId = await guildIdForChannel(channelId);
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { permissions: { include: { user: { select: publicUserSelect } }, orderBy: { updatedAt: 'desc' } } }
      });
      return res.json(channel);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'CHANNEL_PERMISSIONS_FETCH_FAILED', error?.message || 'Failed to load channel permissions.');
    }
  });

  app.patch('/api/channels/:channelId/permissions', authMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const guildId = await guildIdForChannel(channelId);
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const minimumRole = cleanText(req.body.minimumRole, 20).toUpperCase() || 'MEMBER';
      if (!SPACE_ROLES.has(minimumRole)) return apiError(res, 400, 'INVALID_SPACE_ROLE', 'Choose a valid minimum role.');
      const channel = await prisma.channel.update({
        where: { id: channelId },
        data: { isPrivate: Boolean(req.body.isPrivate), minimumRole }
      });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, action: 'CHANNEL_ACCESS_CHANGED', metadata: { channelId, isPrivate: channel.isPrivate, minimumRole } });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.json(channel);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'CHANNEL_PERMISSIONS_UPDATE_FAILED', error?.message || 'Failed to update channel permissions.');
    }
  });

  app.put('/api/channels/:channelId/permissions/:userId', authMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const userId = positiveInt(req.params.userId);
      const guildId = await guildIdForChannel(channelId);
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const target = await membershipFor(guildId, userId);
      if (!target) return apiError(res, 404, 'SPACE_MEMBER_NOT_FOUND', 'Community member not found.');
      const permission = await prisma.channelPermission.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId, canView: req.body.canView !== false, canPost: req.body.canPost !== false, canManage: Boolean(req.body.canManage) },
        update: { canView: req.body.canView !== false, canPost: req.body.canPost !== false, canManage: Boolean(req.body.canManage) }
      });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, targetUserId: userId, action: 'CHANNEL_MEMBER_ACCESS_CHANGED', metadata: { channelId, canView: permission.canView, canPost: permission.canPost } });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.json(permission);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'CHANNEL_MEMBER_ACCESS_UPDATE_FAILED', error?.message || 'Failed to update member access.');
    }
  });

  app.delete('/api/channels/:channelId/permissions/:userId', authMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const userId = positiveInt(req.params.userId);
      const guildId = await guildIdForChannel(channelId);
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      await prisma.channelPermission.deleteMany({ where: { channelId, userId } });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.json({ ok: true });
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'CHANNEL_MEMBER_ACCESS_DELETE_FAILED', error?.message || 'Failed to remove member access.');
    }
  });

  app.get('/api/spaces', authMiddleware, async (req, res) => {
    try {
      const requestedGuildId = positiveInt(req.query.guildId);
      const memberships = await prisma.guildMember.findMany({
        where: { userId: req.user.userId },
        orderBy: { joinedAt: 'asc' },
        include: {
          guild: {
            include: {
              channels: {
                orderBy: [{ type: 'asc' }, { id: 'asc' }],
                include: { permissions: { where: { userId: req.user.userId } } }
              }
            }
          }
        }
      });
      const selected = requestedGuildId
        ? memberships.find((item) => item.guildId === requestedGuildId)
        : memberships[0];
      if (!selected) {
        return res.json({ guild: null, guilds: [], membership: null, activityCount: 0, scheduledCount: 0, events: [], activePolls: [] });
      }
      const guild = selected.guild;
      const visibleChannels = guild.channels.filter((channel) => (
        SPACE_ROLE_RANK[selected.role] >= SPACE_ROLE_RANK.MODERATOR
        || (SPACE_ROLE_RANK[selected.role] >= SPACE_ROLE_RANK[channel.minimumRole]
          && (!channel.isPrivate || channel.permissions?.some((permission) => permission.userId === req.user.userId && permission.canView)))
      ));
      const [events, activePolls, activityCount, scheduledCount] = await Promise.all([
        prisma.communityEvent.findMany({
          where: { guildId: guild.id, startsAt: { gte: new Date(Date.now() - 86_400_000) } },
          orderBy: { startsAt: 'asc' },
          take: 20,
          include: {
            creator: { select: publicUserSelect },
            rsvps: true
          }
        }),
        prisma.poll.findMany({
          where: {
            channelId: { in: visibleChannels.map((channel) => channel.id) },
            OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }]
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: pollInclude
        }),
        prisma.activityEvent.count({ where: { userId: req.user.userId, readAt: null } }),
        prisma.scheduledMessage.count({ where: { senderId: req.user.userId, status: 'PENDING' } })
      ]);
      return res.json({
        guild: { ...guild, channels: visibleChannels.map(({ permissions, ...channel }) => channel) },
        guilds: memberships.map((item) => ({
          id: item.guild.id,
          name: item.guild.name,
          iconUrl: item.guild.iconUrl,
          accentColor: item.guild.accentColor,
          membership: { role: item.role, joinedAt: item.joinedAt }
        })),
        membership: { role: selected.role, joinedAt: selected.joinedAt },
        activityCount,
        scheduledCount,
        events: events.map((item) => serializeEvent(item, req.user.userId)),
        activePolls: activePolls.map((item) => serializePoll(item, req.user.userId))
      });
    } catch (error) {
      console.error('Spaces fetch failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'SPACES_FETCH_FAILED', error?.message || 'Failed to load Spaces.');
    }
  });

  app.post('/api/events', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.body.guildId);
      const title = cleanText(req.body.title, 120);
      const startsAt = parseDate(req.body.startsAt);
      const endsAt = parseDate(req.body.endsAt);
      if (!guildId || !title || !startsAt || startsAt.getTime() < Date.now() - 60_000) {
        return apiError(res, 400, 'INVALID_EVENT', 'Choose a title and a future start time.');
      }
      await requireSpaceRole(guildId, req.user.userId, 'MODERATOR');
      const event = await prisma.communityEvent.create({
        data: {
          guildId,
          creatorId: req.user.userId,
          title,
          description: cleanText(req.body.description, 2_000),
          location: cleanText(req.body.location, 160),
          coverUrl: cleanText(req.body.coverUrl, 800) || null,
          startsAt,
          endsAt: endsAt && endsAt > startsAt ? endsAt : null
        },
        include: { creator: { select: publicUserSelect }, rsvps: true }
      });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.status(201).json(serializeEvent(event, req.user.userId));
    } catch (error) {
      console.error('Event create failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'EVENT_CREATE_FAILED', error?.message || 'Failed to create event.');
    }
  });

  app.put('/api/events/:eventId/rsvp', authMiddleware, async (req, res) => {
    try {
      const eventId = positiveInt(req.params.eventId);
      const status = cleanText(req.body.status, 20).toUpperCase();
      if (!eventId || !RSVP_STATUSES.has(status)) {
        return apiError(res, 400, 'INVALID_RSVP', 'Choose a valid RSVP status.');
      }
      const event = await prisma.communityEvent.findUnique({ where: { id: eventId } });
      if (!event) return apiError(res, 404, 'EVENT_NOT_FOUND', 'Event not found.');
      await requireSpaceRole(event.guildId, req.user.userId);
      await prisma.communityEventRsvp.upsert({
        where: { eventId_userId: { eventId, userId: req.user.userId } },
        create: { eventId, userId: req.user.userId, status },
        update: { status }
      });
      const updated = await prisma.communityEvent.findUnique({
        where: { id: eventId },
        include: { creator: { select: publicUserSelect }, rsvps: true }
      });
      io.to(`guild:${event.guildId}`).emit('spaces:refresh');
      return res.json(serializeEvent(updated, req.user.userId));
    } catch (error) {
      console.error('Event RSVP failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'EVENT_RSVP_FAILED', error?.message || 'Failed to update RSVP.');
    }
  });

  app.get('/api/invites', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.query.guildId);
      if (!guildId) return apiError(res, 400, 'INVALID_GUILD_ID', 'Invalid community id.');
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const invites = await prisma.guildInvite.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { guild: true, creator: { select: publicUserSelect } }
      });
      return res.json(invites);
    } catch (error) {
      console.error('Invite fetch failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'INVITE_FETCH_FAILED', error?.message || 'Failed to load invite links.');
    }
  });

  app.post('/api/invites', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.body.guildId);
      if (!guildId) return apiError(res, 400, 'INVALID_GUILD_ID', 'Invalid community id.');
      await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const expiresInHours = Math.min(24 * 365, Math.max(1, Number(req.body.expiresInHours) || 168));
      const maxUses = positiveInt(req.body.maxUses);
      const invite = await prisma.guildInvite.create({
        data: {
          code: crypto.randomBytes(7).toString('base64url'),
          guildId,
          creatorId: req.user.userId,
          maxUses,
          expiresAt: new Date(Date.now() + expiresInHours * 3_600_000)
        },
        include: { guild: true, creator: { select: publicUserSelect } }
      });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, action: 'INVITE_CREATED', metadata: { inviteId: invite.id, expiresAt: invite.expiresAt, maxUses: invite.maxUses } });
      return res.status(201).json(invite);
    } catch (error) {
      console.error('Invite create failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'INVITE_CREATE_FAILED', error?.message || 'Failed to create invite link.');
    }
  });

  app.delete('/api/invites/:inviteId', authMiddleware, async (req, res) => {
    try {
      const inviteId = positiveInt(req.params.inviteId);
      if (!inviteId) return apiError(res, 400, 'INVALID_INVITE_ID', 'Invalid invite id.');
      const existing = await prisma.guildInvite.findUnique({ where: { id: inviteId } });
      if (!existing) return apiError(res, 404, 'INVITE_NOT_FOUND', 'Invite link was not found.');
      await requireSpaceRole(existing.guildId, req.user.userId, 'ADMIN');
      const invite = await prisma.guildInvite.update({
        where: { id: inviteId },
        data: { revokedAt: new Date() },
        include: { guild: true, creator: { select: publicUserSelect } }
      });
      await recordSpaceAudit({ guildId: existing.guildId, actorId: req.user.userId, action: 'INVITE_REVOKED', metadata: { inviteId } });
      return res.json(invite);
    } catch (error) {
      console.error('Invite revoke failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'INVITE_REVOKE_FAILED', error?.message || 'Failed to revoke invite link.');
    }
  });

  app.get('/api/invites/:code', async (req, res) => {
    try {
      const code = cleanText(req.params.code, 80);
      const invite = await prisma.guildInvite.findUnique({
        where: { code },
        include: { guild: true, creator: { select: publicUserSelect } }
      });
      const unavailable = !invite
        || invite.revokedAt
        || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now())
        || (invite.maxUses && invite.uses >= invite.maxUses);
      if (unavailable) return apiError(res, 404, 'INVITE_NOT_FOUND', 'Invite link is unavailable.');
      return res.json({
        code: invite.code,
        guild: invite.guild,
        creator: invite.creator,
        expiresAt: invite.expiresAt,
        uses: invite.uses,
        maxUses: invite.maxUses
      });
    } catch (error) {
      console.error('Invite preview failed:', error);
      return apiError(res, 500, 'INVITE_FETCH_FAILED', 'Failed to load invite link.');
    }
  });

  app.post('/api/invites/:code/accept', authMiddleware, async (req, res) => {
    try {
      const code = cleanText(req.params.code, 80);
      const membership = await prisma.$transaction(async (tx) => {
        const invite = await tx.guildInvite.findUnique({ where: { code } });
        const unavailable = !invite
          || invite.revokedAt
          || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now())
          || (invite.maxUses && invite.uses >= invite.maxUses);
        if (unavailable) {
          const error = new Error('Invite link is unavailable.');
          error.status = 404;
          error.code = 'INVITE_NOT_FOUND';
          throw error;
        }
        const existing = await tx.guildMember.findUnique({
          where: { guildId_userId: { guildId: invite.guildId, userId: req.user.userId } }
        });
        const member = existing || await tx.guildMember.create({
          data: { guildId: invite.guildId, userId: req.user.userId }
        });
        if (!existing) {
          await tx.guildInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
          await tx.guildAuditLog.create({
            data: { guildId: invite.guildId, actorId: req.user.userId, targetUserId: req.user.userId, action: 'MEMBER_JOINED', metadata: { inviteId: invite.id } }
          });
        }
        return member;
      });
      return res.json({ ok: true, membership });
    } catch (error) {
      console.error('Invite accept failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'INVITE_ACCEPT_FAILED', error?.message || 'Failed to join community.');
    }
  });

  app.get('/api/spaces/:guildId/members', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.params.guildId);
      await requireSpaceRole(guildId, req.user.userId);
      const members = await prisma.guildMember.findMany({
        where: { guildId },
        orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
        include: { user: { select: publicUserSelect } }
      });
      return res.json(members);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'SPACE_MEMBERS_FETCH_FAILED', error?.message || 'Failed to load members.');
    }
  });

  app.patch('/api/spaces/:guildId/members/:userId', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.params.guildId);
      const targetUserId = positiveInt(req.params.userId);
      const role = cleanText(req.body.role, 20).toUpperCase();
      const actor = await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      if (!targetUserId || !SPACE_ROLES.has(role)) return apiError(res, 400, 'INVALID_SPACE_ROLE', 'Choose a valid community role.');
      if (role === 'OWNER' && actor.role !== 'OWNER') throw spaceAccessError('OWNER');
      const target = await membershipFor(guildId, targetUserId);
      if (!target) return apiError(res, 404, 'SPACE_MEMBER_NOT_FOUND', 'Community member not found.');
      if (SPACE_ROLE_RANK[target.role] >= SPACE_ROLE_RANK[actor.role] && targetUserId !== req.user.userId) throw spaceAccessError(target.role);
      if (target.role === 'OWNER' && role !== 'OWNER') {
        const ownerCount = await prisma.guildMember.count({ where: { guildId, role: 'OWNER' } });
        if (ownerCount <= 1) return apiError(res, 409, 'LAST_SPACE_OWNER_REQUIRED', 'At least one community owner must remain.');
      }
      const updated = await prisma.guildMember.update({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        data: { role },
        include: { user: { select: publicUserSelect } }
      });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, targetUserId, action: 'MEMBER_ROLE_CHANGED', metadata: { from: target.role, to: role } });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.json(updated);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'SPACE_ROLE_UPDATE_FAILED', error?.message || 'Failed to update member role.');
    }
  });

  app.delete('/api/spaces/:guildId/members/:userId', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.params.guildId);
      const targetUserId = positiveInt(req.params.userId);
      const actor = await requireSpaceRole(guildId, req.user.userId, 'ADMIN');
      const target = await membershipFor(guildId, targetUserId);
      if (!target) return apiError(res, 404, 'SPACE_MEMBER_NOT_FOUND', 'Community member not found.');
      if (target.role === 'OWNER' || SPACE_ROLE_RANK[target.role] >= SPACE_ROLE_RANK[actor.role]) throw spaceAccessError(target.role);
      await prisma.guildMember.delete({ where: { guildId_userId: { guildId, userId: targetUserId } } });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, targetUserId, action: 'MEMBER_REMOVED' });
      io.to(`guild:${guildId}`).emit('spaces:refresh');
      return res.json({ ok: true });
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'SPACE_MEMBER_REMOVE_FAILED', error?.message || 'Failed to remove member.');
    }
  });

  app.get('/api/spaces/:guildId/audit-log', authMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.params.guildId);
      await requireSpaceRole(guildId, req.user.userId, 'MODERATOR');
      const entries = await prisma.guildAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { actor: { select: publicUserSelect }, targetUser: { select: publicUserSelect } }
      });
      return res.json(entries);
    } catch (error) {
      return apiError(res, error?.status || 500, error?.code || 'SPACE_AUDIT_FETCH_FAILED', error?.message || 'Failed to load audit log.');
    }
  });

  app.patch('/api/channels/:channelId/slow-mode', authMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const slowModeSeconds = Math.min(21_600, Math.max(0, Math.round(Number(req.body.seconds) || 0)));
      if (!channelId) return apiError(res, 400, 'INVALID_CHANNEL_ID', 'Invalid channel id.');
      const guildId = await guildIdForChannel(channelId);
      if (!guildId) return apiError(res, 404, 'CHANNEL_NOT_FOUND', 'Channel not found.');
      await requireSpaceRole(guildId, req.user.userId, 'MODERATOR');
      const channel = await prisma.channel.update({
        where: { id: channelId },
        data: { slowModeSeconds }
      });
      await recordSpaceAudit({ guildId, actorId: req.user.userId, action: 'SLOW_MODE_CHANGED', metadata: { channelId, seconds: slowModeSeconds } });
      io.to(`guild:${channel.guildId}`).emit('channel-updated', channel);
      return res.json(channel);
    } catch (error) {
      console.error('Slow mode update failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'SLOW_MODE_UPDATE_FAILED', error?.message || 'Failed to update slow mode.');
    }
  });

  app.get('/api/scheduled-messages', authMiddleware, async (req, res) => {
    try {
      const items = await prisma.scheduledMessage.findMany({
        where: { senderId: req.user.userId, status: 'PENDING' },
        orderBy: { sendAt: 'asc' },
        take: 100
      });
      return res.json(items);
    } catch (error) {
      console.error('Scheduled message fetch failed:', error);
      return apiError(res, 500, 'SCHEDULED_FETCH_FAILED', 'Failed to load scheduled messages.');
    }
  });

  app.post('/api/scheduled-messages', authMiddleware, messageRateLimit, async (req, res) => {
    try {
      const channelId = positiveInt(req.body.channelId);
      const conversationId = positiveInt(req.body.conversationId);
      const content = cleanText(req.body.content, 8_000);
      const sendAt = parseDate(req.body.sendAt);
      if (Boolean(channelId) === Boolean(conversationId) || !content || !sendAt || sendAt.getTime() < Date.now() + 10_000) {
        return apiError(res, 400, 'INVALID_SCHEDULE', 'Choose one destination and a future send time.');
      }
      if (conversationId && !await conversationForMember(conversationId, req.user.userId)) {
        return apiError(res, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }
      if (channelId) {
        await requireChannelAccess(channelId, req.user.userId, 'post');
      }
      const scheduled = await prisma.scheduledMessage.create({
        data: {
          senderId: req.user.userId,
          channelId,
          conversationId,
          content,
          attachmentUrl: cleanText(req.body.attachmentUrl, 800) || null,
          attachmentType: req.body.attachmentType || null,
          attachmentName: cleanText(req.body.attachmentName, 240) || null,
          replyToId: positiveInt(req.body.replyToId),
          sendAt,
          silent: Boolean(req.body.silent)
        }
      });
      return res.status(201).json(scheduled);
    } catch (error) {
      console.error('Schedule create failed:', error);
      return apiError(res, error?.status || 500, error?.code || 'SCHEDULE_CREATE_FAILED', error?.message || 'Failed to schedule message.');
    }
  });

  app.delete('/api/scheduled-messages/:messageId', authMiddleware, async (req, res) => {
    try {
      const id = positiveInt(req.params.messageId);
      const result = await prisma.scheduledMessage.deleteMany({
        where: { id, senderId: req.user.userId, status: 'PENDING' }
      });
      if (!result.count) return apiError(res, 404, 'SCHEDULED_NOT_FOUND', 'Scheduled message not found.');
      return res.json({ ok: true });
    } catch (error) {
      console.error('Schedule delete failed:', error);
      return apiError(res, 500, 'SCHEDULE_DELETE_FAILED', 'Failed to cancel scheduled message.');
    }
  });

  let processingScheduled = false;
  async function deliverScheduledMessages() {
    if (processingScheduled) return;
    processingScheduled = true;
    try {
      const due = await prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', sendAt: { lte: new Date() } },
        orderBy: { sendAt: 'asc' },
        take: 25
      });
      for (const scheduled of due) {
        const claimed = await prisma.scheduledMessage.updateMany({
          where: { id: scheduled.id, status: 'PENDING' },
          data: { status: 'SENDING' }
        });
        if (!claimed.count) continue;
        try {
          if (scheduled.channelId) {
            const message = await createChannelMessage({
              channelId: scheduled.channelId,
              userId: scheduled.senderId,
              content: scheduled.content,
              attachmentUrl: scheduled.attachmentUrl,
              attachmentType: scheduled.attachmentType,
              attachmentName: scheduled.attachmentName,
              transcript: null,
              forwardedFromName: null,
              replyToId: scheduled.replyToId,
              silent: scheduled.silent
            });
            if (!message) throw new Error('Channel no longer exists.');
            io.to(`channel:${scheduled.channelId}`).emit('new-message', message);
          } else {
            const { conversation, message } = await createDirectConversationMessage({
              conversationId: scheduled.conversationId,
              userId: scheduled.senderId,
              content: scheduled.content,
              attachmentUrl: scheduled.attachmentUrl,
              attachmentType: scheduled.attachmentType,
              attachmentName: scheduled.attachmentName,
              transcript: null,
              forwardedFromName: null,
              replyToId: scheduled.replyToId,
              silent: scheduled.silent
            });
            if (!message) throw new Error('Conversation no longer exists.');
            io.to(`dm:${scheduled.conversationId}`).emit('direct-message:new', {
              ...message,
              conversationId: scheduled.conversationId
            });
            const recipients = getConversationMemberIds(conversation)
              .filter((userId) => userId !== scheduled.senderId);
            await Promise.all(recipients.map((userId) => recordActivity(prisma, {
              userId,
              actorId: scheduled.senderId,
              kind: 'DIRECT_MESSAGE',
              title: 'Scheduled message',
              body: scheduled.content,
              conversationId: scheduled.conversationId,
              directMessageId: message.id
            })));
          }
          await prisma.scheduledMessage.update({
            where: { id: scheduled.id },
            data: { status: 'SENT' }
          });
        } catch (error) {
          await prisma.scheduledMessage.update({
            where: { id: scheduled.id },
            data: {
              status: 'FAILED',
              failureReason: cleanText(error?.message || 'Delivery failed.', 300)
            }
          });
        }
      }
    } catch (error) {
      console.error('Scheduled delivery failed:', error);
    } finally {
      processingScheduled = false;
    }
  }

  const scheduledTimer = setInterval(deliverScheduledMessages, 15_000);
  scheduledTimer.unref?.();
  deliverScheduledMessages().catch((error) => console.error('Initial scheduled delivery failed:', error));

  return { decorateMessage, serializePoll, deliverScheduledMessages };
}
