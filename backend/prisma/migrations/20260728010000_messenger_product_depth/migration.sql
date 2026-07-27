CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "MessageBookmark" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "messageId" INTEGER,
  "directMessageId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageBookmark_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageBookmark_target_check"
    CHECK (num_nonnulls("messageId", "directMessageId") = 1),
  CONSTRAINT "MessageBookmark_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageBookmark_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageBookmark_directMessageId_fkey"
    FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MessageBookmark_userId_messageId_key"
  ON "MessageBookmark"("userId", "messageId");
CREATE UNIQUE INDEX "MessageBookmark_userId_directMessageId_key"
  ON "MessageBookmark"("userId", "directMessageId");
CREATE INDEX "MessageBookmark_userId_createdAt_idx"
  ON "MessageBookmark"("userId", "createdAt");

CREATE TABLE "MessageEditHistory" (
  "id" SERIAL NOT NULL,
  "editorId" INTEGER NOT NULL,
  "messageId" INTEGER,
  "directMessageId" INTEGER,
  "previousContent" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageEditHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageEditHistory_target_check"
    CHECK (num_nonnulls("messageId", "directMessageId") = 1),
  CONSTRAINT "MessageEditHistory_editorId_fkey"
    FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageEditHistory_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageEditHistory_directMessageId_fkey"
    FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MessageEditHistory_messageId_createdAt_idx"
  ON "MessageEditHistory"("messageId", "createdAt");
CREATE INDEX "MessageEditHistory_directMessageId_createdAt_idx"
  ON "MessageEditHistory"("directMessageId", "createdAt");
CREATE INDEX "MessageEditHistory_editorId_createdAt_idx"
  ON "MessageEditHistory"("editorId", "createdAt");

CREATE TABLE "PushSubscription" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "notificationMode" TEXT NOT NULL DEFAULT 'all',
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
  "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
  "timezoneOffset" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");

CREATE TABLE "CallRecord" (
  "id" TEXT NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "callerId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "video" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'RINGING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallRecord_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallRecord_callerId_fkey"
    FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CallRecord_conversationId_startedAt_idx"
  ON "CallRecord"("conversationId", "startedAt");
CREATE INDEX "CallRecord_callerId_startedAt_idx"
  ON "CallRecord"("callerId", "startedAt");
CREATE INDEX "CallRecord_status_startedAt_idx"
  ON "CallRecord"("status", "startedAt");

CREATE TABLE "CallRecordParticipant" (
  "id" SERIAL NOT NULL,
  "callId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "CallRecordParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallRecordParticipant_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "CallRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallRecordParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CallRecordParticipant_callId_userId_key"
  ON "CallRecordParticipant"("callId", "userId");
CREATE INDEX "CallRecordParticipant_userId_callId_idx"
  ON "CallRecordParticipant"("userId", "callId");

CREATE INDEX "Message_content_trgm_idx"
  ON "Message" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "Message_attachmentName_trgm_idx"
  ON "Message" USING GIN ("attachmentName" gin_trgm_ops);
CREATE INDEX "Message_transcript_trgm_idx"
  ON "Message" USING GIN ("transcript" gin_trgm_ops);
CREATE INDEX "DirectMessage_content_trgm_idx"
  ON "DirectMessage" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "DirectMessage_attachmentName_trgm_idx"
  ON "DirectMessage" USING GIN ("attachmentName" gin_trgm_ops);
CREATE INDEX "DirectMessage_transcript_trgm_idx"
  ON "DirectMessage" USING GIN ("transcript" gin_trgm_ops);
