-- P12 durable People invitation authority. Raw bearer tokens are never stored.
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "publicId" UUID NOT NULL,
    "inviterAccountId" UUID NOT NULL,
    "resolvedByAccountId" UUID,
    "tokenDigest" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "declinedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invitation_resolution_check" CHECK (
      ("status" = 'PENDING' AND "resolvedByAccountId" IS NULL AND "acceptedAt" IS NULL AND "declinedAt" IS NULL AND "revokedAt" IS NULL) OR
      ("status" = 'ACCEPTED' AND "resolvedByAccountId" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "declinedAt" IS NULL AND "revokedAt" IS NULL) OR
      ("status" = 'DECLINED' AND "resolvedByAccountId" IS NOT NULL AND "acceptedAt" IS NULL AND "declinedAt" IS NOT NULL AND "revokedAt" IS NULL) OR
      ("status" = 'REVOKED' AND "resolvedByAccountId" IS NULL AND "acceptedAt" IS NULL AND "declinedAt" IS NULL AND "revokedAt" IS NOT NULL) OR
      ("status" = 'EXPIRED' AND "resolvedByAccountId" IS NULL AND "acceptedAt" IS NULL AND "declinedAt" IS NULL AND "revokedAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "Invitation_publicId_key" ON "Invitation"("publicId");
CREATE UNIQUE INDEX "Invitation_tokenDigest_key" ON "Invitation"("tokenDigest");
CREATE INDEX "Invitation_inviterAccountId_status_createdAt_idx" ON "Invitation"("inviterAccountId", "status", "createdAt");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterAccountId_fkey"
  FOREIGN KEY ("inviterAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_resolvedByAccountId_fkey"
  FOREIGN KEY ("resolvedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
