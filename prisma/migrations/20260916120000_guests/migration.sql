-- CreateEnum
CREATE TYPE "GuestInvitationStatus" AS ENUM ('NOT_SENT', 'SENT', 'OPENED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "GuestRsvpStatus" AS ENUM ('PENDING', 'ATTENDING', 'MAYBE', 'DECLINED');

-- AlterTable
ALTER TABLE "weddings" ADD COLUMN     "guest_groups_initialized_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "guest_group_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_group_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_groups" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "group_id" UUID,
    "guest_name" VARCHAR(120) NOT NULL,
    "invitation_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(25),
    "phone_normalized" VARCHAR(20),
    "email" VARCHAR(254),
    "address" VARCHAR(500),
    "seat_count" INTEGER NOT NULL DEFAULT 1,
    "invitation_status" "GuestInvitationStatus" NOT NULL DEFAULT 'NOT_SENT',
    "rsvp_status" "GuestRsvpStatus" NOT NULL DEFAULT 'PENDING',
    "attending_count" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000),
    "invitation_token" VARCHAR(32) NOT NULL,
    "import_batch_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_import_batches" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "file_name" VARCHAR(120) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "imported_count" INTEGER,
    "skipped_count" INTEGER,
    "committed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_group_templates_code_key" ON "guest_group_templates"("code");

-- CreateIndex
CREATE INDEX "guest_groups_wedding_id_sort_order_idx" ON "guest_groups"("wedding_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "guest_groups_wedding_id_name_key" ON "guest_groups"("wedding_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "guest_groups_id_wedding_id_key" ON "guest_groups"("id", "wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_invitation_token_key" ON "guests"("invitation_token");

-- CreateIndex
CREATE INDEX "guests_wedding_id_group_id_idx" ON "guests"("wedding_id", "group_id");

-- CreateIndex
CREATE INDEX "guests_wedding_id_rsvp_status_idx" ON "guests"("wedding_id", "rsvp_status");

-- CreateIndex
CREATE INDEX "guests_wedding_id_invitation_status_idx" ON "guests"("wedding_id", "invitation_status");

-- CreateIndex
CREATE INDEX "guests_wedding_id_phone_normalized_idx" ON "guests"("wedding_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "guests_wedding_id_invitation_name_idx" ON "guests"("wedding_id", "invitation_name");

-- CreateIndex
CREATE INDEX "guest_import_batches_wedding_id_created_at_idx" ON "guest_import_batches"("wedding_id", "created_at");

-- AddForeignKey
ALTER TABLE "guest_groups" ADD CONSTRAINT "guest_groups_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_group_id_wedding_id_fkey" FOREIGN KEY ("group_id", "wedding_id") REFERENCES "guest_groups"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "guest_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_import_batches" ADD CONSTRAINT "guest_import_batches_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_import_batches" ADD CONSTRAINT "guest_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "guests" ADD CONSTRAINT "guests_seat_count_range" CHECK ("seat_count" BETWEEN 1 AND 50);
ALTER TABLE "guests" ADD CONSTRAINT "guests_attending_count_range" CHECK ("attending_count" >= 0 AND "attending_count" <= "seat_count");
ALTER TABLE "guests" ADD CONSTRAINT "guests_attending_matches_rsvp" CHECK (("rsvp_status" IN ('ATTENDING', 'MAYBE') OR "attending_count" = 0) AND ("rsvp_status" <> 'ATTENDING' OR "attending_count" >= 1));
ALTER TABLE "guest_import_batches" ADD CONSTRAINT "guest_import_batches_row_count_range" CHECK ("row_count" BETWEEN 0 AND 5000);
