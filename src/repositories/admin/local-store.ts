import { randomUUID } from "node:crypto";
import {
  DEFAULT_OWNER_DISCIPLINE,
  normalizeAdminFoundationSettings,
  requireOwnerDiscipline,
  type AdminFoundationSettings,
} from "@/domains/admin/foundation-settings";
import {
  assertCreatableTaskCategoryCode,
  isTaskCategoryFieldKey,
  resolveEffectiveTaskCategoryDefinitions,
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { requireAdminStoredWorkTypeCode } from "@/domains/admin/work-type-policy";
import type { AdminProfileSummary, AdminStoreRecord, ProjectMembershipRecord, ProjectSelectionRecord, ProjectSummary } from "@/domains/admin/types";
import { buildSystemWorkTypeDefinitions, type WorkTypeDefinition } from "@/domains/task/work-types";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { getAuthFallbackUser } from "@/lib/auth/auth-config";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import { defaultProjectName } from "@/lib/runtime-config";
import type {
  AdminRepository,
  CreateAdminProjectInput,
  CreateTaskCategoryDefinitionInput,
  CreateWorkTypeDefinitionInput,
  ReplaceProjectMembershipsInput,
  UpdateAdminFoundationSettingsInput,
  UpdateTaskCategoryDefinitionInput,
  UpdateAdminProjectInput,
  UpdateWorkTypeDefinitionInput,
} from "@/repositories/admin/contracts";

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value: string) {
  return value.trim();
}

function compareBySortOrder<T extends { sortOrder: number; createdAt: string }>(left: T, right: T) {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt);
}

function normalizeTaskCategoryDefinition(definition: Partial<TaskCategoryDefinition>): TaskCategoryDefinition | null {
  if (typeof definition.id !== "string" || !definition.id.trim()) {
    return null;
  }

  return {
    id: definition.id,
    fieldKey: isTaskCategoryFieldKey(definition.fieldKey) ? definition.fieldKey : "workType",
    projectId: definition.projectId ?? null,
    code: typeof definition.code === "string" ? definition.code : "",
    labelKo: typeof definition.labelKo === "string" ? definition.labelKo : "",
    labelEn: typeof definition.labelEn === "string" ? definition.labelEn : "",
    isSystem: Boolean(definition.isSystem),
    isActive: definition.isActive ?? true,
    sortOrder: Number.isFinite(definition.sortOrder) ? Number(definition.sortOrder) : 0,
    createdAt: typeof definition.createdAt === "string" && definition.createdAt ? definition.createdAt : nowIso(),
    updatedAt: typeof definition.updatedAt === "string" && definition.updatedAt ? definition.updatedAt : nowIso(),
    createdBy: definition.createdBy ?? null,
    updatedBy: definition.updatedBy ?? null,
  };
}

async function readProjectFallback(): Promise<ProjectSummary> {
  const project = (await readLocalStore<Partial<ProjectSummary>>("project", {})).value;
  const timestamp = nowIso();

  return {
    id: typeof project.id === "string" && project.id.trim() ? project.id.trim() : "project-local",
    name: typeof project.name === "string" && project.name.trim() ? project.name.trim() : defaultProjectName,
    createdAt: typeof project.createdAt === "string" && project.createdAt.trim() ? project.createdAt : timestamp,
    updatedAt: typeof project.updatedAt === "string" && project.updatedAt.trim() ? project.updatedAt : timestamp,
    source: "local-file",
    createdBy: project.createdBy ?? null,
    updatedBy: project.updatedBy ?? null,
  };
}

function createDefaultStore(project: ProjectSummary): AdminStoreRecord {
  const fallbackUser = getAuthFallbackUser();
  const timestamp = nowIso();

  return {
    version: 1,
    selectedProjectId: project.id,
    projects: [project],
    memberships: [
      {
        id: `membership:${project.id}:${fallbackUser.id}`,
        projectId: project.id,
        profileId: fallbackUser.id,
        role: "manager",
        displayName: fallbackUser.displayName,
        email: fallbackUser.email,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: fallbackUser.id,
        updatedBy: fallbackUser.id,
      },
    ],
    foundationSettings: {
      ownerDiscipline: DEFAULT_OWNER_DISCIPLINE,
    },
    categoryDefinitions: buildSystemWorkTypeDefinitions({
      now: timestamp,
      createdBy: fallbackUser.id,
      updatedBy: fallbackUser.id,
    }),
  };
}

