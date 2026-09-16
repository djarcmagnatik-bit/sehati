-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "InvitationSectionType" AS ENUM ('COVER', 'COUPLE', 'QUOTE', 'EVENTS', 'COUNTDOWN', 'LOVE_STORY', 'GALLERY', 'LOCATION', 'RSVP', 'WISHES', 'GIFT', 'CLOSING');

-- CreateEnum
CREATE TYPE "GiftAccountType" AS ENUM ('BANK', 'EWALLET');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "invitation_opened_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'DRAFT',
    "theme_code" VARCHAR(40) NOT NULL DEFAULT 'minimal',
    "theme_options" JSONB,
    "cover_image_id" UUID,
    "default_guest_label" VARCHAR(120),
    "gift_address" VARCHAR(500),
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_sections" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "type" "InvitationSectionType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_events" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "event_date" DATE NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "venue_name" VARCHAR(120),
    "address" VARCHAR(500),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "maps_url" VARCHAR(500),
    "dress_code" VARCHAR(120),
    "notes" VARCHAR(1000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wedding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "love_story_entries" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "time_label" VARCHAR(40),
    "story" VARCHAR(1000) NOT NULL,
    "image_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "love_story_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_images" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "caption" VARCHAR(160),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_accounts" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "type" "GiftAccountType" NOT NULL,
    "provider_name" VARCHAR(60) NOT NULL,
    "account_number" VARCHAR(40) NOT NULL,
    "account_holder" VARCHAR(80) NOT NULL,
    "notes" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gift_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "storage_key" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(120) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_wedding_id_key" ON "invitations"("wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_slug_key" ON "invitations"("slug");

-- CreateIndex
CREATE INDEX "invitations_status_slug_idx" ON "invitations"("status", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_id_wedding_id_key" ON "invitations"("id", "wedding_id");

-- CreateIndex
CREATE INDEX "invitation_sections_invitation_id_sort_order_idx" ON "invitation_sections"("invitation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_sections_invitation_id_type_key" ON "invitation_sections"("invitation_id", "type");

-- CreateIndex
CREATE INDEX "wedding_events_wedding_id_sort_order_idx" ON "wedding_events"("wedding_id", "sort_order");

-- CreateIndex
CREATE INDEX "love_story_entries_invitation_id_sort_order_idx" ON "love_story_entries"("invitation_id", "sort_order");

-- CreateIndex
CREATE INDEX "gallery_images_invitation_id_sort_order_idx" ON "gallery_images"("invitation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_images_invitation_id_asset_id_key" ON "gallery_images"("invitation_id", "asset_id");

-- CreateIndex
CREATE INDEX "gift_accounts_invitation_id_sort_order_idx" ON "gift_accounts"("invitation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_wedding_id_created_at_idx" ON "media_assets"("wedding_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_id_wedding_id_key" ON "media_assets"("id", "wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_wedding_id_checksum_key" ON "media_assets"("wedding_id", "checksum");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_cover_image_id_wedding_id_fkey" FOREIGN KEY ("cover_image_id", "wedding_id") REFERENCES "media_assets"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_sections" ADD CONSTRAINT "invitation_sections_invitation_id_wedding_id_fkey" FOREIGN KEY ("invitation_id", "wedding_id") REFERENCES "invitations"("id", "wedding_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_sections" ADD CONSTRAINT "invitation_sections_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "love_story_entries" ADD CONSTRAINT "love_story_entries_invitation_id_wedding_id_fkey" FOREIGN KEY ("invitation_id", "wedding_id") REFERENCES "invitations"("id", "wedding_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "love_story_entries" ADD CONSTRAINT "love_story_entries_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "love_story_entries" ADD CONSTRAINT "love_story_entries_image_id_wedding_id_fkey" FOREIGN KEY ("image_id", "wedding_id") REFERENCES "media_assets"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_invitation_id_wedding_id_fkey" FOREIGN KEY ("invitation_id", "wedding_id") REFERENCES "invitations"("id", "wedding_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_asset_id_wedding_id_fkey" FOREIGN KEY ("asset_id", "wedding_id") REFERENCES "media_assets"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gift_accounts" ADD CONSTRAINT "gift_accounts_invitation_id_wedding_id_fkey" FOREIGN KEY ("invitation_id", "wedding_id") REFERENCES "invitations"("id", "wedding_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_accounts" ADD CONSTRAINT "gift_accounts_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") BETWEEN 3 AND 60);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_published_has_timestamp" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_start_time_format" CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_end_time_format" CHECK ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_latitude_range" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_longitude_range" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_byte_size_range" CHECK ("byte_size" > 0 AND "byte_size" <= 3145728);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_range" CHECK ("width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000);
ALTER TABLE "gift_accounts" ADD CONSTRAINT "gift_accounts_account_number_present" CHECK (length(btrim("account_number")) > 0);
