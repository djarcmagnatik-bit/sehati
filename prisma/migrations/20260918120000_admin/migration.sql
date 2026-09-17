-- CreateEnum
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "discount_amount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "original_amount" BIGINT,
ADD COLUMN     "promo_code_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "suspended_reason" VARCHAR(200);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" VARCHAR(254) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" VARCHAR(80),
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_theme_settings" (
    "code" VARCHAR(40) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "display_name" VARCHAR(60),
    "description" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_theme_settings_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" VARCHAR(200),
    "discount_type" "PromoDiscountType" NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "plan_id" UUID,
    "starts_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL,
    "promo_code_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "user_id" UUID,
    "wedding_id" UUID NOT NULL,
    "discount_amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_transaction_id_key" ON "promo_redemptions"("transaction_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_promo_code_id_created_at_idx" ON "promo_redemptions"("promo_code_id", "created_at");

-- CreateIndex
CREATE INDEX "promo_redemptions_promo_code_id_user_id_idx" ON "promo_redemptions"("promo_code_id", "user_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$');
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_discount_range" CHECK (
  ("discount_type" = 'PERCENT' AND "discount_value" BETWEEN 1 AND 99) OR
  ("discount_type" = 'FIXED' AND "discount_value" > 0)
);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_limits_positive" CHECK (("usage_limit" IS NULL OR "usage_limit" > 0) AND ("per_user_limit" IS NULL OR "per_user_limit" > 0));
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_period" CHECK ("starts_at" IS NULL OR "expires_at" IS NULL OR "expires_at" > "starts_at");
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_discount_positive" CHECK ("discount_amount" > 0);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_discount_consistent" CHECK (
  "discount_amount" >= 0 AND ("original_amount" IS NULL OR "amount" = "original_amount" - "discount_amount")
);
ALTER TABLE "invitation_theme_settings" ADD CONSTRAINT "invitation_theme_settings_code_format" CHECK ("code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Data: the existing full-access plan also unlocks premium themes, so nobody who paid loses a theme.
UPDATE "plans" SET "features" = array_append("features", 'premium_themes')
WHERE "code" = 'FULL_ACCESS' AND NOT ('premium_themes' = ANY("features"));
