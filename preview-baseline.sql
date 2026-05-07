-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProfileRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "ProjectMembershipRole" AS ENUM ('manager', 'member');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('new', 'in_review', 'in_discussion', 'blocked', 'done');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "ProfileRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_number" INTEGER NOT NULL,
    "action_id" INTEGER NOT NULL DEFAULT 0,
    "issue_id" TEXT NOT NULL DEFAULT '',
    "parent_task_id" UUID,
    "root_task_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sibling_order" INTEGER NOT NULL DEFAULT 0,
    "due_date" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "coordination_scope" TEXT NOT NULL DEFAULT '',
    "owner_discipline" TEXT NOT NULL DEFAULT '',
    "requester" TEXT NOT NULL DEFAULT '',
    "related_disciplines" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "reviewed_at" TEXT NOT NULL DEFAULT '',
    "is_daily" BOOLEAN NOT NULL DEFAULT false,
    "location_ref" TEXT NOT NULL DEFAULT '',
    "calendar_linked" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'new',
    "status_history" TEXT NOT NULL DEFAULT '',
    "conclusion" TEXT NOT NULL DEFAULT '',
    "completed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "purged_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_group_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" BIGINT NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'supabase-storage',
    "storage_bucket" TEXT NOT NULL,
    "object_path" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "uploaded_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "purged_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_preferences" (
    "profile_id" UUID NOT NULL,
    "theme_id" TEXT NOT NULL DEFAULT 'classic',
    "quick_create_widths" JSONB NOT NULL DEFAULT '{}',
    "task_list_column_widths" JSONB NOT NULL DEFAULT '{}',
    "task_list_row_heights" JSONB NOT NULL DEFAULT '{}',
    "task_list_detail_panel_width" INTEGER NOT NULL DEFAULT 340,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profile_preferences_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "foundation_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "owner_discipline" TEXT NOT NULL DEFAULT '건축',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "foundation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "ProjectMembershipRole" NOT NULL DEFAULT 'member',
    "display_name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_type_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "field_key" TEXT NOT NULL DEFAULT 'workType',
    "project_id" UUID,
    "code" TEXT NOT NULL,
    "label_ko" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "work_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "tasks_project_id_deleted_at_purged_at_idx" ON "tasks"("project_id", "deleted_at", "purged_at");

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_task_number_key" ON "tasks"("project_id", "task_number");

-- CreateIndex
CREATE INDEX "files_task_id_deleted_at_purged_at_idx" ON "files"("task_id", "deleted_at", "purged_at");

-- CreateIndex
CREATE INDEX "files_file_group_id_version_idx" ON "files"("file_group_id", "version");

-- CreateIndex
CREATE INDEX "project_memberships_profile_id_idx" ON "project_memberships"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_memberships_project_id_profile_id_key" ON "project_memberships"("project_id", "profile_id");

-- CreateIndex
CREATE INDEX "work_type_definitions_field_key_project_id_is_active_idx" ON "work_type_definitions"("field_key", "project_id", "is_active");

-- CreateIndex
CREATE INDEX "work_type_definitions_field_key_project_id_sort_order_idx" ON "work_type_definitions"("field_key", "project_id", "sort_order");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_root_task_id_fkey" FOREIGN KEY ("root_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_preferences" ADD CONSTRAINT "profile_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_type_definitions" ADD CONSTRAINT "work_type_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
