CREATE TABLE "UserClientState" (
  "userId" INTEGER NOT NULL,
  "state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserClientState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserClientState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserClientState_updatedAt_idx"
  ON "UserClientState"("updatedAt");
