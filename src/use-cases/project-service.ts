import { projectRepository } from "@/repositories";

export async function getProject() {
  return projectRepository.getProject();
}

export async function updateProject(name: string) {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error("project name is required");
  }

  return projectRepository.updateProject({ name: normalized });
}