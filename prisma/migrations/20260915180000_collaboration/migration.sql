-- CreateEnum
CREATE TYPE "PartnerInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateTable
CREATE TABLE "partner_invitations" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" "PartnerInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by_id" UUID,
    "accepted_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "user_id" UUID,
    "actor_name" VARCHAR(80) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitations_token_hash_key" ON "partner_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "partner_invitations_wedding_id_status_idx" ON "partner_invitations"("wedding_id", "status");

-- CreateIndex
CREATE INDEX "activity_logs_wedding_id_created_at_idx" ON "activity_logs"("wedding_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
