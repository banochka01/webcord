ALTER TABLE "Message"
ADD COLUMN "transcript" TEXT,
ADD COLUMN "forwardedFromName" TEXT,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "pinnedById" INTEGER;

ALTER TABLE "DirectMessage"
ADD COLUMN "transcript" TEXT,
ADD COLUMN "forwardedFromName" TEXT,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "pinnedById" INTEGER;

CREATE INDEX "Message_channelId_pinnedAt_idx" ON "Message"("channelId", "pinnedAt");
CREATE INDEX "DirectMessage_conversationId_pinnedAt_idx" ON "DirectMessage"("conversationId", "pinnedAt");
