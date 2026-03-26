import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { backendMode } from "@/lib/backend-mode";
import { createLocalSnapshot, quarantineLocalUpload, restoreLocalSnapshot } from "@/lib/data-guard/local";
import { localUploadRoot } from "@/lib/runtime-config";
import { classifyLegacyWorkType } from "@/lib/task-work-type-write";
import { fileRepository, taskRepository } from "@/repositories";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

type MigrationCandidate = {
  id: string;
  issueId: string;
  title: string;
  deletedAt: string | null;
  rawWorkType: string;
  nextCode: string | null;
  action: "keep" | "map" | "delete";
  reason: string;
};

type RehomeEntry = {
  taskId: string;
  issueId: string;
  previousParentTaskId: string | null;
  nextParentTaskId: string | null;
  previousRootTaskId: string;
  nextRootTaskId: string;
  previousDepth: number;
  nextDepth: number;
  previousSiblingOrder: number;
  nextSiblingOrder: number;
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
    deleteTaskCount: number;
    deletedFileCount: number;
    rehomedTaskCount: number;
  };
  candidates: MigrationCandidate[];
  deletedTaskIds: string[];
  deletedFileIds: string[];
  rehomes: RehomeEntry[];
};

type QuarantinedUpload = {
  objectPath: string;
  targetPath: string;
};

export async function runLocalWorkTypeMigration(input?: {
  apply?: boolean;
  updatedBy?: string | null;
}) {
  if (backendMode !== "local") {
    throw new Error("Local workType migration requires APP_BACKEND_MODE=local");
  }

  const project = await getSelectedTaskProject();
  const [activeTasks, trashTasks] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    taskRepository.listTrashTasks(project.id),
  ]);
  const allTasks = [...activeTasks, ...trashTasks];
  const candidates = allTasks.map<MigrationCandidate>((task) => {
    const decision = classifyLegacyWorkType(task.workType);
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
  const deleteCandidates = candidates.filter((candidate) => candidate.action === "delete");

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
      deleteTaskCount: deleteCandidates.length,
      deletedFileCount: 0,
      rehomedTaskCount: 0,
    },
    candidates,
    deletedTaskIds: [],
    deletedFileIds: [],
    rehomes: [],
  };

  if (!input?.apply) {
    return report;
  }

  report.snapshotId = (
    await createLocalSnapshot("work-type-migration.apply", {
      mappedTaskCount: mappedCandidates.length,
      deleteTaskCount: deleteCandidates.length,
    })
  ).id;

  const quarantinedUploads: QuarantinedUpload[] = [];

  try {
    for (const candidate of mappedCandidates) {
      await taskRepository.updateTask(candidate.id, {
        workType: candidate.nextCode ?? undefined,
        updatedBy: input?.updatedBy ?? null,
      });
    }

    const selectedDeleteIds = new Set(deleteCandidates.map((candidate) => candidate.id));
    const rehomes = await rehomeRemainingDescendants(allTasks, selectedDeleteIds, input?.updatedBy ?? null);
    report.rehomes = rehomes;
    report.summary.rehomedTaskCount = rehomes.length;

    const tasksToDelete = allTasks.filter((task) => selectedDeleteIds.has(task.id)).sort(compareTasksForDeletion);
    const filesToDelete = dedupeFiles(
      (
        await Promise.all(tasksToDelete.map((task) => fileRepository.listFilesByTask(task.id)))
      ).flat(),
    );

    for (const file of filesToDelete) {
      const quarantinedUpload = await deleteStoredFileRecord(file);
      if (quarantinedUpload) {
        quarantinedUploads.push(quarantinedUpload);
      }
      report.deletedFileIds.push(file.id);
    }

    for (const task of tasksToDelete) {
      await taskRepository.deleteTask(task.id);
      report.deletedTaskIds.push(task.id);
    }

    report.summary.deletedFileCount = report.deletedFileIds.length;
    return report;
  } catch (error) {
    const snapshotId = report.snapshotId;
    const rollbackErrors: string[] = [];

    if (snapshotId) {
      try {
        await restoreLocalSnapshot(snapshotId);
      } catch (restoreError) {
        rollbackErrors.push(`snapshot restore failed: ${toErrorMessage(restoreError)}`);
      }
    }

    try {
      await restoreQuarantinedUploads(quarantinedUploads);
    } catch (uploadRestoreError) {
      rollbackErrors.push(`upload restore failed: ${toErrorMessage(uploadRestoreError)}`);
    }

    const suffix =
      rollbackErrors.length > 0
        ? ` Rollback encountered additional errors: ${rollbackErrors.join("; ")}`
        : snapshotId
          ? ` Local snapshot ${snapshotId} was restored.`
          : "";

    throw new Error(`workType migration apply failed: ${toErrorMessage(error)}.${suffix}`);
  }
}

