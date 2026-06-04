import type { AdminFoundationSettings } from "@/domains/admin/foundation-settings";
import type { AdminProfileSummary, ProjectMembershipRecord, ProjectSelectionRecord, ProjectSummary } from "@/domains/admin/types";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

export type CreateAdminProjectInput = {
  name: string;
  createdBy: string | null;
};

export type UpdateAdminProjectInput = {
  name: string;
  updatedBy: string | null;
};

export type UpsertProjectMembershipInput = {
  profileId: string;
  displayName: string;
  email: string;
  role: ProjectMembershipRecord["role"];
};

export type ReplaceProjectMembershipsInput = {
  projectId: string;
  memberships: UpsertProjectMembershipInput[];
  actorId: string | null;
};

export type CreateWorkTypeDefinitionInput = {
  projectId: string | null;
  code: string;
  labelKo: string;
  labelEn: string;
  sortOrder: number;
  isActive?: boolean;
  isSystem?: boolean;
  actorId: string | null;
};

export type CreateTaskCategoryDefinitionInput = CreateWorkTypeDefinitionInput & {
  fieldKey: TaskCategoryFieldKey;
};

export type UpdateWorkTypeDefinitionInput = {
  labelKo?: string;
  labelEn?: string;
  sortOrder?: number;
  isActive?: boolean;
  updatedBy: string | null;
};

export type UpdateTaskCategoryDefinitionInput = UpdateWorkTypeDefinitionInput;

export type UpdateAdminFoundationSettingsInput = {
  ownerDiscipline: string;
  updatedBy: string | null;
};

export interface AdminRepository {
  getProjectSelection(): Promise<ProjectSelectionRecord>;
  setCurrentProject(projectId: string): Promise<ProjectSelectionRecord>;
  listProjects(): Promise<ProjectSummary[]>;
  listProjectsForProfile(profileId: string): Promise<ProjectSummary[]>;
  getProjectById(projectId: string): Promise<ProjectSummary | null>;
  getProjectMembership(projectId: string, profileId: string): Promise<ProjectMembershipRecord | null>;
  createProject(input: CreateAdminProjectInput): Promise<ProjectSummary>;
  updateProject(projectId: string, input: UpdateAdminProjectInput): Promise<ProjectSummary>;
  listProfiles(): Promise<AdminProfileSummary[]>;
  listProjectMemberships(projectId: string): Promise<ProjectMembershipRecord[]>;
  replaceProjectMemberships(input: ReplaceProjectMembershipsInput): Promise<ProjectMembershipRecord[]>;
  getFoundationSettings(): Promise<AdminFoundationSettings>;
  updateFoundationSettings(input: UpdateAdminFoundationSettingsInput): Promise<AdminFoundationSettings>;
  listGlobalTaskCategoryDefinitions(fieldKey?: TaskCategoryFieldKey): Promise<TaskCategoryDefinition[]>;
  listProjectTaskCategoryDefinitions(projectId: string, fieldKey?: TaskCategoryFieldKey): Promise<TaskCategoryDefinition[]>;
  listEffectiveTaskCategoryDefinitions(projectId: string | null, fieldKey: TaskCategoryFieldKey): Promise<TaskCategoryDefinition[]>;
  createTaskCategoryDefinition(input: CreateTaskCategoryDefinitionInput): Promise<TaskCategoryDefinition>;
  updateTaskCategoryDefinition(id: string, input: UpdateTaskCategoryDefinitionInput): Promise<TaskCategoryDefinition>;
  listGlobalWorkTypeDefinitions(): Promise<WorkTypeDefinition[]>;
  listProjectWorkTypeDefinitions(projectId: string): Promise<WorkTypeDefinition[]>;
  listEffectiveWorkTypeDefinitions(projectId: string | null): Promise<WorkTypeDefinition[]>;
  createWorkTypeDefinition(input: CreateWorkTypeDefinitionInput): Promise<WorkTypeDefinition>;
  updateWorkTypeDefinition(id: string, input: UpdateWorkTypeDefinitionInput): Promise<WorkTypeDefinition>;
}
