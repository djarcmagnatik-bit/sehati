-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_DUE', 'TASK_OVERDUE', 'PAYMENT_DUE', 'PARTNER_INVITED', 'PARTNER_JOINED', 'RSVP_RECEIVED', 'BUDGET_EXCEEDED');

-- CreateEnum
CREATE TYPE "BackgroundJobState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'DEAD');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wedding_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "link" VARCHAR(200),
    "dedupe_key" VARCHAR(160) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "state" "BackgroundJobState" NOT NULL DEFAULT 'PENDING',
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(80),
    "last_error" VARCHAR(500),
    "dedupe_key" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "background_jobs_state_run_at_idx" ON "background_jobs"("state", "run_at");

-- CreateIndex
CREATE INDEX "background_jobs_type_state_idx" ON "background_jobs"("type", "state");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notifications only ever link inside the app.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_internal" CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_title_not_blank" CHECK (length(btrim("title")) > 0);

-- Job bookkeeping stays consistent.
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_attempts_range" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 50);
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_type_format" CHECK ("type" ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)*$');

-- At most one waiting job per dedupe key; running and finished jobs do not block a new request.
CREATE UNIQUE INDEX "background_jobs_pending_dedupe_key" ON "background_jobs"("dedupe_key") WHERE "state" = 'PENDING' AND "dedupe_key" IS NOT NULL;

-- Claiming scans only waiting or running jobs.
CREATE INDEX "background_jobs_claimable_idx" ON "background_jobs"("run_at") WHERE "state" IN ('PENDING', 'RUNNING');