async function deleteStoredFileRecord(file: FileRecord) {
  const storageBucket = file.storageBucket.trim();
  const objectPath = file.objectPath.trim();
  let quarantinedUpload: QuarantinedUpload | null = null;

  if (storageBucket && objectPath) {
    const result = await quarantineLocalUpload(objectPath);
    if (result?.targetPath) {
      quarantinedUpload = {
        objectPath,
        targetPath: result.targetPath,
      };
    }
  }

  try {
    await fileRepository.deleteFile(file.id);
    return quarantinedUpload;
  } catch (error) {
    if (quarantinedUpload) {
      await restoreQuarantinedUploads([quarantinedUpload]);
    }

    throw error;
  }
}

async function rehomeRemainingDescendants(allTasks: TaskRecord[], selectedTaskIds: Set<string>, userId: string | null) {
  if (selectedTaskIds.size === 0) {
    return [];
  }

  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const remainingTasks = allTasks.filter((task) => !selectedTaskIds.has(task.id));
  const remainingById = new Map(remainingTasks.map((task) => [task.id, task]));
  const affectedTasks = remainingTasks.filter((task) => hasSelectedAncestor(task, taskById, selectedTaskIds));

  if (affectedTasks.length === 0) {
    return [];
  }

  const affectedIds = new Set(affectedTasks.map((task) => task.id));
  const nextParentById = new Map<string, string | null>();

  for (const task of affectedTasks) {
    nextParentById.set(task.id, resolveNearestRemainingParent(task.parentTaskId, taskById, remainingById, selectedTaskIds));
  }

  const childrenByParent = groupAffectedChildren(affectedTasks, nextParentById);
  const baseSiblingOrderByParent = buildBaseSiblingOrderMap(remainingTasks, affectedIds);
  const nextSiblingOrderByParent = new Map<string | null, number>();
  const resolvedHierarchy = new Map<string, TaskHierarchyState>();
  const visited = new Set<string>();
  const rehomes: RehomeEntry[] = [];

  const roots = affectedTasks
    .filter((task) => {
      const parentTaskId = nextParentById.get(task.id) ?? null;
      return !parentTaskId || !affectedIds.has(parentTaskId);
    })
    .sort(compareTasksByHierarchy);

  for (const task of roots) {
    await visitAffectedTask(task);
  }

  for (const task of affectedTasks.sort(compareTasksByHierarchy)) {
    if (!visited.has(task.id)) {
      await visitAffectedTask(task);
    }
  }

  return rehomes;

  async function visitAffectedTask(task: TaskRecord) {
    if (visited.has(task.id)) {
      return;
    }

    visited.add(task.id);
    const parentTaskId = nextParentById.get(task.id) ?? null;
    const parentState = parentTaskId
      ? resolvedHierarchy.get(parentTaskId) ?? toHierarchyState(remainingById.get(parentTaskId) ?? null)
      : null;
    const nextRootTaskId = parentState ? parentState.rootTaskId : task.id;
    const nextDepth = parentState ? parentState.depth + 1 : 0;
    const parentChanged = (task.parentTaskId ?? null) !== parentTaskId;
    const nextSiblingOrder = parentChanged
      ? allocateSiblingOrder(parentTaskId, baseSiblingOrderByParent, nextSiblingOrderByParent)
      : task.siblingOrder;

    const update: {
      parentTaskId?: string | null;
      rootTaskId?: string;
      depth?: number;
      siblingOrder?: number;
      updatedBy?: string | null;
    } = {};
    if ((task.parentTaskId ?? null) !== parentTaskId) update.parentTaskId = parentTaskId;
    if (task.rootTaskId !== nextRootTaskId) update.rootTaskId = nextRootTaskId;
    if (task.depth !== nextDepth) update.depth = nextDepth;
    if (task.siblingOrder !== nextSiblingOrder) update.siblingOrder = nextSiblingOrder;

    if (Object.keys(update).length > 0) {
      const updatedTask = await taskRepository.updateTask(task.id, {
        ...update,
        updatedBy: userId,
      });

      resolvedHierarchy.set(task.id, {
        id: updatedTask.id,
        parentTaskId: updatedTask.parentTaskId,
        rootTaskId: updatedTask.rootTaskId,
        depth: updatedTask.depth,
      });
      rehomes.push({
        taskId: updatedTask.id,
        issueId: updatedTask.issueId,
        previousParentTaskId: task.parentTaskId,
        nextParentTaskId: updatedTask.parentTaskId,
        previousRootTaskId: task.rootTaskId,
        nextRootTaskId: updatedTask.rootTaskId,
        previousDepth: task.depth,
        nextDepth: updatedTask.depth,
        previousSiblingOrder: task.siblingOrder,
        nextSiblingOrder: updatedTask.siblingOrder,
      });
    } else {
      resolvedHierarchy.set(task.id, {
        id: task.id,
        parentTaskId,
        rootTaskId: nextRootTaskId,
        depth: nextDepth,
      });
    }

    const children = childrenByParent.get(task.id) ?? [];
    for (const child of children) {
      await visitAffectedTask(child);
    }
  }
}