async function readStore(): Promise<AdminStoreRecord> {
  const fallbackProject = await readProjectFallback();
  const parsed = (await readLocalStore<Partial<AdminStoreRecord>>("admin", {})).value;
  const defaults = createDefaultStore(fallbackProject);

  const projects = Array.isArray(parsed.projects)
    ? parsed.projects
        .filter((project): project is ProjectSummary => Boolean(project) && typeof project.id === "string")
        .map((project) => ({
          ...fallbackProject,
          ...project,
          name: sanitizeText(project.name ?? "") || fallbackProject.name,
          source: "local-file" as const,
          createdBy: project.createdBy ?? null,
          updatedBy: project.updatedBy ?? null,
        }))
    : defaults.projects;

  const existingFallbackProjectIndex = projects.findIndex((project) => project.id === fallbackProject.id);
  if (existingFallbackProjectIndex >= 0) {
    projects[existingFallbackProjectIndex] = {
      ...projects[existingFallbackProjectIndex],
      name: fallbackProject.name,
      updatedAt: fallbackProject.updatedAt,
    };
  } else {
    projects.unshift(fallbackProject);
  }

  const memberships = Array.isArray(parsed.memberships)
    ? parsed.memberships
        .filter((membership): membership is ProjectMembershipRecord => Boolean(membership) && typeof membership.id === "string")
        .map((membership) => ({
          ...membership,
          createdBy: membership.createdBy ?? null,
          updatedBy: membership.updatedBy ?? null,
        }))
    : defaults.memberships;

  const rawCategoryDefinitions = Array.isArray(parsed.categoryDefinitions)
    ? parsed.categoryDefinitions
    : Array.isArray(parsed.workTypeDefinitions)
      ? parsed.workTypeDefinitions.map((definition) => ({ ...definition, fieldKey: "workType" as const }))
      : defaults.categoryDefinitions;
  const categoryDefinitions = rawCategoryDefinitions
    .map((definition) => normalizeTaskCategoryDefinition(definition))
    .filter((definition): definition is TaskCategoryDefinition => Boolean(definition));

  const ensuredGlobalDefinitions = categoryDefinitions.some(
    (definition) => definition.fieldKey === "workType" && definition.projectId === null,
  )
    ? categoryDefinitions
    : [
        ...defaults.categoryDefinitions,
        ...categoryDefinitions.filter(
          (definition) => !(definition.fieldKey === "workType" && definition.projectId === null),
        ),
      ];

  return {
    version: 1,
    selectedProjectId:
      typeof parsed.selectedProjectId === "string" && projects.some((project) => project.id === parsed.selectedProjectId)
        ? parsed.selectedProjectId
        : projects[0]?.id ?? null,
    projects,
    memberships,
    foundationSettings: normalizeAdminFoundationSettings(parsed.foundationSettings),
    categoryDefinitions: ensuredGlobalDefinitions,
  };
}

async function writeStore(next: AdminStoreRecord, reason: string) {
  await writeLocalStore("admin", next, { reason });
}

async function syncLegacyProjectMeta(project: ProjectSummary) {
  await writeLocalStore(
    "project",
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      source: "local-file",
    },
    { reason: "project.selection.sync" },
  );
}

function buildSelection(projects: ProjectSummary[], currentProjectId: string | null): ProjectSelectionRecord {
  return {
    currentProjectId,
    availableProjects: [...projects].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    source: "local-file",
  };
}

export class LocalAdminRepository implements AdminRepository {
  async getProjectSelection() {
    const store = await readStore();
    const currentProjectId =
      store.selectedProjectId && store.projects.some((project) => project.id === store.selectedProjectId)
        ? store.selectedProjectId
        : store.projects[0]?.id ?? null;

    return buildSelection(store.projects, currentProjectId);
  }

  async setCurrentProject(projectId: string) {
    const store = await readStore();
    const project = store.projects.find((entry) => entry.id === projectId);

    if (!project) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    const nextStore = {
      ...store,
      selectedProjectId: project.id,
    };

    await writeStore(nextStore, "admin.project.select");
    await syncLegacyProjectMeta(project);

    return buildSelection(nextStore.projects, project.id);
  }

  async listProjects() {
    return (await readStore()).projects;
  }

  async getProjectById(projectId: string) {
    return (await readStore()).projects.find((project) => project.id === projectId) ?? null;
  }

