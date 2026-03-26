import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { badRequest, notFound } from "@/lib/api/errors";
import { fileRepository, projectRepository, taskRepository } from "@/repositories";
import { storageProvider } from "@/storage";

type TrashSelectionInput = {
  taskIds?: string[] | null;
  fileIds?: string[] | null;
};

type TaskHierarchyState = Pick<TaskRecord, "id" | "parentTaskId" | "rootTaskId" | "depth">;

export async function permanentlyDeleteTrashSelection(input: TrashSelectionInput, userId?: string | null) {
  const taskIds = uniqueIds(input.taskIds);
  const fileIds = uniqueIds(input.fileIds);

  if (taskIds.length === 0 && fileIds.length === 0) {
    return { deletedTaskCount: 0, deletedFileCount: 0 };
  }

  const allTasks = await listAllTasks();
  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const selectedTasks = taskIds.map((taskId) => resolveDeletedTask(taskId, taskById));
  const selectedTaskIds = new Set(selectedTasks.map((task) => task.id));

  await rehomeRemainingDescendants(allTasks, selectedTaskIds, userId ?? null);

  const attachedFiles = await listFilesForTasks(selectedTasks);
  const attachedFileIds = new Set(attachedFiles.map((file) => file.id));
  const explicitFiles = await resolveDeletedFiles(fileIds.filter((fileId) => !attachedFileIds.has(fileId)));

  for (const file of attachedFiles) {
    await deleteStoredFileRecord(file, false);
  }

  for (const file of explicitFiles) {
    await deleteStoredFileRecord(file, true);
  }

  for (const task of [...selectedTasks].sort(compareTasksForDeletion)) {
    await taskRepository.deleteTask(task.id);
  }

  return {
    deletedTaskCount: selectedTasks.length,
    deletedFileCount: attachedFiles.length + explicitFiles.length,
  };
}

export async function bulkDeleteTrashSelection(input: TrashSelectionInput, userId?: string | null) {
  return permanentlyDeleteTrashSelection(input, userId);
}

export async function emptyTrash(userId?: string | null) {
  const project = await projectRepository.getProject();
  const [trashedTasks, trashedFiles] = await Promise.all([
    taskRepository.listTrashTasks(project.id),
    fileRepository.listTrashFiles(),
  ]);

  return permanentlyDeleteTrashSelection(
    {
      taskIds: trashedTasks.map((task) => task.id),
      fileIds: trashedFiles.map((file) => file.id),
    },
    userId,
  );
}

async function listAllTasks() {
  const project = await projectRepository.getProject();
  const [activeTasks, trashTasks] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    taskRepository.listTrashTasks(project.id),
  ]);
  return [...activeTasks, ...trashTasks];
}

function uniqueIds(values?: string[] | null) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function resolveDeletedTask(taskId: string, taskById: Map<string, TaskRecord>) {
  const task = taskById.get(taskId);

  if (!task) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  if (!task.deletedAt) {
    throw badRequest("Only trashed tasks can be deleted permanently", "TASK_NOT_IN_TRASH");
  }

  return task;
}

async function resolveDeletedFiles(fileIds: string[]) {
  const files: FileRecord[] = [];

  for (const fileId of fileIds) {
    const file = await fileRepository.findFileById(fileId);

    if (!file) {
      throw notFound("File not found", "FILE_NOT_FOUND");
    }

    if (!file.deletedAt) {
      throw badRequest("Only trashed files can be deleted permanently", "FILE_NOT_IN_TRASH");
    }

    files.push(file);
  }

  return files;
}

async function listFilesForTasks(tasks: TaskRecord[]) {
  const files = await Promise.all(tasks.map((task) => fileRepository.listFilesByTask(task.id)));
  return dedupeFiles(files.flat());
}

function dedupeFiles(files: FileRecord[]) {
  const unique = new Map<string, FileRecord>();

  for (const file of files) {
    if (!unique.has(file.id)) {
      unique.set(file.id, file);
    }
  }

  return [...unique.values()];
}

async function deleteStoredFileRecord(file: FileRecord, requireTrash: boolean) {
  if (requireTrash && !file.deletedAt) {
    throw badRequest("Only trashed files can be deleted permanently", "FILE_NOT_IN_TRASH");
  }

  const storageBucket = file.storageBucket.trim();
  const objectPath = file.objectPath.trim();

  if (!storageBucket || !objectPath) {
    throw badRequest("File storage location is invalid", "FILE_STORAGE_PATH_INVALID");
  }

  await storageProvider.delete({ storageBucket, objectPath });
  await fileRepository.deleteFile(file.id);
}

async function rehomeRemainingDescendants(allTasks: TaskRecord[], selectedTaskIds: Set<string>, userId: string | null) {
  if (selectedTaskIds.size === 0) {
    return;
  }

  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const remainingTasks = allTasks.filter((task) => !selectedTaskIds.has(task.id));
  const remainingById = new Map(remainingTasks.map((task) => [task.id, task]));
  const affectedTasks = remainingTasks.filter((task) => hasSelectedAncestor(task, taskById, selectedTaskIds));

  if (affectedTasks.length === 0) {
    return;
  }

  const affectedIds = new Set(affectedTasks.map((task) => task.id));
  const nextParentById = new Map<string, string | null>();

  for (const task of affectedTasks) {
    nextParentById.set(task.id, resolveNearestRemainingParent(task.parentTaskId, taskById, remainingById, selectedTaskIds));
  }

  const childrenByParent = groupAffectedChildren(affectedTasks, nextParentById);
  const resolvedHierarchy = new Map<string, TaskHierarchyState>();
  const visited = new Set<string>();

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

    const update: { parentTaskId?: string | null; rootTaskId?: string; depth?: number; updatedBy?: string | null } = {};
    if ((task.parentTaskId ?? null) !== parentTaskId) update.parentTaskId = parentTaskId;
    if (task.rootTaskId !== nextRootTaskId) update.rootTaskId = nextRootTaskId;
    if (task.depth !== nextDepth) update.depth = nextDepth;

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
