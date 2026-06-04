-- Link task assignees to project members while keeping the legacy text snapshot.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "assignee_profile_id" UUID;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assignee_profile_id_fkey"
  FOREIGN KEY ("assignee_profile_id")
  REFERENCES "profiles"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tasks_project_assignee_profile_id_idx"
  ON "tasks"("project_id", "assignee_profile_id");

WITH candidate_values AS (
  SELECT
    t.id AS task_id,
    pm.profile_id,
    1 AS priority
  FROM "tasks" t
  JOIN "project_memberships" pm
    ON pm.project_id = t.project_id
  WHERE t.assignee_profile_id IS NULL
    AND NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND LOWER(BTRIM(t.assignee)) = LOWER(BTRIM(pm.email))

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    2 AS priority
  FROM "tasks" t
  JOIN "project_memberships" pm
    ON pm.project_id = t.project_id
  WHERE t.assignee_profile_id IS NULL
    AND NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(pm.display_name), '') IS NOT NULL
    AND BTRIM(t.assignee) = BTRIM(pm.display_name)

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    2 AS priority
  FROM "tasks" t
  JOIN "project_memberships" pm
    ON pm.project_id = t.project_id
  JOIN "profiles" p
    ON p.id = pm.profile_id
  WHERE t.assignee_profile_id IS NULL
    AND NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(p.display_name), '') IS NOT NULL
    AND BTRIM(t.assignee) = BTRIM(p.display_name)

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    3 AS priority
  FROM "tasks" t
  JOIN "project_memberships" pm
    ON pm.project_id = t.project_id
  WHERE t.assignee_profile_id IS NULL
    AND NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(pm.display_name), '') IS NOT NULL
    AND LOWER(REGEXP_REPLACE(BTRIM(t.assignee), '\s+', ' ', 'g')) =
      LOWER(REGEXP_REPLACE(BTRIM(pm.display_name), '\s+', ' ', 'g'))

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    3 AS priority
  FROM "tasks" t
  JOIN "project_memberships" pm
    ON pm.project_id = t.project_id
  JOIN "profiles" p
    ON p.id = pm.profile_id
  WHERE t.assignee_profile_id IS NULL
    AND NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(p.display_name), '') IS NOT NULL
    AND LOWER(REGEXP_REPLACE(BTRIM(t.assignee), '\s+', ' ', 'g')) =
      LOWER(REGEXP_REPLACE(BTRIM(p.display_name), '\s+', ' ', 'g'))
),
priority_candidates AS (
  SELECT DISTINCT task_id, profile_id, priority
  FROM candidate_values
),
ranked_candidates AS (
  SELECT
    task_id,
    profile_id,
    priority,
    MIN(priority) OVER (PARTITION BY task_id) AS best_priority,
    COUNT(*) OVER (PARTITION BY task_id, priority) AS priority_candidate_count
  FROM priority_candidates
)
UPDATE "tasks" t
SET "assignee_profile_id" = ranked.profile_id
FROM ranked_candidates ranked
WHERE t.id = ranked.task_id
  AND t.assignee_profile_id IS NULL
  AND ranked.priority = ranked.best_priority
  AND ranked.priority_candidate_count = 1;
