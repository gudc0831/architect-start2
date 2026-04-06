import type { AdminFoundationSettings } from "@/domains/admin/foundation-settings";
import type { AuthRole } from "@/domains/auth/types";
import type { TaskCategoryDefinition } from "@/domains/admin/task-category-definitions";
import type { ProjectRecord } from "@/domains/project/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

export type ProjectMembershipRole = "manager" | "member";

export type ProjectSummary = ProjectRecord & {
  createdBy: string | null;
  updatedBy: string | null;
};

export type AdminProfileSummary = {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
};

export type ProjectMembershipRecord = {
  id: string;
  projectId: string;
  profileId: string;
  role: ProjectMembershipRole;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ProjectSelectionRecord = {
  currentProjectId: string | null;
  availableProjects: ProjectSummary[];
  source: "postgres" | "local-file" | "firestore" | "cookie";
};

export type AdminStoreRecord = {
  version: 1;
  selectedProjectId: string | null;
  projects: ProjectSummary[];
  memberships: ProjectMembershipRecord[];
  categoryDefinitions: TaskCategoryDefinition[];
  foundationSettings?: AdminFoundationSettings;
  workTypeDefinitions?: WorkTypeDefinition[];
};
