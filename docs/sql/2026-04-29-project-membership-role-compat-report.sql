SELECT
  role,
  count(*) AS membership_count
FROM project_memberships
GROUP BY role
ORDER BY role;

SELECT
  count(*) AS legacy_project_member_rows
FROM project_memberships
WHERE role = 'member';
