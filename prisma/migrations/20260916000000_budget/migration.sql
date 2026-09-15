-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'E_WALLET', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "weddings" ADD COLUMN     "budget_initialized_at" TIMESTAMPTZ(3),
ADD COLUMN     "budget_warning_percent" INTEGER NOT NULL DEFAULT 80;

-- CreateTable
CREATE TABLE "budget_category_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "allocated_amount" BIGINT NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "due_date" DATE,
    "notes" VARCHAR(2000),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "notes" VARCHAR(1000),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_category_templates_code_key" ON "budget_category_templates"("code");

-- CreateIndex
CREATE INDEX "budget_categories_wedding_id_sort_order_idx" ON "budget_categories"("wedding_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_wedding_id_name_key" ON "budget_categories"("wedding_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_id_wedding_id_key" ON "budget_categories"("id", "wedding_id");

-- CreateIndex
CREATE INDEX "expenses_wedding_id_category_id_idx" ON "expenses"("wedding_id", "category_id");

-- CreateIndex
CREATE INDEX "expenses_wedding_id_due_date_idx" ON "expenses"("wedding_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_id_wedding_id_key" ON "expenses"("id", "wedding_id");

-- CreateIndex
CREATE INDEX "payments_wedding_id_payment_date_idx" ON "payments"("wedding_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_expense_id_idx" ON "payments"("expense_id");

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_wedding_id_fkey" FOREIGN KEY ("category_id", "wedding_id") REFERENCES "budget_categories"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_expense_id_wedding_id_fkey" FOREIGN KEY ("expense_id", "wedding_id") REFERENCES "expenses"("id", "wedding_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual: money integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_budget_warning_percent_range" CHECK ("budget_warning_percent" BETWEEN 1 AND 100);
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_allocated_amount_nonnegative" CHECK ("allocated_amount" >= 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_total_amount_positive" CHECK ("total_amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
