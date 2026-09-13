-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('CLERK');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('INVITED', 'CONNECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('WAITING_FOR_RECIPIENT', 'WAITING_FOR_SENDER', 'CONNECTING', 'TRANSFERRING', 'RECONNECTING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TransferSourceKind" AS ENUM ('SINGLE_FILE', 'MULTIPLE_FILES', 'FOLDER');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('BROWSER', 'DESTINATION', 'INTEGRITY', 'NETWORK', 'SERVICE', 'SOURCE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "authProvider" "AuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRelationship" (
    "id" UUID NOT NULL,
    "accountLowId" UUID NOT NULL,
    "accountHighId" UUID NOT NULL,
    "initiatedByAccountId" UUID,
    "blockedByAccountId" UUID,
    "status" "RelationshipStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PersonRelationship_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonRelationship_canonical_pair_check" CHECK ("accountLowId" < "accountHighId"),
    CONSTRAINT "PersonRelationship_state_check" CHECK (
      ("status" = 'CONNECTED' AND "initiatedByAccountId" IS NULL AND "blockedByAccountId" IS NULL) OR
      ("status" = 'INVITED' AND "initiatedByAccountId" IN ("accountLowId", "accountHighId") AND "blockedByAccountId" IS NULL) OR
      ("status" = 'BLOCKED' AND "blockedByAccountId" IN ("accountLowId", "accountHighId") AND "initiatedByAccountId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "TransferRecord" (
    "id" UUID NOT NULL,
    "ownerAccountId" UUID NOT NULL,
    "peerAccountId" UUID,
    "lifecycleKey" VARCHAR(96) NOT NULL,
    "direction" "TransferDirection" NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "sourceKind" "TransferSourceKind" NOT NULL,
    "totalBytes" BIGINT,
    "fileCount" INTEGER,
    "folderCount" INTEGER,
    "failureCategory" "FailureCategory",
    "activeMetadata" JSONB,
    "speedProof" JSONB,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransferRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransferRecord_total_bytes_check" CHECK ("totalBytes" IS NULL OR "totalBytes" >= 0),
    CONSTRAINT "TransferRecord_file_count_check" CHECK ("fileCount" IS NULL OR "fileCount" >= 0),
    CONSTRAINT "TransferRecord_folder_count_check" CHECK ("folderCount" IS NULL OR "folderCount" >= 0),
    CONSTRAINT "TransferRecord_revision_check" CHECK ("revision" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_authProvider_providerSubject_key" ON "Account"("authProvider", "providerSubject");
CREATE INDEX "PersonRelationship_accountLowId_updatedAt_idx" ON "PersonRelationship"("accountLowId", "updatedAt");
CREATE INDEX "PersonRelationship_accountHighId_updatedAt_idx" ON "PersonRelationship"("accountHighId", "updatedAt");
CREATE UNIQUE INDEX "PersonRelationship_accountLowId_accountHighId_key" ON "PersonRelationship"("accountLowId", "accountHighId");
CREATE INDEX "TransferRecord_ownerAccountId_createdAt_idx" ON "TransferRecord"("ownerAccountId", "createdAt");
CREATE INDEX "TransferRecord_ownerAccountId_id_idx" ON "TransferRecord"("ownerAccountId", "id");
CREATE UNIQUE INDEX "TransferRecord_ownerAccountId_lifecycleKey_key" ON "TransferRecord"("ownerAccountId", "lifecycleKey");

-- AddForeignKey
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_accountLowId_fkey" FOREIGN KEY ("accountLowId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_accountHighId_fkey" FOREIGN KEY ("accountHighId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_initiatedByAccountId_fkey" FOREIGN KEY ("initiatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_blockedByAccountId_fkey" FOREIGN KEY ("blockedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRecord" ADD CONSTRAINT "TransferRecord_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRecord" ADD CONSTRAINT "TransferRecord_peerAccountId_fkey" FOREIGN KEY ("peerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Terminal records are immutable. This prevents late lifecycle events from reopening or altering a completed,
-- failed, or canceled transfer after a newer attempt has started.
CREATE FUNCTION "prevent_terminal_transfer_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('COMPLETED', 'FAILED', 'CANCELED') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransferRecord_terminal_immutable"
BEFORE UPDATE ON "TransferRecord"
FOR EACH ROW EXECUTE FUNCTION "prevent_terminal_transfer_mutation"();
