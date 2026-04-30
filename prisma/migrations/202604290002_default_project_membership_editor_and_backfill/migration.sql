ALTER TABLE "project_memberships" ALTER COLUMN "role" SET DEFAULT 'editor';

UPDATE "project_memberships"
SET "role" = 'editor'
WHERE "role" = 'member';
