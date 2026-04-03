ALTER TYPE "TaskStatus" RENAME VALUE 'waiting' TO 'new';
ALTER TYPE "TaskStatus" RENAME VALUE 'todo' TO 'in_review';
ALTER TYPE "TaskStatus" RENAME VALUE 'in_progress' TO 'in_discussion';

ALTER TABLE "tasks"
  ALTER COLUMN "status" SET DEFAULT 'new';

UPDATE "tasks"
SET "status_history" = regexp_replace(
  regexp_replace(
    regexp_replace(
      "status_history",
      E' - waiting(?=\\n|$)',
      ' - new',
      'g'
    ),
    E' - todo(?=\\n|$)',
    ' - in_review',
    'g'
  ),
  E' - in_progress(?=\\n|$)',
  ' - in_discussion',
  'g'
)
WHERE "status_history" IS NOT NULL
  AND "status_history" <> '';
