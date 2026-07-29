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
      return apiError(res, 500, 'THREAD_FETCH_FAILED', 'Failed to load thread.');
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
      return apiError(res, 500, 'POLL_VOTE_FAILED', 'Failed to update vote.');
    }
  });

  app.get('/api/spaces', authMiddleware, async (req, res) => {
    try {
      const guild = await prisma.guild.findFirst({ orderBy: { id: 'asc' } });
      if (!guild) return apiError(res, 404, 'SPACE_NOT_FOUND', 'Community not found.');
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
            channel: { guildId: guild.id },
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
        guild,
        activityCount,
        scheduledCount,
        events: events.map((item) => serializeEvent(item, req.user.userId)),
        activePolls: activePolls.map((item) => serializePoll(item, req.user.userId))
      });
    } catch (error) {
      console.error('Spaces fetch failed:', error);
      return apiError(res, 500, 'SPACES_FETCH_FAILED', 'Failed to load Spaces.');
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
      return apiError(res, 500, 'EVENT_CREATE_FAILED', 'Failed to create event.');
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
      return apiError(res, 500, 'EVENT_RSVP_FAILED', 'Failed to update RSVP.');
    }
  });

  app.get('/api/invites', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const invites = await prisma.guildInvite.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { guild: true, creator: { select: publicUserSelect } }
      });
      return res.json(invites);
    } catch (error) {
      console.error('Invite fetch failed:', error);
      return apiError(res, 500, 'INVITE_FETCH_FAILED', 'Failed to load invite links.');
    }
  });

  app.post('/api/invites', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const guildId = positiveInt(req.body.guildId);
      if (!guildId) return apiError(res, 400, 'INVALID_GUILD_ID', 'Invalid community id.');
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
      return res.status(201).json(invite);
    } catch (error) {
      console.error('Invite create failed:', error);
      return apiError(res, 500, 'INVITE_CREATE_FAILED', 'Failed to create invite link.');
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

  app.patch('/api/channels/:channelId/slow-mode', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const channelId = positiveInt(req.params.channelId);
      const slowModeSeconds = Math.min(21_600, Math.max(0, Math.round(Number(req.body.seconds) || 0)));
      if (!channelId) return apiError(res, 400, 'INVALID_CHANNEL_ID', 'Invalid channel id.');
      const channel = await prisma.channel.update({
        where: { id: channelId },
        data: { slowModeSeconds }
      });
      io.to(`guild:${channel.guildId}`).emit('channel-updated', channel);
      return res.json(channel);
    } catch (error) {
      console.error('Slow mode update failed:', error);
      return apiError(res, 500, 'SLOW_MODE_UPDATE_FAILED', 'Failed to update slow mode.');
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
      return apiError(res, 500, 'SCHEDULE_CREATE_FAILED', 'Failed to schedule message.');
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

  app.get('/api/search', authMiddleware, async (req, res) => {
    try {
      const query = cleanText(req.query.q, 120);
      const authorId = positiveInt(req.query.authorId);
      const before = parseDate(req.query.before);
      const after = parseDate(req.query.after);
      const type = cleanText(req.query.type, 20).toLowerCase();
      if (query.length < 2) return res.json({ results: [] });
      const dateFilter = {
        ...(before ? { lte: before } : {}),
        ...(after ? { gte: after } : {})
      };
      const textWhere = {
        deletedAt: null,
        ...(authorId ? { authorId } : {}),
        ...(before || after ? { createdAt: dateFilter } : {}),
        OR: [
          { content: { contains: query, mode: 'insensitive' } },
          { attachmentName: { contains: query, mode: 'insensitive' } },
          { transcript: { contains: query, mode: 'insensitive' } }
        ]
      };
      const conversations = await prisma.directConversation.findMany({
        where: {
          OR: [
            { userOneId: req.user.userId },
            { userTwoId: req.user.userId },
            { members: { some: { userId: req.user.userId } } }
          ]
        },
        select: { id: true }
      });
      const conversationIds = conversations.map((item) => item.id);
      const [channelMessages, directMessages] = await Promise.all([
        type === 'dm' ? [] : prisma.message.findMany({
          where: textWhere,
          orderBy: { createdAt: 'desc' },
          take: 40,
          include: { author: { select: publicUserSelect }, channel: true }
        }),
        type === 'channel' ? [] : prisma.directMessage.findMany({
          where: { ...textWhere, conversationId: { in: conversationIds } },
          orderBy: { createdAt: 'desc' },
          take: 40,
          include: { author: { select: publicUserSelect }, conversation: true }
        })
      ]);
      const results = [
        ...channelMessages.map((message) => ({
          type: 'channel',
          id: message.id,
          channelId: message.channelId,
          title: `#${message.channel.name}`,
          content: message.content || message.transcript || message.attachmentName,
          createdAt: message.createdAt,
          author: message.author
        })),
        ...directMessages.map((message) => ({
          type: 'dm',
          id: message.id,
          conversationId: message.conversationId,
          title: message.conversation.title || 'Direct message',
          content: message.content || message.transcript || message.attachmentName,
          createdAt: message.createdAt,
          author: message.author
        }))
      ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 60);
      return res.json({ results });
    } catch (error) {
      console.error('Global search failed:', error);
      return apiError(res, 500, 'SEARCH_FAILED', 'Failed to search messages.');
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
