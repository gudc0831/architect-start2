import { backendMode } from "@/lib/backend-mode";
import { assertCreatableWorkTypeCode, resolveEffectiveWorkTypeDefinitions } from "@/domains/admin/work-type-policy";
import { badRequest, conflict, serviceUnavailable } from "@/lib/api/errors";
import { getProjectSessionProjectId } from "@/lib/project-session";
import { adminRepository } from "@/repositories/admin";
import { updateProject } from "@/use-cases/project-service";

function sanitizeName(value: string) {
  return value.trim();
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

export async function listProjectsForSession() {
  const selection = await adminRepository.getProjectSelection();
  const sessionProjectId = await getProjectSessionProjectId();
  const currentProjectId =
    (sessionProjectId && selection.availableProjects.some((project) => project.id === sessionProjectId)
      ? sessionProjectId
      : null) ??
    selection.currentProjectId ??
    selection.availableProjects[0]?.id ??
    null;

  return {
    currentProjectId,
    availableProjects: uniqueById(selection.availableProjects),
    source: selection.source,
  };
}

export async function selectProjectForSession(projectId: string) {
  const normalizedProjectId = projectId.trim();

  if (!normalizedProjectId) {
    throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
  }

  const selection = await adminRepository.setCurrentProject(normalizedProjectId);

  return {
    currentProjectId: selection.currentProjectId,
    availableProjects: uniqueById(selection.availableProjects),
    source: selection.source,
  };
}

export async function getCurrentProjectForSession() {
  const selection = await listProjectsForSession();
  const currentProject =
    selection.availableProjects.find((project) => project.id === selection.currentProjectId) ?? selection.availableProjects[0] ?? null;

  if (!currentProject) {
    throw serviceUnavailable("No project is configured", "PROJECT_MISSING");
  }

  return {
    id: currentProject.id,
    name: currentProject.name,
    source: currentProject.source,
    currentProjectId: currentProject.id,
    availableProjects: selection.availableProjects,
  };
}

export async function renameCurrentProjectForSession(projectId: string, name: string, userId: string | null) {
  const normalizedProjectId = projectId.trim();
  const normalizedName = sanitizeName(name);

  if (!normalizedProjectId) {
    throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
  }

  if (!normalizedName) {
    throw badRequest("project name is required", "PROJECT_NAME_REQUIRED");
  }

  const selectedProject = await adminRepository.getProjectById(normalizedProjectId);

  if (!selectedProject) {
    throw conflict("Selected project no longer exists", "PROJECT_SELECTION_STALE");
  }

  if (backendMode === "local") {
    await adminRepository.setCurrentProject(normalizedProjectId);
    const updatedProject = await updateProject(normalizedName, userId);
    await adminRepository.updateProject(normalizedProjectId, {
      name: updatedProject.name,
      updatedBy: userId,
    });

    return {
      id: selectedProject.id,
      name: updatedProject.name,
      source: updatedProject.source,
      currentProjectId: selectedProject.id,
    };
  }

  if (backendMode === "cloud") {
    throw serviceUnavailable(
      "Cloud project rename is blocked until selected-project task syncing is wired through task repositories.",
      "PROJECT_RENAME_INTEGRATION_PENDING",
    );
  }

  const updatedProject = await adminRepository.updateProject(normalizedProjectId, {
    name: normalizedName,
    updatedBy: userId,
  });

  return {
    id: updatedProject.id,
    name: updatedProject.name,
    source: updatedProject.source,
    currentProjectId: updatedProject.id,
  };
}

export async function listAdminProjects() {
  return listProjectsForSession();
}

export async function createAdminProject(name: string, userId: string | null) {
  return adminRepository.createProject({
    name: sanitizeName(name),
    createdBy: userId,
  });
}

export async function updateAdminProject(projectId: string, name: string, userId: string | null) {
  return adminRepository.updateProject(projectId.trim(), {
    name: sanitizeName(name),
    updatedBy: userId,
  });
}

export async function listProjectMembers(projectId: string) {
  const normalizedProjectId = projectId.trim();
  const [members, availableProfiles] = await Promise.all([
    adminRepository.listProjectMemberships(normalizedProjectId),
    adminRepository.listProfiles(),
  ]);

  return {
    projectId: normalizedProjectId,
    members,
    availableProfiles,
  };
}

export async function replaceProjectMembers(
  projectId: string,
  memberships: {
    profileId: string;
    displayName: string;
    email: string;
    role: "manager" | "member";
  }[],
  userId: string | null,
) {
  return adminRepository.replaceProjectMemberships({
    projectId: projectId.trim(),
    memberships: memberships
      .map((membership) => ({
        profileId: membership.profileId.trim(),
        displayName: membership.displayName.trim(),
        email: membership.email.trim(),
        role: membership.role,
      }))
      .filter((membership) => membership.profileId && membership.displayName),
    actorId: userId,
  });
}

export async function listGlobalWorkTypes() {
  return adminRepository.listGlobalWorkTypeDefinitions();
}

export async function listEffectiveWorkTypesForSession() {
  const selection = await listProjectsForSession();
  const currentProjectId = selection.currentProjectId ?? null;
  const [globalDefinitions, projectDefinitions] = await Promise.all([
    adminRepository.listGlobalWorkTypeDefinitions(),
    currentProjectId ? adminRepository.listProjectWorkTypeDefinitions(currentProjectId) : Promise.resolve([]),
  ]);
  const resolved = resolveEffectiveWorkTypeDefinitions([...globalDefinitions, ...projectDefinitions], currentProjectId);

  return {
    currentProjectId,
    definitions: resolved.selectableDefinitions,
    displayDefinitions: resolved.displayDefinitions,
  };
}

export async function createGlobalWorkType(
  input: { code: string; labelKo: string; labelEn: string; sortOrder?: number; isSystem?: boolean },
  userId: string | null,
) {
  const existingDefinitions = [
    ...(await adminRepository.listGlobalWorkTypeDefinitions()),
    ...(await Promise.all((await adminRepository.listProjects()).map((project) => adminRepository.listProjectWorkTypeDefinitions(project.id)))).flat(),
  ];

  return adminRepository.createWorkTypeDefinition({
    projectId: null,
    code: assertCreatableWorkTypeCode(existingDefinitions, null, input.code),
    labelKo: input.labelKo.trim(),
    labelEn: input.labelEn.trim(),
    sortOrder: input.sortOrder ?? 0,
    isSystem: input.isSystem ?? false,
    actorId: userId,
  });
}

export async function listProjectWorkTypes(projectId: string) {
  return adminRepository.listProjectWorkTypeDefinitions(projectId.trim());
}

export async function createProjectWorkType(
  projectId: string,
  input: { code: string; labelKo: string; labelEn: string; sortOrder?: number },
  userId: string | null,
) {
  const normalizedProjectId = projectId.trim();
  const existingDefinitions = [
    ...(await adminRepository.listGlobalWorkTypeDefinitions()),
    ...(await adminRepository.listProjectWorkTypeDefinitions(normalizedProjectId)),
  ];

  return adminRepository.createWorkTypeDefinition({
    projectId: normalizedProjectId,
    code: assertCreatableWorkTypeCode(existingDefinitions, normalizedProjectId, input.code),
    labelKo: input.labelKo.trim(),
    labelEn: input.labelEn.trim(),
    sortOrder: input.sortOrder ?? 0,
    isSystem: false,
    actorId: userId,
  });
}

export async function updateAdminWorkType(
  id: string,
  input: { labelKo?: string; labelEn?: string; sortOrder?: number; isActive?: boolean },
  userId: string | null,
) {
  return adminRepository.updateWorkTypeDefinition(id.trim(), {
    labelKo: input.labelKo?.trim(),
    labelEn: input.labelEn?.trim(),
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedBy: userId,
  });
}
