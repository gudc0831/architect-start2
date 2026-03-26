ALTER TABLE "profile_preferences"
  ADD COLUMN "task_list_column_widths" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "task_list_row_heights" JSONB NOT NULL DEFAULT '{}';
