import { NextResponse } from "next/server";
import type { ProjectMembershipRecord } from "@/domains/admin/types";
import { forbidden } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import {
  canGrantProjectManager,
  isAssignableProjectRole,
  normalizeProjectRoleForCapabilities,
  type RequestedProjectRole,
} from "@/lib/auth/project-capabilities";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listProjectMembers, replaceProjectMembers } from "@/use-cases/admin/admin-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const data = await listProjectMembers(projectId);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    const managerContext = await requireProjectManager(projectId, user);
    const body = (await request.json()) as {
      memberships?: Array<{
        profileId?: string;
        displayName?: string;
        email?: string;
        role?: RequestedProjectRole;
      }>;
    };
    const memberships = Array.isArray(body.memberships)
      ? body.memberships.map((membership) => ({
          profileId: String(membership.profileId ?? ""),
          displayName: String(membership.displayName ?? ""),
          email: String(membership.email ?? ""),
          role: isAssignableProjectRole(membership.role) ? membership.role : "editor",
        }))
      : [];

    validateManagerRoleMutation({
      actorGlobalRole: user.role,
      actorProjectRole: managerContext.membership?.role ?? null,
      existingMemberships: (await listProjectMembers(projectId)).members,
      nextMemberships: memberships,
    });

    const data = await replaceProjectMembers(
      projectId,
      memberships,
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function validateManagerRoleMutation(input: {
  actorGlobalRole: "admin" | "member";
  actorProjectRole: ProjectMembershipRecord["role"] | null;
  existingMemberships: ProjectMembershipRecord[];
  nextMemberships: Array<Pick<ProjectMembershipRecord, "profileId" | "displayName" | "email" | "role">>;
}) {
  if (
    canGrantProjectManager({
      globalRole: input.actorGlobalRole,
      projectRole: input.actorProjectRole,
    })
  ) {
    return;
  }

  const existingManagers = new Map(
    input.existingMemberships
      .filter((membership) => normalizeProjectRoleForCapabilities(membership.role) === "manager")
      .map((membership) => [membership.profileId, membership]),
  );

  for (const manager of existingManagers.values()) {
    const next = input.nextMemberships.find((membership) => membership.profileId === manager.profileId);
    if (!next || next.role !== "manager" || next.displayName !== manager.displayName || next.email !== manager.email) {
      throw forbidden("Only global admin can change project manager membership", "PROJECT_MANAGER_ROLE_ADMIN_REQUIRED");
    }
  }

  for (const membership of input.nextMemberships) {
    if (membership.role === "manager" && !existingManagers.has(membership.profileId)) {
      throw forbidden("Only global admin can grant project manager membership", "PROJECT_MANAGER_ROLE_ADMIN_REQUIRED");
    }
  }
}
