-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PLAN', 'ADDON');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('PURCHASE', 'ADMIN_GRANT');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "price" BIGINT NOT NULL,
    "duration_days" INTEGER,
    "features" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_entitlements" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "transaction_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "granted_by_id" UUID,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wedding_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "order_id" VARCHAR(40) NOT NULL,
    "wedding_id" UUID NOT NULL,
    "user_id" UUID,
    "kind" "PaymentKind" NOT NULL,
    "plan_id" UUID,
    "addon_id" UUID,
    "item_name" VARCHAR(120) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(20) NOT NULL,
    "provider_reference" VARCHAR(120),
    "checkout_url" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "event_key" VARCHAR(200) NOT NULL,
    "order_id" VARCHAR(40) NOT NULL,
    "transaction_id" UUID,
    "reported_status" VARCHAR(30) NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "price" BIGINT NOT NULL,
    "quota_amount" INTEGER NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_purchases" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "transaction_id" UUID,
    "quota" INTEGER NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_usages" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "reference_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_entitlements_transaction_id_key" ON "wedding_entitlements"("transaction_id");

-- CreateIndex
CREATE INDEX "wedding_entitlements_wedding_id_revoked_at_idx" ON "wedding_entitlements"("wedding_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_order_id_key" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_wedding_id_created_at_idx" ON "payment_transactions"("wedding_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_status_expires_at_idx" ON "payment_transactions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_event_key_key" ON "payment_webhook_events"("event_key");

-- CreateIndex
CREATE INDEX "payment_webhook_events_order_id_created_at_idx" ON "payment_webhook_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "addons_code_key" ON "addons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "addon_purchases_transaction_id_key" ON "addon_purchases"("transaction_id");

-- CreateIndex
CREATE INDEX "addon_purchases_wedding_id_addon_id_idx" ON "addon_purchases"("wedding_id", "addon_id");

-- CreateIndex
CREATE INDEX "addon_usages_wedding_id_addon_id_idx" ON "addon_usages"("wedding_id", "addon_id");

-- AddForeignKey
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_usages" ADD CONSTRAINT "addon_usages_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_usages" ADD CONSTRAINT "addon_usages_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual: data integrity (Prisma schema cannot express CHECK constraints)
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_positive" CHECK ("price" >= 0);
ALTER TABLE "plans" ADD CONSTRAINT "plans_duration_positive" CHECK ("duration_days" IS NULL OR "duration_days" > 0);
ALTER TABLE "addons" ADD CONSTRAINT "addons_price_positive" CHECK ("price" >= 0);
ALTER TABLE "addons" ADD CONSTRAINT "addons_quota_positive" CHECK ("quota_amount" > 0);
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_quota_positive" CHECK ("quota" > 0);
ALTER TABLE "addon_usages" ADD CONSTRAINT "addon_usages_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_positive" CHECK ("amount" > 0);
-- A transaction buys exactly one thing: a plan or an add-on, matching its kind.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_item_matches_kind" CHECK (
  ("kind" = 'PLAN' AND "plan_id" IS NOT NULL AND "addon_id" IS NULL) OR
  ("kind" = 'ADDON' AND "addon_id" IS NOT NULL AND "plan_id" IS NULL)
);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_paid_has_timestamp" CHECK ("status" NOT IN ('PAID', 'REFUNDED') OR "paid_at" IS NOT NULL);
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_purchase_has_transaction" CHECK ("source" <> 'PURCHASE' OR "transaction_id" IS NOT NULL);
ALTER TABLE "wedding_entitlements" ADD CONSTRAINT "wedding_entitlements_period" CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at");
