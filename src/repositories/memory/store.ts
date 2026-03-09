import type { CreateTaskInput, FileRepository, TaskRepository, UpdateTaskInput } from "@/repositories/contracts";
import type { FileRecord, TaskRecord } from "@/domains/task/types";

const taskStore: TaskRecord[] = [];
const fileStore: FileRecord[] = [];
let sequence = 700;

const now = () => new Date().toISOString();
const nextTaskNumber = () => `MIL-${sequence++}`;
const nextId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

class MemoryTaskRepository implements TaskRepository {
  async listActiveTasks() {
    return [...taskStore].filter((task) => !task.deletedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async listTrashTasks() {
    return [...taskStore]
      .filter((task) => !!task.deletedAt)
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }

  async createTask(input: CreateTaskInput) {
    const record: TaskRecord = {
      id: nextId("task"),
      taskNumber: nextTaskNumber(),
      dueDate: input.dueDate,
      category: input.category,
      requester: input.requester,
      assignee: input.assignee,
      title: input.title,
      createdAt: now(),
      isDaily: input.isDaily,
      description: input.description,
      status: "todo",
      progressNote: "",
      conclusion: "",
      deletedAt: null,
    };

    taskStore.unshift(record);
    return record;
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    const target = taskStore.find((task) => task.id === taskId);

    if (!target) {
      throw new Error("Task not found");
    }

    Object.assign(target, input);
    return target;
  }

  async moveTaskToTrash(taskId: string) {
    const target = taskStore.find((task) => task.id === taskId);

    if (!target) {
      throw new Error("Task not found");
    }

    target.deletedAt = now();
    return target;
  }

  async restoreTask(taskId: string) {
    const target = taskStore.find((task) => task.id === taskId);

    if (!target) {
      throw new Error("Task not found");
    }

    target.deletedAt = null;
    return target;
  }
}

class MemoryFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    return [...fileStore].filter((file) => !file.deletedAt && (!taskId || file.taskId === taskId));
  }

  async listTrashFiles(taskId?: string) {
    return [...fileStore]
      .filter((file) => !!file.deletedAt && (!taskId || file.taskId === taskId))
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }

  async attachFile(input: { taskId: string; originalName: string; storedName: string; storedPath: string }) {
    const record: FileRecord = {
      id: nextId("file"),
      taskId: input.taskId,
      originalName: input.originalName,
      storedName: input.storedName,
      storedPath: input.storedPath,
      createdAt: now(),
      deletedAt: null,
    };

    fileStore.unshift(record);
    return record;
  }

  async moveFileToTrash(fileId: string) {
    const target = fileStore.find((file) => file.id === fileId);

    if (!target) {
      throw new Error("File not found");
    }

    target.deletedAt = now();
    return target;
  }

  async restoreFile(fileId: string) {
    const target = fileStore.find((file) => file.id === fileId);

    if (!target) {
      throw new Error("File not found");
    }

    target.deletedAt = null;
    return target;
  }

  async moveFilesToTrashByTask(taskId: string) {
    const deletedAt = now();
    fileStore.forEach((file) => {
      if (file.taskId === taskId) {
        file.deletedAt = deletedAt;
      }
    });
  }

  async restoreFilesByTask(taskId: string) {
    fileStore.forEach((file) => {
      if (file.taskId === taskId) {
        file.deletedAt = null;
      }
    });
  }
}

export const memoryTaskRepository = new MemoryTaskRepository();
export const memoryFileRepository = new MemoryFileRepository();