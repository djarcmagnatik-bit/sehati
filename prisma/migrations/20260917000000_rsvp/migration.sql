-- CreateEnum
CREATE TYPE "WishStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateTable
CREATE TABLE "rsvp_submissions" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "rsvp_status" "GuestRsvpStatus" NOT NULL,
    "attending_count" INTEGER NOT NULL,
    "attendee_names" VARCHAR(500),
    "message" VARCHAR(1000),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvp_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishes" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "guest_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "WishStatus" NOT NULL DEFAULT 'VISIBLE',
    "ip_hash" CHAR(64),
    "hidden_by_id" UUID,
    "hidden_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rsvp_submissions_wedding_id_created_at_idx" ON "rsvp_submissions"("wedding_id", "created_at");

-- CreateIndex
CREATE INDEX "rsvp_submissions_guest_id_created_at_idx" ON "rsvp_submissions"("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "wishes_wedding_id_status_created_at_idx" ON "wishes"("wedding_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guests_id_wedding_id_key" ON "guests"("id", "wedding_id");

-- AddForeignKey
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_guest_id_wedding_id_fkey" FOREIGN KEY ("guest_id", "wedding_id") REFERENCES "guests"("id", "wedding_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_guest_id_wedding_id_fkey" FOREIGN KEY ("guest_id", "wedding_id") REFERENCES "guests"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_attending_count_range" CHECK ("attending_count" >= 0 AND "attending_count" <= 50);
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_attending_matches_rsvp" CHECK (("rsvp_status" IN ('ATTENDING', 'MAYBE') OR "attending_count" = 0) AND ("rsvp_status" <> 'ATTENDING' OR "attending_count" >= 1));
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_name_present" CHECK (length(btrim("name")) > 0);
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_message_present" CHECK (length(btrim("message")) > 0);
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_hidden_has_timestamp" CHECK ("status" <> 'HIDDEN' OR "hidden_at" IS NOT NULL);
