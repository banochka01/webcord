-- WebCord 4.2: revocable sessions, client diagnostics and private channel ACLs.
CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "secretHash" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'WEB',
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientErrorReport" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "sessionId" TEXT,
  "platform" TEXT NOT NULL,
  "appVersion" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "context" JSONB,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ClientErrorReport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Channel" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Channel" ADD COLUMN "minimumRole" "GuildMemberRole" NOT NULL DEFAULT 'MEMBER';

CREATE TABLE "ChannelPermission" (
  "id" SERIAL NOT NULL,
  "channelId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "canPost" BOOLEAN NOT NULL DEFAULT true,
  "canManage" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelPermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSession_userId_revokedAt_lastSeenAt_idx" ON "UserSession"("userId", "revokedAt", "lastSeenAt");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX "ClientErrorReport_fingerprint_createdAt_idx" ON "ClientErrorReport"("fingerprint", "createdAt");
CREATE INDEX "ClientErrorReport_userId_createdAt_idx" ON "ClientErrorReport"("userId", "createdAt");
CREATE INDEX "ClientErrorReport_resolvedAt_createdAt_idx" ON "ClientErrorReport"("resolvedAt", "createdAt");
CREATE UNIQUE INDEX "ChannelPermission_channelId_userId_key" ON "ChannelPermission"("channelId", "userId");
CREATE INDEX "ChannelPermission_userId_canView_idx" ON "ChannelPermission"("userId", "canView");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientErrorReport" ADD CONSTRAINT "ClientErrorReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientErrorReport" ADD CONSTRAINT "ClientErrorReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
