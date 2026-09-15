-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('TEMPLATE', 'CUSTOM');

-- AlterTable
ALTER TABLE "weddings" ADD COLUMN     "checklist_generated_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "task_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "category_id" UUID NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "deadline_offset_days" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_template_event_types" (
    "template_id" UUID NOT NULL,
    "event_type_id" UUID NOT NULL,

    CONSTRAINT "task_template_event_types_pkey" PRIMARY KEY ("template_id","event_type_id")
);

-- CreateTable
CREATE TABLE "task_template_marriage_processes" (
    "template_id" UUID NOT NULL,
    "marriage_process_id" UUID NOT NULL,

    CONSTRAINT "task_template_marriage_processes_pkey" PRIMARY KEY ("template_id","marriage_process_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "wedding_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "category_id" UUID NOT NULL,
    "due_date" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignee_member_id" UUID,
    "source" "TaskSource" NOT NULL,
    "template_id" UUID,
    "template_offset_days" INTEGER,
    "due_date_manually_set" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_categories_code_key" ON "task_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_code_key" ON "task_templates"("code");

-- CreateIndex
CREATE INDEX "task_templates_is_active_idx" ON "task_templates"("is_active");

-- CreateIndex
CREATE INDEX "task_template_event_types_event_type_id_idx" ON "task_template_event_types"("event_type_id");

-- CreateIndex
CREATE INDEX "task_template_marriage_processes_marriage_process_id_idx" ON "task_template_marriage_processes"("marriage_process_id");

-- CreateIndex
CREATE INDEX "tasks_wedding_id_status_due_date_idx" ON "tasks"("wedding_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_wedding_id_category_id_idx" ON "tasks"("wedding_id", "category_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_member_id_idx" ON "tasks"("assignee_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_wedding_id_template_id_key" ON "tasks"("wedding_id", "template_id");

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_event_types" ADD CONSTRAINT "task_template_event_types_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_event_types" ADD CONSTRAINT "task_template_event_types_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_marriage_processes" ADD CONSTRAINT "task_template_marriage_processes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_marriage_processes" ADD CONSTRAINT "task_template_marriage_processes_marriage_process_id_fkey" FOREIGN KEY ("marriage_process_id") REFERENCES "marriage_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_member_id_fkey" FOREIGN KEY ("assignee_member_id") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