  async createProject(input: CreateAdminProjectInput) {
    const store = await readStore();
    const name = sanitizeText(input.name);

    if (!name) {
      throw badRequest("Project name is required", "PROJECT_NAME_REQUIRED");
    }

    if (store.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
      throw conflict("Project name already exists", "PROJECT_NAME_CONFLICT");
    }

    const timestamp = nowIso();
    const project: ProjectSummary = {
      id: randomUUID(),
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "local-file",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };
    const fallbackUser = getAuthFallbackUser();
    const creatorMembership =
      input.createdBy === fallbackUser.id
        ? [
            {
              id: `membership:${project.id}:${fallbackUser.id}`,
              projectId: project.id,
              profileId: fallbackUser.id,
              role: "manager" as const,
              displayName: fallbackUser.displayName,
              email: fallbackUser.email,
              createdAt: timestamp,
              updatedAt: timestamp,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            },
          ]
        : [];

    await writeStore(
      {
        ...store,
        selectedProjectId: store.selectedProjectId ?? project.id,
        projects: [...store.projects, project],
        memberships: [...store.memberships, ...creatorMembership],
      },
      "admin.project.create",
    );

    return project;
  }

  async updateProject(projectId: string, input: UpdateAdminProjectInput) {
    const store = await readStore();
    const current = store.projects.find((project) => project.id === projectId);
    const name = sanitizeText(input.name);

    if (!current) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    if (!name) {
      throw badRequest("Project name is required", "PROJECT_NAME_REQUIRED");
    }

    if (store.projects.some((project) => project.id !== projectId && project.name.toLowerCase() === name.toLowerCase())) {
      throw conflict("Project name already exists", "PROJECT_NAME_CONFLICT");
    }

    const updatedProject: ProjectSummary = {
      ...current,
      name,
      updatedAt: nowIso(),
      updatedBy: input.updatedBy,
    };

    await writeStore(
      {
        ...store,
        projects: store.projects.map((project) => (project.id === projectId ? updatedProject : project)),
      },
      "admin.project.update",
    );

    if (store.selectedProjectId === projectId) {
      await syncLegacyProjectMeta(updatedProject);
    }

    return updatedProject;
  }

