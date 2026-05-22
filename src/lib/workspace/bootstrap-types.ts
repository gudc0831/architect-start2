import type { ProjectMembershipRole } from "@/domains/admin/types";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { AuthUser } from "@/domains/auth/types";
import type { TaskRecord } from "@/domains/task/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

export type ProjectSelectionPayload = {
  currentProjectId: string | null;
  currentProjectRole?: ProjectMembershipRole | null;
  availableProjects: Array<{ id: string; name: string; source?: string }>;
  source?: string | null;
  workTypeDefinitions: WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>>;
};

export type DashboardSystemMode = {
  backendMode: string;
  dataMode: string;
  uploadMode: string;
  hasSupabase: boolean;
  hasFirebaseProjectId: boolean;
};

export type WorkspaceBootstrapPayload = {
  user: AuthUser;
  project: ProjectSelectionPayload;
  activeTasks: TaskRecord[] | null;
  activeTasksError?: {
    code?: string | null;
    message?: string | null;
  } | null;
};