type TaskHierarchyState = Pick<TaskRecord, "id" | "parentTaskId" | "rootTaskId" | "depth">;

function dedupeFiles(files: FileRecord[]) {
  const unique = new Map<string, FileRecord>();

  for (const file of files) {
    if (!unique.has(file.id)) {
      unique.set(file.id, file);
    }
  }

  return [...unique.values()];
}

function hasSelectedAncestor(task: TaskRecord, taskById: Map<string, TaskRecord>, selectedTaskIds: Set<string>) {
  const visited = new Set<string>();
  let parentTaskId = task.parentTaskId;

  while (parentTaskId) {
    if (visited.has(parentTaskId)) {
      return false;
    }

    visited.add(parentTaskId);
    if (selectedTaskIds.has(parentTaskId)) {
      return true;
    }

    parentTaskId = taskById.get(parentTaskId)?.parentTaskId ?? null;
  }

  return false;
}

function resolveNearestRemainingParent(
  parentTaskId: string | null,
  taskById: Map<string, TaskRecord>,
  remainingById: Map<string, TaskRecord>,
  selectedTaskIds: Set<string>,
) {
  const visited = new Set<string>();
  let currentParentId = parentTaskId;

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return null;
    }

    visited.add(currentParentId);
    if (selectedTaskIds.has(currentParentId)) {
      currentParentId = taskById.get(currentParentId)?.parentTaskId ?? null;
      continue;
    }

    return remainingById.has(currentParentId) ? currentParentId : null;
  }

  return null;
}

function groupAffectedChildren(tasks: TaskRecord[], nextParentById: Map<string, string | null>) {
  const grouped = new Map<string | null, TaskRecord[]>();

  for (const task of tasks) {
    const parentTaskId = nextParentById.get(task.id) ?? null;
    const siblings = grouped.get(parentTaskId) ?? [];
    siblings.push(task);
    grouped.set(parentTaskId, siblings);
  }

  for (const siblings of grouped.values()) {
    siblings.sort(compareTasksByHierarchy);
  }

  return grouped;
}

function buildBaseSiblingOrderMap(tasks: TaskRecord[], excludedIds: Set<string>) {
  const grouped = new Map<string | null, number>();

  for (const task of tasks) {
    if (excludedIds.has(task.id)) {
      continue;
    }

    const parentTaskId = task.parentTaskId ?? null;
    grouped.set(parentTaskId, Math.max(grouped.get(parentTaskId) ?? -1, task.siblingOrder));
  }

  return grouped;
}

function allocateSiblingOrder(
  parentTaskId: string | null,
  baseSiblingOrderByParent: Map<string | null, number>,
  nextSiblingOrderByParent: Map<string | null, number>,
) {
  const allocated = nextSiblingOrderByParent.get(parentTaskId);
  if (allocated !== undefined) {
    nextSiblingOrderByParent.set(parentTaskId, allocated + 1);
    return allocated;
  }

  const start = (baseSiblingOrderByParent.get(parentTaskId) ?? -1) + 1;
  nextSiblingOrderByParent.set(parentTaskId, start + 1);
  return start;
}

function toHierarchyState(task: TaskRecord | null): TaskHierarchyState | null {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    parentTaskId: task.parentTaskId,
    rootTaskId: task.rootTaskId,
    depth: task.depth,
  };
}

function compareTasksByHierarchy(left: TaskRecord, right: TaskRecord) {
  const siblingCompare = left.siblingOrder - right.siblingOrder;
  if (siblingCompare !== 0) return siblingCompare;

  const actionCompare = left.actionId - right.actionId;
  if (actionCompare !== 0) return actionCompare;

  return left.createdAt.localeCompare(right.createdAt);
}

function compareTasksForDeletion(left: TaskRecord, right: TaskRecord) {
  const depthCompare = right.depth - left.depth;
  if (depthCompare !== 0) return depthCompare;

  const deletedCompare = (right.deletedAt ?? "").localeCompare(left.deletedAt ?? "");
  if (deletedCompare !== 0) return deletedCompare;

  return right.actionId - left.actionId;
}

async function restoreQuarantinedUploads(quarantinedUploads: QuarantinedUpload[]) {
  for (const upload of quarantinedUploads) {
    const targetPath = join(localUploadRoot, upload.objectPath.replace(/\//g, "\\"));
    await mkdir(dirname(targetPath), { recursive: true });

    try {
      await rename(upload.targetPath, targetPath);
    } catch {
      await copyFile(upload.targetPath, targetPath);
      await unlink(upload.targetPath);
    }
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
