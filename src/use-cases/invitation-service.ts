import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { AuthUser } from "@/domains/auth/types";
import type { RequestedProjectRole } from "@/lib/auth/project-capabilities";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { canInviteProjectRole, isAssignableProjectRole } from "@/lib/auth/project-capabilities";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";

const INVITATION_TOKEN_BYTES = 32;
const DEFAULT_INVITATION_TTL_DAYS = 7;

export type InvitationAcceptResult = {
  projectId: string;
  profileId: string;
  role: RequestedProjectRole;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRawInvitationToken() {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

function addDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function displayNameFromSupabaseUser(input: { email?: string | null; userMetadata?: Record<string, unknown> | null }) {
  const metadataName = input.userMetadata?.full_name ?? input.userMetadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return normalizeEmail(input.email ?? "").split("@")[0] || "User";
}

export async function createProjectInvitation(input: {
  projectId: string;
  email: string;
  role: RequestedProjectRole;
  actor: AuthUser;
  requestUrl: URL;
}) {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw badRequest("email is required", "INVITATION_EMAIL_REQUIRED");
  }

  if (!isAssignableProjectRole(input.role)) {
    throw badRequest("role is invalid", "INVITATION_ROLE_INVALID");
  }

  const context = await requireProjectManager(input.projectId, input.actor);
  if (
    !canInviteProjectRole({
      globalRole: input.actor.role,
      projectRole: context.membership?.role ?? null,
      requestedRole: input.role,
    })
  ) {
    throw forbidden("You cannot invite this project role", "INVITATION_ROLE_FORBIDDEN");
  }

  const rawToken = createRawInvitationToken();
  const invitation = await prisma.projectInvitation.create({
    data: {
      projectId: context.project.id,
      email,
      role: input.role,
      tokenHash: invitationTokenHash(rawToken),
      expiresAt: addDays(DEFAULT_INVITATION_TTL_DAYS),
      createdBy: input.actor.id,
      updatedBy: input.actor.id,
    },
  });
  const acceptUrl = new URL("/invitations/accept", input.requestUrl);
  acceptUrl.searchParams.set("token", rawToken);

  return {
    id: invitation.id,
    projectId: invitation.projectId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptUrl: acceptUrl.toString(),
    token: rawToken,
  };
}

export async function listProjectInvitations(input: { projectId: string; actor: AuthUser }) {
  const context = await requireProjectManager(input.projectId, input.actor);
  const invitations = await prisma.projectInvitation.findMany({
    where: { projectId: context.project.id },
    orderBy: [{ createdAt: "desc" }],
  });

  return invitations.map((invitation) => ({
    id: invitation.id,
    projectId: invitation.projectId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedByProfileId: invitation.acceptedByProfileId,
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  }));
}

export async function revokeProjectInvitation(input: { invitationId: string; actor: AuthUser }) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { id: input.invitationId },
  });

  if (!invitation) {
    throw notFound("Invitation not found", "INVITATION_NOT_FOUND");
  }

  await requireProjectManager(invitation.projectId, input.actor);

  return prisma.projectInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "revoked",
      updatedBy: input.actor.id,
    },
  });
}

export async function acceptProjectInvitation(input: {
  token: string;
  supabaseUser: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  };
}): Promise<InvitationAcceptResult> {
  const token = input.token.trim();
  if (!token) {
    throw badRequest("Invitation token is required", "INVITATION_TOKEN_REQUIRED");
  }

  const email = normalizeEmail(input.supabaseUser.email ?? "");
  if (!email) {
    throw forbidden("Authenticated email is required", "INVITATION_EMAIL_REQUIRED");
  }

  const invitation = await prisma.projectInvitation.findUnique({
    where: { tokenHash: invitationTokenHash(token) },
  });

  if (!invitation) {
    throw notFound("Invitation not found", "INVITATION_NOT_FOUND");
  }

  if (invitation.status !== "pending") {
    throw forbidden("Invitation is not pending", "INVITATION_NOT_PENDING");
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    throw forbidden("Invitation has expired", "INVITATION_EXPIRED");
  }

  if (normalizeEmail(invitation.email) !== email) {
    throw forbidden("Invitation email does not match the signed-in user", "INVITATION_EMAIL_MISMATCH");
  }

  if (!isAssignableProjectRole(invitation.role)) {
    throw forbidden("Invitation role is no longer assignable", "INVITATION_ROLE_INVALID");
  }

  await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.upsert({
      where: { id: input.supabaseUser.id },
      update: {
        email,
        displayName: displayNameFromSupabaseUser({
          email,
          userMetadata: input.supabaseUser.user_metadata,
        }),
        accessStatus: "active",
      },
      create: {
        id: input.supabaseUser.id,
        email,
        displayName: displayNameFromSupabaseUser({
          email,
          userMetadata: input.supabaseUser.user_metadata,
        }),
        role: "member",
        accessStatus: "active",
      },
    });

    await tx.projectMembership.upsert({
      where: {
        projectId_profileId: {
          projectId: invitation.projectId,
          profileId: profile.id,
        },
      },
      update: {
        role: invitation.role,
        displayName: profile.displayName,
        email: profile.email,
        updatedBy: profile.id,
      },
      create: {
        projectId: invitation.projectId,
        profileId: profile.id,
        role: invitation.role,
        displayName: profile.displayName,
        email: profile.email,
        createdBy: invitation.createdBy,
        updatedBy: profile.id,
      },
    });

    await tx.projectInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedByProfileId: profile.id,
        acceptedAt: new Date(),
        updatedBy: profile.id,
      },
    });
  });

  return {
    projectId: invitation.projectId,
    profileId: input.supabaseUser.id,
    role: invitation.role,
  };
}

export function redirectToInvitationLogin(requestUrl: URL, token: string): never {
  const nextPath = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const loginUrl = new URL("/api/auth/google", requestUrl);
  loginUrl.searchParams.set("next", nextPath);
  redirect(loginUrl.toString() as Route);
}
