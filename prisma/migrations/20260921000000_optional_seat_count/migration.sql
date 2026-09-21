-- The seat count of an invitation becomes optional: NULL means the couple did not set one.
-- Existing rows keep their value. Without a seat count, an RSVP is bounded by the per-invitation
-- maximum (50) instead.
ALTER TABLE "guests" ALTER COLUMN "seat_count" DROP NOT NULL;
ALTER TABLE "guests" ALTER COLUMN "seat_count" DROP DEFAULT;

ALTER TABLE "guests" DROP CONSTRAINT "guests_seat_count_range";
ALTER TABLE "guests" ADD CONSTRAINT "guests_seat_count_range" CHECK ("seat_count" IS NULL OR "seat_count" BETWEEN 1 AND 50);

ALTER TABLE "guests" DROP CONSTRAINT "guests_attending_count_range";
ALTER TABLE "guests" ADD CONSTRAINT "guests_attending_count_range" CHECK ("attending_count" >= 0 AND "attending_count" <= COALESCE("seat_count", 50));
