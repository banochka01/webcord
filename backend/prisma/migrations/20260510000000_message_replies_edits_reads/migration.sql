-- Add reply, edit, delete, and read metadata for channel and direct messages.

ALTER TABLE "Message"
ADD COLUMN "replyToId" INTEGER,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "DirectMessage"
ADD COLUMN "replyToId" INTEGER,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "DirectMessage_conversationId_readAt_idx" ON "DirectMessage"("conversationId", "readAt");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES "Message"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
