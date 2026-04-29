import type { AuthUser } from "@/domains/auth/types";
import type { ProjectMembershipRecord, ProjectSummary } from "@/domains/admin/types";
import { forbidden, notFound, serviceUnavailable } from "@/lib/api/errors";
import { canManageProjectMembers, canReadProject } from "@/lib/auth/project-capabilities";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectSessionProjectId } from "@/lib/project-session";
import { adminRepository } from "@/repositories/admin";

type ProjectGuardContext = {
  user: AuthUser;
  project: ProjectSummary;
  membership: ProjectMembershipRecord | null;
};

async function resolveUser(user?: AuthUser) {
  return user ?? (await requireUser());
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

async function listAvailableProjectsForUser(user: AuthUser) {
  if (user.role === "admin") {
    return adminRepository.listProjects();
  }

  return adminRepository.listProjectsForProfile(user.id);
}

export async function requireProjectAccess(projectId: string, user?: AuthUser): Promise<ProjectGuardContext> {
  const resolvedUser = await resolveUser(user);
  const project = await adminRepository.getProjectById(projectId);

  if (!project) {
    throw notFound("Project not found", "PROJECT_NOT_FOUND");
  }

  if (resolvedUser.role === "admin") {
    return {
      user: resolvedUser,
      project,
      membership: null,
    };
  }

  const membership = await adminRepository.getProjectMembership(project.id, resolvedUser.id);
  if (
    !canReadProject({
      globalRole: resolvedUser.role,
      projectRole: membership?.role ?? null,
    })
  ) {
    throw notFound("Project not found", "PROJECT_NOT_FOUND");
  }

  return {
    user: resolvedUser,
    project,
    membership,
  };
}

export async function requireCurrentProjectAccess(user?: AuthUser): Promise<ProjectGuardContext> {
  const resolvedUser = await resolveUser(user);
  const [selection, sessionProjectId, availableProjects] = await Promise.all([
    adminRepository.getProjectSelection(),
    getProjectSessionProjectId(),
    listAvailableProjectsForUser(resolvedUser),
  ]);
  const uniqueProjects = uniqueById(availableProjects);
  const currentProjectId =
    (sessionProjectId && uniqueProjects.some((project) => project.id === sessionProjectId) ? sessionProjectId : null) ??
    (selection.currentProjectId && uniqueProjects.some((project) => project.id === selection.currentProjectId)
      ? selection.currentProjectId
      : null) ??
    uniqueProjects[0]?.id ??
    null;

  if (!currentProjectId) {
    if (resolvedUser.role === "admin") {
      throw serviceUnavailable("No project is configured", "PROJECT_MISSING");
    }

    throw forbidden("Project access has not been provisioned.", "PROJECT_ACCESS_DENIED");
  }

  return requireProjectAccess(currentProjectId, resolvedUser);
}

export async function requireProjectManager(projectId: string, user?: AuthUser): Promise<ProjectGuardContext> {
  const context = await requireProjectAccess(projectId, user);

  if (
    !canManageProjectMembers({
      globalRole: context.user.role,
      projectRole: context.membership?.role ?? null,
    })
  ) {
    throw forbidden("Project manager access is required", "PROJECT_MANAGER_REQUIRED");
  }

  return context;
}
