CREATE TABLE "profile_preferences" (
  "profile_id" UUID NOT NULL,
  "quick_create_widths" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_preferences_pkey" PRIMARY KEY ("profile_id"),
  CONSTRAINT "profile_preferences_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
