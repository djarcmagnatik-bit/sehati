-- CreateEnum
CREATE TYPE "VendorResearchStatus" AS ENUM ('RESEARCHING', 'CONTACTED', 'MEETING', 'SHORTLISTED', 'REJECTED', 'SELECTED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "vendor_id" UUID;

-- CreateTable
CREATE TABLE "vendor_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "budget_category_name" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendor_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_research" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contact_person" VARCHAR(120),
    "whatsapp" VARCHAR(25),
    "phone" VARCHAR(25),
    "instagram" VARCHAR(30),
    "website" VARCHAR(300),
    "estimated_price" BIGINT,
    "package_name" VARCHAR(160),
    "location" VARCHAR(160),
    "rating" INTEGER,
    "pros" VARCHAR(1000),
    "cons" VARCHAR(1000),
    "notes" VARCHAR(2000),
    "status" "VendorResearchStatus" NOT NULL DEFAULT 'RESEARCHING',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendor_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "research_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "contact_person" VARCHAR(120),
    "whatsapp" VARCHAR(25),
    "phone" VARCHAR(25),
    "instagram" VARCHAR(30),
    "website" VARCHAR(300),
    "package_name" VARCHAR(160),
    "booking_date" DATE,
    "event_label" VARCHAR(120),
    "notes" VARCHAR(2000),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_categories_code_key" ON "vendor_categories"("code");

-- CreateIndex
CREATE INDEX "vendor_research_wedding_id_status_idx" ON "vendor_research"("wedding_id", "status");

-- CreateIndex
CREATE INDEX "vendor_research_wedding_id_category_id_idx" ON "vendor_research"("wedding_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_research_id_wedding_id_key" ON "vendor_research"("id", "wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_research_id_key" ON "vendors"("research_id");

-- CreateIndex
CREATE INDEX "vendors_wedding_id_category_id_idx" ON "vendors"("wedding_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_id_wedding_id_key" ON "vendors"("id", "wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_research_id_wedding_id_key" ON "vendors"("research_id", "wedding_id");

-- CreateIndex
CREATE INDEX "expenses_vendor_id_idx" ON "expenses"("vendor_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_wedding_id_fkey" FOREIGN KEY ("vendor_id", "wedding_id") REFERENCES "vendors"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vendor_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vendor_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_research_id_wedding_id_fkey" FOREIGN KEY ("research_id", "wedding_id") REFERENCES "vendor_research"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_estimated_price_nonnegative" CHECK ("estimated_price" IS NULL OR "estimated_price" >= 0);
ALTER TABLE "vendor_research" ADD CONSTRAINT "vendor_research_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
