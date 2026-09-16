-- CreateEnum
CREATE TYPE "GiftItemStatus" AS ENUM ('PLANNED', 'PURCHASED', 'PACKED', 'READY');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO');

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "music_asset_id" UUID,
ADD COLUMN     "music_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "music_volume" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "duration_seconds" INTEGER,
ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
ALTER COLUMN "width" DROP NOT NULL,
ALTER COLUMN "height" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vendor_research" ADD COLUMN     "meeting_date" DATE,
ADD COLUMN     "meeting_time" VARCHAR(5);

-- AlterTable
ALTER TABLE "weddings" ADD COLUMN     "savings_monthly_target" BIGINT,
ADD COLUMN     "savings_target" BIGINT;

-- CreateTable
CREATE TABLE "savings_entries" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "contributor" VARCHAR(80) NOT NULL,
    "amount" BIGINT NOT NULL,
    "entry_date" DATE NOT NULL,
    "account" VARCHAR(80),
    "notes" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "savings_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gift_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_items" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimated_price" BIGINT,
    "actual_price" BIGINT,
    "responsible" VARCHAR(80),
    "status" "GiftItemStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" VARCHAR(1000),
    "photo_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gift_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rundown_items" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "item_date" DATE,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5),
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "pic" VARCHAR(80),
    "location" VARCHAR(120),
    "category" VARCHAR(60),
    "notes" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rundown_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "event_date" DATE NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "location" VARCHAR(120),
    "notes" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savings_entries_wedding_id_entry_date_idx" ON "savings_entries"("wedding_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "gift_categories_code_key" ON "gift_categories"("code");

-- CreateIndex
CREATE INDEX "gift_items_wedding_id_status_idx" ON "gift_items"("wedding_id", "status");

-- CreateIndex
CREATE INDEX "gift_items_wedding_id_sort_order_idx" ON "gift_items"("wedding_id", "sort_order");

-- CreateIndex
CREATE INDEX "rundown_items_wedding_id_item_date_sort_order_idx" ON "rundown_items"("wedding_id", "item_date", "sort_order");

-- CreateIndex
CREATE INDEX "calendar_events_wedding_id_event_date_idx" ON "calendar_events"("wedding_id", "event_date");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_music_asset_id_wedding_id_fkey" FOREIGN KEY ("music_asset_id", "wedding_id") REFERENCES "media_assets"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "gift_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_photo_id_wedding_id_fkey" FOREIGN KEY ("photo_id", "wedding_id") REFERENCES "media_assets"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rundown_items" ADD CONSTRAINT "rundown_items_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_savings_target_positive" CHECK ("savings_target" IS NULL OR "savings_target" >= 0);
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_savings_monthly_target_positive" CHECK ("savings_monthly_target" IS NULL OR "savings_monthly_target" >= 0);
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 999);
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_estimated_price_positive" CHECK ("estimated_price" IS NULL OR "estimated_price" >= 0);
ALTER TABLE "gift_items" ADD CONSTRAINT "gift_items_actual_price_positive" CHECK ("actual_price" IS NULL OR "actual_price" >= 0);
ALTER TABLE "rundown_items" ADD CONSTRAINT "rundown_items_start_time_format" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "rundown_items" ADD CONSTRAINT "rundown_items_end_time_format" CHECK ("end_time" IS NULL OR ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" >= "start_time"));
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_start_time_format" CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_end_time_format" CHECK ("end_time" IS NULL OR ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ("start_time" IS NULL OR "end_time" >= "start_time")));
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_meeting_time_format" CHECK ("meeting_time" IS NULL OR ("meeting_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "meeting_date" IS NOT NULL));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_music_volume_range" CHECK ("music_volume" BETWEEN 0 AND 100);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_image_has_dimensions" CHECK ("kind" <> 'IMAGE' OR ("width" IS NOT NULL AND "height" IS NOT NULL));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_range_v2" CHECK (("width" IS NULL OR "width" BETWEEN 1 AND 8000) AND ("height" IS NULL OR "height" BETWEEN 1 AND 8000));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_duration_positive" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0);
-- Audio files are larger than images, so the old size ceiling is replaced by a per-kind one.
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_byte_size_range";
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_dimensions_range";
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_byte_size_range_v2" CHECK ("byte_size" > 0 AND "byte_size" <= CASE WHEN "kind" = 'AUDIO' THEN 6291456 ELSE 3145728 END);
