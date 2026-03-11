// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ProjectRecord } from "@/domains/project/types";
import { localProjectMetaDir, localProjectMetaPath } from "@/lib/runtime-config";
import type { ProjectRepository, UpdateProjectInput } from "@/repositories/contracts";

const defaultProject: ProjectRecord = {
  id: "project-local",
  name: "???꾨줈?앺듃",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: "local-file",
};

class LocalProjectRepository implements ProjectRepository {
  async getProject() {
    try {
      const raw = await readFile(localProjectMetaPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProjectRecord>;

      return {
        ...defaultProject,
        ...parsed,
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : defaultProject.name,
        source: "local-file",
      } satisfies ProjectRecord;
    } catch {
      await this.write(defaultProject);
      return defaultProject;
    }
  }

  async updateProject(input: UpdateProjectInput) {
    const current = await this.getProject();
    const next: ProjectRecord = {
      ...current,
      name: input.name.trim() || current.name,
      updatedAt: new Date().toISOString(),
      source: "local-file",
    };

    await this.write(next);
    return next;
  }

  private async write(record: ProjectRecord) {
    await mkdir(localProjectMetaDir, { recursive: true });
    await writeFile(localProjectMetaPath, JSON.stringify(record, null, 2), "utf8");
  }
}

export const localProjectRepository = new LocalProjectRepository();
