// @ts-nocheck
import type { ProjectRecord } from "@/domains/project/types";
import { defaultProjectName } from "@/lib/runtime-config";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import type { ProjectRepository, UpdateProjectInput } from "@/repositories/contracts";

const defaultProject: ProjectRecord = {
  id: "project-local",
  name: defaultProjectName,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: "local-file",
};

class LocalProjectRepository implements ProjectRepository {
  async getProject() {
    const parsed = (await readLocalStore<Partial<ProjectRecord>>("project", {})).value;

    return {
      ...defaultProject,
      ...parsed,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : defaultProject.name,
      source: "local-file",
    } satisfies ProjectRecord;
  }

  async updateProject(input: UpdateProjectInput) {
    const current = await this.getProject();
    const next: ProjectRecord = {
      ...current,
      name: input.name.trim() || current.name,
      updatedAt: new Date().toISOString(),
      source: "local-file",
    };

    await writeLocalStore("project", next, { reason: "project.update" });
    return next;
  }
}

export const localProjectRepository = new LocalProjectRepository();
