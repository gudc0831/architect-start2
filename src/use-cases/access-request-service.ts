import type { AuthUser } from "@/domains/auth/types";
import type { RequestedProjectRole } from "@/lib/auth/project-capabilities";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { canApproveAccessRequest, isAssignableProjectRole } from "@/lib/auth/project-capabilities";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";

function normalizeOptionalProjectId(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

export async function submitAccessRequest(input: {
  actor: AuthUser;
  message?: string;
  requestedRole?: unknown;
  projectId?: unknown;
}) {
  const projectId = normalizeOptionalProjectId(input.projectId);
  if (projectId) {
    throw forbidden("Project-specific access requests require an invitation or access link", "PROJECT_ACCESS_LINK_REQUIRED");
  }

  const requestedRole = isAssignableProjectRole(input.requestedRole) ? input.requestedRole : "viewer";
  if (requestedRole === "manager") {
    throw forbidden("Manager access cannot be self-requested", "ACCESS_REQUEST_MANAGER_FORBIDDEN");
  }

  return prisma.accessRequest.create({
    data: {
      profileId: input.actor.id,
      email: input.actor.email,
      message: input.message?.trim() || null,
      requestedRole,
      projectId: null,
    },
  });
}

export async function listAccessRequests(input: { actor: AuthUser; projectId?: string | null }) {
  if (input.actor.role === "admin" && !input.projectId) {
    return prisma.accessRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
  }

  const projectId = normalizeOptionalProjectId(input.projectId);
  if (!projectId) {
    throw forbidden("Project manager access is required", "PROJECT_MANAGER_REQUIRED");
  }

  if (input.actor.role !== "admin") {
    await requireProjectManager(projectId, input.actor);
  }

  return prisma.accessRequest.findMany({
    where: {
      OR: [
        { projectId },
        { projectId: null, status: "pending" },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function reviewAccessRequest(input: {
  actor: AuthUser;
  requestId: string;
  action: "approve" | "reject";
  projectId?: unknown;
  role?: unknown;
}) {
  const request = await prisma.accessRequest.findUnique({
    where: { id: input.requestId },
    include: { profile: true },
  });

  if (!request) {
    throw notFound("Access request not found", "ACCESS_REQUEST_NOT_FOUND");
  }

  if (request.status !== "pending") {
    throw forbidden("Access request is not pending", "ACCESS_REQUEST_NOT_PENDING");
  }

  if (input.action === "reject") {
    return prisma.accessRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        reviewedBy: input.actor.id,
        reviewedAt: new Date(),
      },
    });
  }

  const projectId = normalizeOptionalProjectId(input.projectId) ?? request.projectId;
  if (!projectId) {
    throw badRequest("projectId is required to approve access", "PROJECT_ID_REQUIRED");
  }

  const role = resolveApprovedRole(input.role, request.requestedRole);
  const managerContext = input.actor.role === "admin" ? null : await requireProjectManager(projectId, input.actor);

  if (
    !canApproveAccessRequest({
      globalRole: input.actor.role,
      projectRole: managerContext?.membership?.role ?? null,
      requestedRole: role,
    })
  ) {
    throw forbidden("You cannot approve this project role", "ACCESS_REQUEST_ROLE_FORBIDDEN");
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: request.profileId },
      data: { accessStatus: "active" },
    });

    await tx.projectMembership.upsert({
      where: {
        projectId_profileId: {
          projectId,
          profileId: request.profileId,
        },
      },
      update: {
        role,
        displayName: request.profile.displayName,
        email: request.profile.email,
        updatedBy: input.actor.id,
      },
      create: {
        projectId,
        profileId: request.profileId,
        role,
        displayName: request.profile.displayName,
        email: request.profile.email,
        createdBy: input.actor.id,
        updatedBy: input.actor.id,
      },
    });

    await tx.accessRequest.update({
      where: { id: request.id },
      data: {
        projectId,
        requestedRole: role,
        status: "approved",
        reviewedBy: input.actor.id,
        reviewedAt: new Date(),
      },
    });
  });

  return prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
}

function resolveApprovedRole(value: unknown, fallback: string): RequestedProjectRole {
  if (isAssignableProjectRole(value)) {
    return value;
  }

  if (isAssignableProjectRole(fallback)) {
    return fallback;
  }

  return "viewer";
}
