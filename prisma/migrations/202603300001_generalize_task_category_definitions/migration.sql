ALTER TABLE "work_type_definitions"
  ADD COLUMN "field_key" TEXT NOT NULL DEFAULT 'workType';

DROP INDEX IF EXISTS "work_type_definitions_project_id_is_active_idx";
DROP INDEX IF EXISTS "work_type_definitions_project_id_sort_order_idx";

CREATE INDEX "work_type_definitions_field_key_project_id_is_active_idx"
  ON "work_type_definitions"("field_key", "project_id", "is_active");

CREATE INDEX "work_type_definitions_field_key_project_id_sort_order_idx"
  ON "work_type_definitions"("field_key", "project_id", "sort_order");
