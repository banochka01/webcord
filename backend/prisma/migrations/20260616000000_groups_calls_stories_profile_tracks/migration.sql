CREATE TYPE "DirectConversationType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "StoryMediaType" AS ENUM ('IMAGE', 'VIDEO');

ALTER TABLE "User"
  ADD COLUMN "favoriteTrackUrl" TEXT,
  ADD COLUMN "favoriteTrackName" TEXT;

ALTER TABLE "DirectConversation"
  ADD COLUMN "type" "DirectConversationType" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "ownerId" INTEGER,
  ALTER COLUMN "userOneId" DROP NOT NULL,
  ALTER COLUMN "userTwoId" DROP NOT NULL;

ALTER TABLE "DirectConversation"
  ADD CONSTRAINT "DirectConversation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DirectConversation_type_updatedAt_idx" ON "DirectConversation"("type", "updatedAt");
CREATE INDEX "DirectConversation_ownerId_idx" ON "DirectConversation"("ownerId");

CREATE TABLE "DirectConversationMember" (
  "id" SERIAL NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DirectConversationMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DirectConversationMember"
  ADD CONSTRAINT "DirectConversationMember_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectConversationMember"
  ADD CONSTRAINT "DirectConversationMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DirectConversationMember_conversationId_userId_key"
  ON "DirectConversationMember"("conversationId", "userId");

CREATE INDEX "DirectConversationMember_userId_idx" ON "DirectConversationMember"("userId");

INSERT INTO "DirectConversationMember" ("conversationId", "userId", "role", "joinedAt")
SELECT "id", "userOneId", 'MEMBER', "createdAt"
FROM "DirectConversation"
WHERE "userOneId" IS NOT NULL
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO "DirectConversationMember" ("conversationId", "userId", "role", "joinedAt")
SELECT "id", "userTwoId", 'MEMBER', "createdAt"
FROM "DirectConversation"
WHERE "userTwoId" IS NOT NULL
ON CONFLICT ("conversationId", "userId") DO NOTHING;

CREATE TABLE "Story" (
  "id" SERIAL NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "mediaUrl" TEXT NOT NULL,
  "mediaType" "StoryMediaType" NOT NULL DEFAULT 'IMAGE',
  "authorId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Story"
  ADD CONSTRAINT "Story_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");
CREATE INDEX "Story_authorId_createdAt_idx" ON "Story"("authorId", "createdAt");

CREATE TABLE "StoryView" (
  "id" SERIAL NOT NULL,
  "storyId" INTEGER NOT NULL,
  "viewerId" INTEGER NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StoryView"
  ADD CONSTRAINT "StoryView_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryView"
  ADD CONSTRAINT "StoryView_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "StoryView_storyId_viewerId_key" ON "StoryView"("storyId", "viewerId");
CREATE INDEX "StoryView_viewerId_idx" ON "StoryView"("viewerId");
