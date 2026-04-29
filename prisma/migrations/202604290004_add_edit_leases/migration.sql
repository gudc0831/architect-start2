CREATE TABLE "edit_leases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" UUID NOT NULL,
  "field_key" TEXT NOT NULL,
  "holder_profile_id" UUID NOT NULL,
  "holder_display_name" TEXT NOT NULL DEFAULT '',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "edit_leases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "edit_leases_project_id_target_type_target_id_field_key_key"
  ON "edit_leases"("project_id", "target_type", "target_id", "field_key");

CREATE INDEX "edit_leases_expires_at_idx" ON "edit_leases"("expires_at");
CREATE INDEX "edit_leases_holder_profile_id_idx" ON "edit_leases"("holder_profile_id");

ALTER TABLE "edit_leases"
  ADD CONSTRAINT "edit_leases_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edit_leases"
  ADD CONSTRAINT "edit_leases_holder_profile_id_fkey"
  FOREIGN KEY ("holder_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
