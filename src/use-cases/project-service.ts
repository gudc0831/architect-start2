import { badRequest } from "@/lib/api/errors";
import { projectRepository } from "@/repositories";

export async function getProject() {
  return projectRepository.getProject();
}

export async function updateProject(name: string, userId?: string | null) {
  const normalized = name.trim();

  if (!normalized) {
    throw badRequest("project name is required", "PROJECT_NAME_REQUIRED");
  }

  return projectRepository.updateProject({
    name: normalized,
    updatedBy: userId ?? null,
  });
}