  async listProfiles() {
    const fallbackUser = getAuthFallbackUser();
    const store = await readStore();
    const profiles = new Map<string, AdminProfileSummary>();

    profiles.set(fallbackUser.id, {
      id: fallbackUser.id,
      email: fallbackUser.email,
      displayName: fallbackUser.displayName,
      role: fallbackUser.role,
    });

    for (const membership of store.memberships) {
      if (!profiles.has(membership.profileId)) {
        profiles.set(membership.profileId, {
          id: membership.profileId,
          email: membership.email,
          displayName: membership.displayName,
          role: "member",
        });
      }
    }

    return [...profiles.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async listProjectMemberships(projectId: string) {
    return (await readStore()).memberships.filter((membership) => membership.projectId === projectId);
  }

  async replaceProjectMemberships(input: ReplaceProjectMembershipsInput) {
    const store = await readStore();

    if (!store.projects.some((project) => project.id === input.projectId)) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    const timestamp = nowIso();
    const memberships = input.memberships.map((membership) => ({
      id: `membership:${input.projectId}:${membership.profileId.trim()}`,
      projectId: input.projectId,
      profileId: membership.profileId.trim(),
      role: membership.role,
      displayName: membership.displayName.trim(),
      email: membership.email.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    }));

    await writeStore(
      {
        ...store,
        memberships: [...store.memberships.filter((membership) => membership.projectId !== input.projectId), ...memberships],
      },
      "admin.memberships.replace",
    );

    return memberships;
  }

  async getFoundationSettings(): Promise<AdminFoundationSettings> {
    return (await readStore()).foundationSettings ?? normalizeAdminFoundationSettings(null);
  }

  async updateFoundationSettings(input: UpdateAdminFoundationSettingsInput) {
    const store = await readStore();
    const foundationSettings = {
      ownerDiscipline: requireOwnerDiscipline(input.ownerDiscipline),
    } satisfies AdminFoundationSettings;

    await writeStore(
      {
        ...store,
        foundationSettings,
      },
      "admin.foundation-settings.update",
    );

    return foundationSettings;
  }

  async listGlobalTaskCategoryDefinitions(fieldKey?: TaskCategoryFieldKey) {
    return (await readStore()).categoryDefinitions
      .filter((definition) => definition.projectId === null && (!fieldKey || definition.fieldKey === fieldKey))
      .sort(compareBySortOrder);
  }

  async listProjectTaskCategoryDefinitions(projectId: string, fieldKey?: TaskCategoryFieldKey) {
    return (await readStore()).categoryDefinitions
      .filter((definition) => definition.projectId === projectId && (!fieldKey || definition.fieldKey === fieldKey))
      .sort(compareBySortOrder);
  }

  async listEffectiveTaskCategoryDefinitions(projectId: string | null, fieldKey: TaskCategoryFieldKey) {
    const resolved = resolveEffectiveTaskCategoryDefinitions((await readStore()).categoryDefinitions, fieldKey, projectId);
    return resolved.selectableDefinitions.sort(compareBySortOrder);
  }

  async createTaskCategoryDefinition(input: CreateTaskCategoryDefinitionInput) {
    const store = await readStore();
    const code = assertCreatableTaskCategoryCode(store.categoryDefinitions, input.fieldKey, input.projectId, input.code);
    const labelKo = sanitizeText(input.labelKo);
    const labelEn = sanitizeText(input.labelEn);

    if (!code || !labelKo || !labelEn) {
      throw badRequest("Category code and labels are required", "TASK_CATEGORY_REQUIRED");
    }

    if (input.projectId && !store.projects.some((project) => project.id === input.projectId)) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    const timestamp = nowIso();
    const definition: TaskCategoryDefinition = {
      id: randomUUID(),
      fieldKey: input.fieldKey,
      projectId: input.projectId,
      code,
      labelKo,
      labelEn,
      isSystem: input.projectId === null ? Boolean(input.isSystem) : false,
      isActive: input.isActive ?? true,
      sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    };

    await writeStore(
      {
        ...store,
        categoryDefinitions: [...store.categoryDefinitions, definition],
      },
      input.projectId ? `admin.${input.fieldKey}.project.create` : `admin.${input.fieldKey}.global.create`,
    );

    return definition;
  }

  async updateTaskCategoryDefinition(id: string, input: UpdateTaskCategoryDefinitionInput) {
    const store = await readStore();
    const current = store.categoryDefinitions.find((definition) => definition.id === id);

    if (!current) {
      throw notFound("Category definition not found", "TASK_CATEGORY_NOT_FOUND");
    }

    const updated: TaskCategoryDefinition = {
      ...current,
      code: requireAdminStoredWorkTypeCode(current.code, "code"),
      labelKo: input.labelKo === undefined ? current.labelKo : sanitizeText(input.labelKo) || current.labelKo,
      labelEn: input.labelEn === undefined ? current.labelEn : sanitizeText(input.labelEn) || current.labelEn,
      sortOrder: input.sortOrder === undefined || !Number.isFinite(input.sortOrder) ? current.sortOrder : input.sortOrder,
      isActive: input.isActive ?? current.isActive,
      updatedAt: nowIso(),
      updatedBy: input.updatedBy,
    };

    await writeStore(
      {
        ...store,
        categoryDefinitions: store.categoryDefinitions.map((definition) => (definition.id === id ? updated : definition)),
      },
      current.projectId ? `admin.${current.fieldKey}.project.update` : `admin.${current.fieldKey}.global.update`,
    );

    return updated;
  }

  async listGlobalWorkTypeDefinitions() {
    return (await this.listGlobalTaskCategoryDefinitions("workType")) as WorkTypeDefinition[];
  }

  async listProjectWorkTypeDefinitions(projectId: string) {
    return (await this.listProjectTaskCategoryDefinitions(projectId, "workType")) as WorkTypeDefinition[];
  }

  async listEffectiveWorkTypeDefinitions(projectId: string | null) {
    return (await this.listEffectiveTaskCategoryDefinitions(projectId, "workType")) as WorkTypeDefinition[];
  }

  async createWorkTypeDefinition(input: CreateWorkTypeDefinitionInput) {
    return (await this.createTaskCategoryDefinition({
      ...input,
      fieldKey: "workType",
    })) as WorkTypeDefinition;
  }

  async updateWorkTypeDefinition(id: string, input: UpdateWorkTypeDefinitionInput) {
    return (await this.updateTaskCategoryDefinition(id, input)) as WorkTypeDefinition;
  }
}

export const localAdminRepository = new LocalAdminRepository();
