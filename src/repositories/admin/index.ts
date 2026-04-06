import { createRequire } from "node:module";
import { backendMode } from "@/lib/backend-mode";
import type { AdminRepository } from "@/repositories/admin/contracts";

const require = createRequire(import.meta.url);

let adminRepositoryInstance: AdminRepository | null = null;

function getAdminRepository() {
  if (!adminRepositoryInstance) {
    adminRepositoryInstance =
      backendMode === "cloud"
        ? (require("./postgres-store").postgresAdminRepository as AdminRepository)
        : (require("./local-store").localAdminRepository as AdminRepository);
  }

  return adminRepositoryInstance;
}

export const adminRepository: AdminRepository = {
  getProjectSelection() {
    return getAdminRepository().getProjectSelection();
  },
  setCurrentProject(projectId) {
    return getAdminRepository().setCurrentProject(projectId);
  },
  listProjects() {
    return getAdminRepository().listProjects();
  },
  getProjectById(projectId) {
    return getAdminRepository().getProjectById(projectId);
  },
  createProject(input) {
    return getAdminRepository().createProject(input);
  },
  updateProject(projectId, input) {
    return getAdminRepository().updateProject(projectId, input);
  },
  listProfiles() {
    return getAdminRepository().listProfiles();
  },
  listProjectMemberships(projectId) {
    return getAdminRepository().listProjectMemberships(projectId);
  },
  replaceProjectMemberships(input) {
    return getAdminRepository().replaceProjectMemberships(input);
  },
  getFoundationSettings() {
    return getAdminRepository().getFoundationSettings();
  },
  updateFoundationSettings(input) {
    return getAdminRepository().updateFoundationSettings(input);
  },
  listGlobalTaskCategoryDefinitions(fieldKey) {
    return getAdminRepository().listGlobalTaskCategoryDefinitions(fieldKey);
  },
  listProjectTaskCategoryDefinitions(projectId, fieldKey) {
    return getAdminRepository().listProjectTaskCategoryDefinitions(projectId, fieldKey);
  },
  listEffectiveTaskCategoryDefinitions(projectId, fieldKey) {
    return getAdminRepository().listEffectiveTaskCategoryDefinitions(projectId, fieldKey);
  },
  createTaskCategoryDefinition(input) {
    return getAdminRepository().createTaskCategoryDefinition(input);
  },
  updateTaskCategoryDefinition(id, input) {
    return getAdminRepository().updateTaskCategoryDefinition(id, input);
  },
  listGlobalWorkTypeDefinitions() {
    return getAdminRepository().listGlobalWorkTypeDefinitions();
  },
  listProjectWorkTypeDefinitions(projectId) {
    return getAdminRepository().listProjectWorkTypeDefinitions(projectId);
  },
  listEffectiveWorkTypeDefinitions(projectId) {
    return getAdminRepository().listEffectiveWorkTypeDefinitions(projectId);
  },
  createWorkTypeDefinition(input) {
    return getAdminRepository().createWorkTypeDefinition(input);
  },
  updateWorkTypeDefinition(id, input) {
    return getAdminRepository().updateWorkTypeDefinition(id, input);
  },
};
