import { backendMode } from "@/lib/backend-mode";
import { createLocalSnapshot, restoreLocalSnapshot } from "@/lib/data-guard/local";
import { classifyLegacyWorkType, type WorkTypeMigrationAction } from "@/lib/task-work-type-write";
import { taskRepository } from "@/repositories";
import { adminRepository } from "@/repositories/admin";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

type MigrationCandidate = {
  id: string;
  issueId: string;
  title: string;
  deletedAt: string | null;
  rawWorkType: string;
  nextCode: string | null;
  action: WorkTypeMigrationAction;
  reason: string;
};

export type LocalWorkTypeMigrationReport = {
  backendMode: string;
  projectId: string;
  generatedAt: string;
  apply: boolean;
  snapshotId: string | null;
  summary: {
    totalTaskCount: number;
    activeTaskCount: number;
    trashTaskCount: number;
    alreadyCanonicalCount: number;
    mappedTaskCount: number;
    unclassifiedTaskCount: number;
    updatedTaskCount: number;
  };
  candidates: MigrationCandidate[];
  updatedTaskIds: string[];
};

export async function runLocalWorkTypeMigration(input?: {
  apply?: boolean;
  updatedBy?: string | null;
}) {
  if (backendMode !== "local") {
    throw new Error("Local workType migration requires APP_BACKEND_MODE=local");
  }

  const project = await getSelectedTaskProject();
  const [activeTasks, trashTasks, effectiveWorkTypes] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    taskRepository.listTrashTasks(project.id),
    adminRepository.listEffectiveWorkTypeDefinitions(project.id),
  ]);
  const allTasks = [...activeTasks, ...trashTasks];
  const candidates = allTasks.map<MigrationCandidate>((task) => {
    const decision = classifyLegacyWorkType(task.workType, {
      allowedCodes: effectiveWorkTypes,
    });

    return {
      id: task.id,
      issueId: task.issueId,
      title: task.issueTitle,
      deletedAt: task.deletedAt,
      rawWorkType: decision.rawValue,
      nextCode: decision.nextCode,
      action: decision.action,
      reason: decision.reason,
    };
  });

  const mappedCandidates = candidates.filter((candidate) => candidate.action === "map");
  const unclassifiedCandidates = candidates.filter((candidate) => candidate.action === "unclassified");
  const candidatesToUpdate = candidates.filter((candidate) => candidate.action !== "keep" && candidate.rawWorkType);
  const report: LocalWorkTypeMigrationReport = {
    backendMode,
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    apply: Boolean(input?.apply),
    snapshotId: null,
    summary: {
      totalTaskCount: allTasks.length,
      activeTaskCount: activeTasks.length,
      trashTaskCount: trashTasks.length,
      alreadyCanonicalCount: candidates.filter((candidate) => candidate.action === "keep").length,
      mappedTaskCount: mappedCandidates.length,
      unclassifiedTaskCount: unclassifiedCandidates.length,
      updatedTaskCount: 0,
    },
    candidates,
    updatedTaskIds: [],
  };

  if (!input?.apply) {
    return report;
  }

  if (candidatesToUpdate.length === 0) {
    report.summary.updatedTaskCount = 0;
    return report;
  }

  report.snapshotId = (
    await createLocalSnapshot("work-type-migration.apply", {
      mappedTaskCount: mappedCandidates.length,
      unclassifiedTaskCount: unclassifiedCandidates.length,
    })
  ).id;

  try {
    for (const candidate of candidatesToUpdate) {
      if (!candidate.rawWorkType) {
        continue;
      }

      await taskRepository.updateTask(candidate.id, {
        workType: candidate.nextCode ?? "",
        updatedBy: input?.updatedBy ?? null,
      });
      report.updatedTaskIds.push(candidate.id);
    }

    report.summary.updatedTaskCount = report.updatedTaskIds.length;
    return report;
  } catch (error) {
    const snapshotId = report.snapshotId;

    if (snapshotId) {
      try {
        await restoreLocalSnapshot(snapshotId);
      } catch (restoreError) {
        throw new Error(
          `workType migration apply failed: ${toErrorMessage(error)}. Snapshot restore failed: ${toErrorMessage(restoreError)}`,
        );
      }
    }

    throw new Error(
      `workType migration apply failed: ${toErrorMessage(error)}${snapshotId ? `. Local snapshot ${snapshotId} was restored.` : ""}`,
    );
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
