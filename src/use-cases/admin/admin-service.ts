import { requireOwnerDiscipline } from "@/domains/admin/foundation-settings";
import type { AuthUser } from "@/domains/auth/types";
import {
  assertCreatableTaskCategoryCode,
  isTaskCategoryFieldKey,
  resolveEffectiveTaskCategoryDefinitions,
  taskCategoryFieldKeys,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { assertCreatableWorkTypeCode } from "@/domains/admin/work-type-policy";
import { badRequest, forbidden, serviceUnavailable } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";
import { requireCurrentProjectAccess, requireProjectAccess, requireProjectManager } from "@/lib/auth/project-guards";
import { getProjectSessionProjectId } from "@/lib/project-session";
import { taskRepository } from "@/repositories";
import { adminRepository } from "@/repositories/admin";

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

async function resolveSessionUser(user?: AuthUser) {
  return user ?? (await requireUser());
}

async function listAvailableProjectsForUser(user: AuthUser) {
  if (user.role === "admin") {
    return adminRepository.listProjects();
  }

  return adminRepository.listProjectsForProfile(user.id);
}

async function buildEffectiveTaskCategoriesByField(currentProjectId: string | null) {
  const definitions = await Promise.all(
    taskCategoryFieldKeys.map(async (fieldKey) => {
      const [globalDefinitions, projectDefinitions] = await Promise.all([
        adminRepository.listGlobalTaskCategoryDefinitions(fieldKey),
        currentProjectId ? adminRepository.listProjectTaskCategoryDefinitions(currentProjectId, fieldKey) : Promise.resolve([]),
      ]);
      const resolved = resolveEffectiveTaskCategoryDefinitions([...globalDefinitions, ...projectDefinitions], fieldKey, currentProjectId);
      return [fieldKey, resolved] as const;
    }),
  );

  return Object.fromEntries(
    definitions.map(([fieldKey, resolved]) => [
      fieldKey,
      {
        definitions: resolved.selectableDefinitions,
        displayDefinitions: resolved.displayDefinitions,
      },
    ]),
  ) as Record<
    TaskCategoryFieldKey,
    {
      definitions: Awaited<ReturnType<typeof adminRepository.listGlobalTaskCategoryDefinitions>>;
      displayDefinitions: Awaited<ReturnType<typeof adminRepository.listGlobalTaskCategoryDefinitions>>;
    }
  >;
}

export async function listProjectsForSession(user?: AuthUser) {
  const resolvedUser = await resolveSessionUser(user);
  const selection = await adminRepository.getProjectSelection();
  const availableProjects = uniqueById(await listAvailableProjectsForUser(resolvedUser));
  const sessionProjectId = await getProjectSessionProjectId();
  const currentProjectId =
    (sessionProjectId && availableProjects.some((project) => project.id === sessionProjectId)
      ? sessionProjectId
      : null) ??
    (selection.currentProjectId && availableProjects.some((project) => project.id === selection.currentProjectId)
      ? selection.currentProjectId
      : null) ??
    availableProjects[0]?.id ??
    null;

  return {
    currentProjectId,
    availableProjects,
    source: selection.source,
  };
}

export async function selectProjectForSession(projectId: string, user?: AuthUser) {
  const normalizedProjectId = projectId.trim();

  if (!normalizedProjectId) {
    throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
  }

  const resolvedUser = await resolveSessionUser(user);
  const access = await requireProjectAccess(normalizedProjectId, resolvedUser);
  const selection = await listProjectsForSession(resolvedUser);

  await adminRepository.setCurrentProject(normalizedProjectId);

  return {
    currentProjectId: access.project.id,
    availableProjects: selection.availableProjects,
    source: selection.source,
  };
}

export async function getCurrentProjectForSession(user?: AuthUser) {
  const resolvedUser = await resolveSessionUser(user);
  const selection = await listProjectsForSession(resolvedUser);
  const currentProject =
    selection.availableProjects.find((project) => project.id === selection.currentProjectId) ?? selection.availableProjects[0] ?? null;

  if (!currentProject) {
    if (resolvedUser.role !== "admin") {
      throw forbidden("Project access has not been provisioned.", "PROJECT_ACCESS_DENIED");
    }

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

export async function renameCurrentProjectForSession(projectId: string, name: string, user: AuthUser) {
  const normalizedProjectId = projectId.trim();
  const normalizedName = sanitizeName(name);

  if (!normalizedProjectId) {
    throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
  }

  if (!normalizedName) {
    throw badRequest("project name is required", "PROJECT_NAME_REQUIRED");
  }

  const managerContext = await requireProjectManager(normalizedProjectId, user);
  const selectedProject = managerContext.project;

  const updatedProject = await adminRepository.updateProject(normalizedProjectId, {
    name: normalizedName,
    updatedBy: user.id,
  });

  try {
    await taskRepository.syncProjectTaskIssueIds(updatedProject.id, updatedProject.name, user.id);
  } catch (error) {
    if (selectedProject.name !== updatedProject.name) {
      await adminRepository.updateProject(normalizedProjectId, {
        name: selectedProject.name,
        updatedBy: user.id,
      });
      await taskRepository.syncProjectTaskIssueIds(selectedProject.id, selectedProject.name, user.id);
    }

    throw error;
  }

  return {
    id: updatedProject.id,
    name: updatedProject.name,
    source: updatedProject.source,
    currentProjectId: updatedProject.id,
  };
}

export async function listAdminProjects(user?: AuthUser) {
  return listProjectsForSession(user);
}

export async function createAdminProject(name: string, userId: string | null) {
  return adminRepository.createProject({
    name: sanitizeName(name),
    createdBy: userId,
  });
}

export async function getAdminFoundationSettings() {
  return adminRepository.getFoundationSettings();
}

export async function updateAdminFoundationSettings(
  input: { ownerDiscipline: string },
  userId: string | null,
) {
  return adminRepository.updateFoundationSettings({
    ownerDiscipline: requireOwnerDiscipline(input.ownerDiscipline),
    updatedBy: userId,
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

export async function listCurrentProjectMembersForSession(user?: AuthUser) {
  const resolvedUser = await resolveSessionUser(user);
  const context = await requireCurrentProjectAccess(resolvedUser);
  const members = await adminRepository.listProjectMemberships(context.project.id);

  return {
    currentProjectId: context.project.id,
    members,
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

export async function listGlobalTaskCategories(fieldKey: TaskCategoryFieldKey) {
  return adminRepository.listGlobalTaskCategoryDefinitions(fieldKey);
}

export async function listEffectiveWorkTypesForSession(user?: AuthUser) {
  const selection = await listProjectsForSession(user);
  const currentProjectId = selection.currentProjectId ?? null;
  const byField = await buildEffectiveTaskCategoriesByField(currentProjectId);

  return {
    currentProjectId,
    definitions: byField.workType.definitions,
    displayDefinitions: byField.workType.displayDefinitions,
  };
}

export async function listEffectiveTaskCategoriesForSession(user?: AuthUser) {
  const selection = await listProjectsForSession(user);
  return listEffectiveTaskCategoriesForProject(selection.currentProjectId ?? null);
}

export async function listEffectiveTaskCategoriesForProject(currentProjectId: string | null) {
  return {
    currentProjectId,
    byField: await buildEffectiveTaskCategoriesByField(currentProjectId),
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

export async function createGlobalTaskCategory(
  fieldKey: TaskCategoryFieldKey,
  input: { code: string; labelKo: string; labelEn: string; sortOrder?: number; isSystem?: boolean },
  userId: string | null,
) {
  if (!isTaskCategoryFieldKey(fieldKey)) {
    throw badRequest("fieldKey is invalid", "TASK_CATEGORY_FIELD_INVALID");
  }

  const existingDefinitions = [
    ...(await adminRepository.listGlobalTaskCategoryDefinitions(fieldKey)),
    ...(await Promise.all(
      (await adminRepository.listProjects()).map((project) => adminRepository.listProjectTaskCategoryDefinitions(project.id, fieldKey)),
    )).flat(),
  ];

  return adminRepository.createTaskCategoryDefinition({
    fieldKey,
    projectId: null,
    code: assertCreatableTaskCategoryCode(existingDefinitions, fieldKey, null, input.code),
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

export async function listProjectTaskCategories(projectId: string, fieldKey: TaskCategoryFieldKey) {
  if (!isTaskCategoryFieldKey(fieldKey)) {
    throw badRequest("fieldKey is invalid", "TASK_CATEGORY_FIELD_INVALID");
  }

  return adminRepository.listProjectTaskCategoryDefinitions(projectId.trim(), fieldKey);
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

export async function createProjectTaskCategory(
  projectId: string,
  fieldKey: TaskCategoryFieldKey,
  input: { code: string; labelKo: string; labelEn: string; sortOrder?: number },
  userId: string | null,
) {
  if (!isTaskCategoryFieldKey(fieldKey)) {
    throw badRequest("fieldKey is invalid", "TASK_CATEGORY_FIELD_INVALID");
  }

  const normalizedProjectId = projectId.trim();
  const existingDefinitions = [
    ...(await adminRepository.listGlobalTaskCategoryDefinitions(fieldKey)),
    ...(await adminRepository.listProjectTaskCategoryDefinitions(normalizedProjectId, fieldKey)),
  ];

  return adminRepository.createTaskCategoryDefinition({
    fieldKey,
    projectId: normalizedProjectId,
    code: assertCreatableTaskCategoryCode(existingDefinitions, fieldKey, normalizedProjectId, input.code),
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

export async function updateAdminTaskCategory(
  id: string,
  input: { labelKo?: string; labelEn?: string; sortOrder?: number; isActive?: boolean },
  userId: string | null,
) {
  return adminRepository.updateTaskCategoryDefinition(id.trim(), {
    labelKo: input.labelKo?.trim(),
    labelEn: input.labelEn?.trim(),
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedBy: userId,
  });
}
