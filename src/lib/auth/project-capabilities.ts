import type { ProjectMembershipRole } from "@/domains/admin/types";
import type { AuthRole } from "@/domains/auth/types";

export type GlobalRole = AuthRole;
export type ProjectRole = ProjectMembershipRole;
export type RequestedProjectRole = Exclude<ProjectRole, "member">;

type ProjectCapabilityInput = {
  globalRole: GlobalRole;
  projectRole: ProjectRole | null;
};

export const projectRoles = ["viewer", "editor", "manager", "member"] as const satisfies readonly ProjectRole[];
export const assignableProjectRoles = ["viewer", "editor", "manager"] as const satisfies readonly RequestedProjectRole[];

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && projectRoles.includes(value as ProjectRole);
}

export function isAssignableProjectRole(value: unknown): value is RequestedProjectRole {
  return typeof value === "string" && assignableProjectRoles.includes(value as RequestedProjectRole);
}

export function normalizeProjectRoleForCapabilities(role: ProjectRole | null): RequestedProjectRole | null {
  if (role === "member") {
    return "editor";
  }

  return role;
}

function isGlobalAdmin(input: ProjectCapabilityInput) {
  return input.globalRole === "admin";
}

function normalizedProjectRole(input: ProjectCapabilityInput) {
  return normalizeProjectRoleForCapabilities(input.projectRole);
}

export function canReadProject(input: ProjectCapabilityInput): boolean {
  return isGlobalAdmin(input) || normalizedProjectRole(input) !== null;
}

export function canViewProjectMembers(input: ProjectCapabilityInput): boolean {
  return canReadProject(input);
}

export function canEditProjectWorkspace(input: ProjectCapabilityInput): boolean {
  const role = normalizedProjectRole(input);
  return isGlobalAdmin(input) || role === "editor" || role === "manager";
}

export function canManageProjectMembers(input: ProjectCapabilityInput): boolean {
  return isGlobalAdmin(input) || normalizedProjectRole(input) === "manager";
}

export function canManageProjectSettings(input: ProjectCapabilityInput): boolean {
  return canManageProjectMembers(input);
}

export function canInviteProjectRole(
  input: ProjectCapabilityInput & { requestedRole: RequestedProjectRole },
): boolean {
  if (isGlobalAdmin(input)) {
    return true;
  }

  return normalizedProjectRole(input) === "manager" && input.requestedRole !== "manager";
}

export function canApproveAccessRequest(
  input: ProjectCapabilityInput & { requestedRole: RequestedProjectRole },
): boolean {
  return canInviteProjectRole(input);
}

export function canGrantProjectManager(input: ProjectCapabilityInput): boolean {
  return isGlobalAdmin(input);
}
