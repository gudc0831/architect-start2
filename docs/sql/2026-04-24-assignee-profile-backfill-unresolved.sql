-- Read-only report for unresolved legacy assignee mappings after the
-- 202604240002_add_task_assignee_profile_id migration runs.
WITH candidate_values AS (
  SELECT
    t.id AS task_id,
    pm.profile_id,
    1 AS priority
  FROM tasks t
  JOIN project_memberships pm
    ON pm.project_id = t.project_id
  WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND LOWER(BTRIM(t.assignee)) = LOWER(BTRIM(pm.email))

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    2 AS priority
  FROM tasks t
  JOIN project_memberships pm
    ON pm.project_id = t.project_id
  WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(pm.display_name), '') IS NOT NULL
    AND BTRIM(t.assignee) = BTRIM(pm.display_name)

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    2 AS priority
  FROM tasks t
  JOIN project_memberships pm
    ON pm.project_id = t.project_id
  JOIN profiles p
    ON p.id = pm.profile_id
  WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(p.display_name), '') IS NOT NULL
    AND BTRIM(t.assignee) = BTRIM(p.display_name)

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    3 AS priority
  FROM tasks t
  JOIN project_memberships pm
    ON pm.project_id = t.project_id
  WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(pm.display_name), '') IS NOT NULL
    AND LOWER(REGEXP_REPLACE(BTRIM(t.assignee), '\s+', ' ', 'g')) =
      LOWER(REGEXP_REPLACE(BTRIM(pm.display_name), '\s+', ' ', 'g'))

  UNION ALL

  SELECT
    t.id AS task_id,
    pm.profile_id,
    3 AS priority
  FROM tasks t
  JOIN project_memberships pm
    ON pm.project_id = t.project_id
  JOIN profiles p
    ON p.id = pm.profile_id
  WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
    AND NULLIF(BTRIM(p.display_name), '') IS NOT NULL
    AND LOWER(REGEXP_REPLACE(BTRIM(t.assignee), '\s+', ' ', 'g')) =
      LOWER(REGEXP_REPLACE(BTRIM(p.display_name), '\s+', ' ', 'g'))
),
priority_candidates AS (
  SELECT DISTINCT task_id, profile_id, priority
  FROM candidate_values
),
candidate_summary AS (
  SELECT
    task_id,
    MIN(priority) AS best_priority,
    COUNT(*) FILTER (WHERE priority = 1) AS email_candidate_count,
    COUNT(*) FILTER (WHERE priority = 2) AS exact_name_candidate_count,
    COUNT(*) FILTER (WHERE priority = 3) AS normalized_name_candidate_count,
    ARRAY_AGG(DISTINCT profile_id ORDER BY profile_id) AS candidate_profile_ids
  FROM priority_candidates
  GROUP BY task_id
)
SELECT
  t.project_id,
  t.id AS task_id,
  t.issue_id,
  t.task_number,
  t.assignee,
  t.assignee_profile_id,
  COALESCE(s.email_candidate_count, 0) AS email_candidate_count,
  COALESCE(s.exact_name_candidate_count, 0) AS exact_name_candidate_count,
  COALESCE(s.normalized_name_candidate_count, 0) AS normalized_name_candidate_count,
  COALESCE(s.candidate_profile_ids, ARRAY[]::uuid[]) AS candidate_profile_ids,
  CASE
    WHEN t.assignee_profile_id IS NOT NULL THEN 'resolved'
    WHEN s.task_id IS NULL THEN 'no_candidate'
    ELSE 'ambiguous_candidate'
  END AS resolution_state
FROM tasks t
LEFT JOIN candidate_summary s
  ON s.task_id = t.id
WHERE NULLIF(BTRIM(t.assignee), '') IS NOT NULL
  AND t.assignee_profile_id IS NULL
ORDER BY t.project_id, t.task_number, t.id;
