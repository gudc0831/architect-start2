CREATE TYPE "ProfileAccessStatus" AS ENUM ('active', 'pending', 'disabled');
CREATE TYPE "ProjectInvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

ALTER TABLE "profiles"
ADD COLUMN "access_status" "ProfileAccessStatus" NOT NULL DEFAULT 'active';

CREATE TABLE "project_invitations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "ProjectMembershipRole" NOT NULL,
  "status" "ProjectInvitationStatus" NOT NULL DEFAULT 'pending',
  "token_hash" text NOT NULL,
  "expires_at" timestamptz(6) NOT NULL,
  "accepted_by_profile_id" uuid,
  "accepted_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid,
  CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_invitations_accepted_by_profile_id_fkey" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "project_invitations_token_hash_key" ON "project_invitations"("token_hash");
CREATE INDEX "project_invitations_project_id_status_idx" ON "project_invitations"("project_id", "status");
CREATE INDEX "project_invitations_email_idx" ON "project_invitations"("email");
CREATE INDEX "project_invitations_expires_at_idx" ON "project_invitations"("expires_at");

CREATE TABLE "access_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" uuid NOT NULL,
  "email" text NOT NULL,
  "project_id" uuid,
  "message" text,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
  "requested_role" "ProjectMembershipRole" NOT NULL DEFAULT 'viewer',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "access_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "access_requests_profile_id_status_idx" ON "access_requests"("profile_id", "status");
CREATE INDEX "access_requests_project_id_status_idx" ON "access_requests"("project_id", "status");
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");
