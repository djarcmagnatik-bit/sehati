-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "variants" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions"("created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_user_id_idx" ON "payment_transactions"("user_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "weddings_created_at_idx" ON "weddings"("created_at");

-- The hourly reminder scan looks across all weddings for open tasks and unpaid expenses due soon;
-- the per-wedding indexes cannot serve that, these partial indexes can.
CREATE INDEX "tasks_open_due_date_idx" ON "tasks"("due_date") WHERE "status" IN ('TODO', 'IN_PROGRESS') AND "due_date" IS NOT NULL;
CREATE INDEX "expenses_due_date_idx" ON "expenses"("due_date") WHERE "due_date" IS NOT NULL;

-- The variants column always holds a JSON array; it is written only by the media service.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_variants_array" CHECK (jsonb_typeof("variants") = 'array');
