CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "file_analysis_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "analysis_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "text" text NOT NULL,
  "token_hash" text NOT NULL,
  "embedding" vector(1536),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "file_analysis_chunks_file_analysis_chunk_key"
  ON "file_analysis_chunks"("file_id", "analysis_id", "chunk_index");

CREATE INDEX IF NOT EXISTS "file_analysis_chunks_project_task_idx"
  ON "file_analysis_chunks"("project_id", "task_id");

CREATE INDEX IF NOT EXISTS "file_analysis_chunks_project_analysis_idx"
  ON "file_analysis_chunks"("project_id", "analysis_id");

CREATE INDEX IF NOT EXISTS "file_analysis_chunks_text_fts_idx"
  ON "file_analysis_chunks"
  USING gin (to_tsvector('simple', "text"));

CREATE INDEX IF NOT EXISTS "file_analysis_chunks_embedding_idx"
  ON "file_analysis_chunks"
  USING ivfflat ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;
