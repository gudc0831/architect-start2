import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  assertCreatableTaskCategoryCode,
  isTaskCategoryFieldKey,
  resolveEffectiveTaskCategoryDefinitions,
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import {
  requireAdminStoredWorkTypeCode,
} from "@/domains/admin/work-type-policy";
import type { AdminProfileSummary, ProjectMembershipRecord, ProjectSelectionRecord, ProjectSummary } from "@/domains/admin/types";
import { buildSystemWorkTypeDefinitions, type WorkTypeDefinition } from "@/domains/task/work-types";
import type {
  AdminRepository,
  CreateAdminProjectInput,
  CreateTaskCategoryDefinitionInput,
  CreateWorkTypeDefinitionInput,
  ReplaceProjectMembershipsInput,
  UpdateTaskCategoryDefinitionInput,
  UpdateAdminProjectInput,
  UpdateWorkTypeDefinitionInput,
} from "@/repositories/admin/contracts";

const adminPrisma = prisma as typeof prisma & {
  projectMembership: typeof prisma.$extends extends never
    ? never
    : {
        findMany: (...args: unknown[]) => Promise<any>;
        deleteMany: (...args: unknown[]) => Promise<any>;
        createMany: (...args: unknown[]) => Promise<any>;
      };
  workTypeDefinition: {
    count: (...args: unknown[]) => Promise<number>;
    createMany: (...args: unknown[]) => Promise<any>;
    findMany: (...args: unknown[]) => Promise<any[]>;
    findFirst: (...args: unknown[]) => Promise<any>;
    findUnique: (...args: unknown[]) => Promise<any>;
    create: (...args: unknown[]) => Promise<any>;
    update: (...args: unknown[]) => Promise<any>;
  };
};

function sanitizeText(value: string) {
  return value.trim();
}

function toProjectSummary(project: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    source: "postgres",
    createdBy: project.createdBy,
    updatedBy: project.updatedBy,
  };
}

function toMembershipRecord(membership: {
  id: string;
  projectId: string;
  profileId: string;
  role: string;
  displayName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}): ProjectMembershipRecord {
  return {
    id: membership.id,
    projectId: membership.projectId,
    profileId: membership.profileId,
    role: membership.role as ProjectMembershipRecord["role"],
    displayName: membership.displayName,
    email: membership.email,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    createdBy: membership.createdBy,
    updatedBy: membership.updatedBy,
  };
}

function toTaskCategoryDefinition(definition: {
  id: string;
  fieldKey?: string;
  projectId: string | null;
  code: string;
  labelKo: string;
  labelEn: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}): TaskCategoryDefinition {
  return {
    id: definition.id,
    fieldKey: isTaskCategoryFieldKey(definition.fieldKey) ? definition.fieldKey : "workType",
    projectId: definition.projectId,
    code: definition.code,
    labelKo: definition.labelKo,
    labelEn: definition.labelEn,
    isSystem: definition.isSystem,
    isActive: definition.isActive,
    sortOrder: definition.sortOrder,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    createdBy: definition.createdBy,
    updatedBy: definition.updatedBy,
  };
}

async function ensureGlobalBaseWorkTypes() {
  const count = await adminPrisma.workTypeDefinition.count({
    where: { projectId: null, fieldKey: "workType" },
  });

  if (count > 0) {
    return;
  }

  const definitions = buildSystemWorkTypeDefinitions();
  await adminPrisma.workTypeDefinition.createMany({
    data: definitions.map((definition) => ({
      code: definition.code,
      fieldKey: definition.fieldKey,
      labelKo: definition.labelKo,
      labelEn: definition.labelEn,
      isSystem: true,
      isActive: true,
      sortOrder: definition.sortOrder,
      createdBy: definition.createdBy,
      updatedBy: definition.updatedBy,
    })),
  });
}

export class PostgresAdminRepository implements AdminRepository {
  async getProjectSelection(): Promise<ProjectSelectionRecord> {
    const projects = await this.listProjects();
    return {
      currentProjectId: projects[0]?.id ?? null,
      availableProjects: projects,
      source: "postgres",
    };
  }

  async setCurrentProject(projectId: string) {
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    return {
      currentProjectId: project.id,
      availableProjects: await this.listProjects(),
      source: "postgres" as const,
    };
  }

  async listProjects() {
    const projects = await prisma.project.findMany({
      orderBy: [{ createdAt: "asc" }],
    });

    return projects.map(toProjectSummary);
  }

  async getProjectById(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    return project ? toProjectSummary(project) : null;
  }

  async createProject(input: CreateAdminProjectInput) {
    const name = sanitizeText(input.name);
    if (!name) {
      throw badRequest("Project name is required", "PROJECT_NAME_REQUIRED");
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });

      if (input.createdBy) {
        const profile = await tx.profile.findUnique({
          where: { id: input.createdBy },
          select: { id: true, displayName: true, email: true },
        });

        if (profile) {
          const adminTx = tx as typeof adminPrisma;
          await adminTx.projectMembership.createMany({
            data: [
              {
                projectId: created.id,
                profileId: profile.id,
                role: "manager",
                displayName: profile.displayName,
                email: profile.email,
                createdBy: input.createdBy,
                updatedBy: input.createdBy,
              },
            ],
          });
        }
      }

