-- Spaces 2.0: upgrade legacy membership data and add auditable management.
-- Some early production installations created GuildMember outside Prisma migrations,
-- so every operation below is intentionally compatible with that legacy table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuildMemberRole') THEN
    CREATE TYPE "GuildMemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN', 'OWNER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GuildMember" (
    "id" SERIAL NOT NULL,
    "guildId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "GuildMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GuildMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GuildMember" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "GuildMember" SET "joinedAt" = CURRENT_TIMESTAMP WHERE "joinedAt" IS NULL;
UPDATE "GuildMember" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "GuildMember" ALTER COLUMN "joinedAt" SET NOT NULL;
ALTER TABLE "GuildMember" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GuildMember" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "GuildMember" ALTER COLUMN "updatedAt" DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GuildMember'
      AND column_name = 'role'
      AND udt_name <> 'GuildMemberRole'
  ) THEN
    ALTER TABLE "GuildMember" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "GuildMember"
      ALTER COLUMN "role" TYPE "GuildMemberRole"
      USING (
        CASE
          WHEN "role"::text IN ('MEMBER', 'MODERATOR', 'ADMIN', 'OWNER')
            THEN "role"::text::"GuildMemberRole"
          ELSE 'MEMBER'::"GuildMemberRole"
        END
      );
  END IF;
END $$;
ALTER TABLE "GuildMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"GuildMemberRole";

CREATE TABLE IF NOT EXISTS "GuildAuditLog" (
    "id" SERIAL NOT NULL,
    "guildId" INTEGER NOT NULL,
    "actorId" INTEGER,
    "targetUserId" INTEGER,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DevicePushToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ANDROID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuildMember_guildId_userId_key" ON "GuildMember"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "GuildMember_userId_joinedAt_idx" ON "GuildMember"("userId", "joinedAt");
CREATE INDEX IF NOT EXISTS "GuildMember_guildId_role_idx" ON "GuildMember"("guildId", "role");
CREATE INDEX IF NOT EXISTS "GuildAuditLog_guildId_createdAt_idx" ON "GuildAuditLog"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "GuildAuditLog_targetUserId_createdAt_idx" ON "GuildAuditLog"("targetUserId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX IF NOT EXISTS "DevicePushToken_userId_updatedAt_idx" ON "DevicePushToken"("userId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuildMember_guildId_fkey') THEN
    ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuildMember_userId_fkey') THEN
    ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuildAuditLog_guildId_fkey') THEN
    ALTER TABLE "GuildAuditLog" ADD CONSTRAINT "GuildAuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuildAuditLog_actorId_fkey') THEN
    ALTER TABLE "GuildAuditLog" ADD CONSTRAINT "GuildAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuildAuditLog_targetUserId_fkey') THEN
    ALTER TABLE "GuildAuditLog" ADD CONSTRAINT "GuildAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DevicePushToken_userId_fkey') THEN
    ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Preserve the existing public-community behaviour for every production account.
INSERT INTO "GuildMember" ("guildId", "userId", "role", "updatedAt")
SELECT guild."id", app_user."id",
  CASE app_user."role"::text
    WHEN 'OWNER' THEN 'OWNER'::"GuildMemberRole"
    WHEN 'ADMIN' THEN 'ADMIN'::"GuildMemberRole"
    ELSE 'MEMBER'::"GuildMemberRole"
  END,
  CURRENT_TIMESTAMP
FROM "Guild" guild
CROSS JOIN "User" app_user
ON CONFLICT ("guildId", "userId") DO NOTHING;
