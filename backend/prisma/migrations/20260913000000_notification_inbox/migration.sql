CREATE TYPE "NotificationType" AS ENUM ('DIRECT_MESSAGE', 'MENTION', 'REPLY');

CREATE TABLE "Notification" (
  "id" SERIAL NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "recipientId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "channelId" INTEGER,
  "conversationId" INTEGER,
  "messageId" INTEGER,
  "directMessageId" INTEGER,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientId_readAt_createdAt_idx"
  ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_recipientId_createdAt_idx"
  ON "Notification"("recipientId", "createdAt");
CREATE INDEX "Notification_messageId_idx" ON "Notification"("messageId");
CREATE INDEX "Notification_directMessageId_idx" ON "Notification"("directMessageId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_directMessageId_fkey"
  FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