      return created;
    });

    return toProjectSummary(project);
  }

  async updateProject(projectId: string, input: UpdateAdminProjectInput) {
    const name = sanitizeText(input.name);
    if (!name) {
      throw badRequest("Project name is required", "PROJECT_NAME_REQUIRED");
    }

    const existing = await this.getProjectById(projectId);
    if (!existing) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        updatedBy: input.updatedBy,
      },
    });

    return toProjectSummary(project);
  }

  async listProfiles() {
    const profiles = await prisma.profile.findMany({
      orderBy: [{ displayName: "asc" }],
    });

    return profiles.map<AdminProfileSummary>((profile) => ({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
    }));
  }

  async listProjectMemberships(projectId: string) {
    const memberships = await adminPrisma.projectMembership.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }],
    });

    return memberships.map(toMembershipRecord);
  }

  async replaceProjectMemberships(input: ReplaceProjectMembershipsInput) {
    const project = await this.getProjectById(input.projectId);
    if (!project) {
      throw notFound("Project not found", "PROJECT_NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      const adminTx = tx as typeof adminPrisma;

      await adminTx.projectMembership.deleteMany({
        where: { projectId: input.projectId },
      });

      if (input.memberships.length === 0) {
        return;
      }

      const profileIds = [...new Set(input.memberships.map((membership) => membership.profileId.trim()))];
      const profiles = await tx.profile.findMany({
        where: { id: { in: profileIds } },
        select: { id: true, email: true, displayName: true },
      });

      if (profiles.length !== profileIds.length) {
        throw notFound("One or more profiles were not found", "PROFILE_NOT_FOUND");
      }

      await adminTx.projectMembership.createMany({
        data: input.memberships.map((membership) => {
          const profile = profiles.find((candidate) => candidate.id === membership.profileId.trim());
          if (!profile) {
            throw notFound("Profile not found", "PROFILE_NOT_FOUND");
          }

          return {
            projectId: input.projectId,
            profileId: profile.id,
            role: membership.role,
            displayName: membership.displayName.trim() || profile.displayName,
            email: membership.email.trim() || profile.email,
            createdBy: input.actorId,
            updatedBy: input.actorId,
          };
        }),
      });
    });

    return this.listProjectMemberships(input.projectId);
  }

  async listGlobalTaskCategoryDefinitions(fieldKey?: TaskCategoryFieldKey) {
    await ensureGlobalBaseWorkTypes();
    const definitions = await adminPrisma.workTypeDefinition.findMany({
      where: {
        projectId: null,
        ...(fieldKey ? { fieldKey } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return definitions.map((definition) => toTaskCategoryDefinition(definition));
  }

  async listProjectTaskCategoryDefinitions(projectId: string, fieldKey?: TaskCategoryFieldKey) {
    const definitions = await adminPrisma.workTypeDefinition.findMany({
      where: {
        projectId,
        ...(fieldKey ? { fieldKey } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return definitions.map((definition) => toTaskCategoryDefinition(definition));
  }

  async listEffectiveTaskCategoryDefinitions(projectId: string | null, fieldKey: TaskCategoryFieldKey) {
    await ensureGlobalBaseWorkTypes();
    const definitions = await adminPrisma.workTypeDefinition.findMany({
      where: {
        fieldKey,
        OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const resolved = resolveEffectiveTaskCategoryDefinitions(
      definitions.map((definition) => toTaskCategoryDefinition(definition)),
      fieldKey,
      projectId,
    );
    return resolved.selectableDefinitions;
  }

  async createTaskCategoryDefinition(input: CreateTaskCategoryDefinitionInput) {
    await ensureGlobalBaseWorkTypes();
    const existingDefinitions = await adminPrisma.workTypeDefinition.findMany({
      where: input.projectId
        ? {
            fieldKey: input.fieldKey,
            OR: [{ projectId: null }, { projectId: input.projectId }],
          }
        : { fieldKey: input.fieldKey },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const code = assertCreatableTaskCategoryCode(
      existingDefinitions.map((definition) => toTaskCategoryDefinition(definition)),
      input.fieldKey,
      input.projectId,
      input.code,
    );
    const labelKo = sanitizeText(input.labelKo);
    const labelEn = sanitizeText(input.labelEn);

    if (!code || !labelKo || !labelEn) {
      throw badRequest("Category code and labels are required", "TASK_CATEGORY_REQUIRED");
    }

    if (input.projectId) {
      const project = await this.getProjectById(input.projectId);
      if (!project) {
        throw notFound("Project not found", "PROJECT_NOT_FOUND");
      }
    }

    const definition = await adminPrisma.workTypeDefinition.create({
      data: {
        fieldKey: input.fieldKey,
        projectId: input.projectId,
        code,
        labelKo,
        labelEn,
        isSystem: input.projectId === null ? Boolean(input.isSystem) : false,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });

    return toTaskCategoryDefinition(definition);
  }

  async updateTaskCategoryDefinition(id: string, input: UpdateTaskCategoryDefinitionInput) {
    const current = await adminPrisma.workTypeDefinition.findUnique({
      where: { id },
    });

    if (!current) {
      throw notFound("Category definition not found", "TASK_CATEGORY_NOT_FOUND");
    }

    const definition = await adminPrisma.workTypeDefinition.update({
      where: { id },
      data: {
        code: requireAdminStoredWorkTypeCode(current.code, "code"),
        labelKo: input.labelKo === undefined ? undefined : sanitizeText(input.labelKo) || current.labelKo,
        labelEn: input.labelEn === undefined ? undefined : sanitizeText(input.labelEn) || current.labelEn,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        updatedBy: input.updatedBy,
      },
    });

    return toTaskCategoryDefinition(definition);
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

export const postgresAdminRepository = new PostgresAdminRepository();
