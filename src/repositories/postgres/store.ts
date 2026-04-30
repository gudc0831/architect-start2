import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/api/errors";
import { buildProjectIssueId, buildProjectIssuePrefix } from "@/domains/task/identifiers";
import {
  canonicalizeTaskStatusHistory,
  DEFAULT_TASK_STATUS,
  normalizeTaskStatus,
} from "@/domains/task/status";
import type { QuickCreateWidthMap, TaskListLayoutPreference, ThemeId, ThemePreference } from "@/domains/preferences/types";
import {
  DEFAULT_THEME_ID,
  sanitizeQuickCreateWidths,
  sanitizeTaskListLayoutPreference,
  sanitizeThemeId,
} from "@/domains/preferences/types";
import { defaultProjectName } from "@/lib/runtime-config";
import { requireStoredTaskWorkTypeValue } from "@/lib/task-work-type-write";
import type {
  CreateFileInput,
  CreateTaskInput,
  FileRepository,
  PreferenceRepository,
  ProjectRepository,
  TaskOrderUpdateInput,
  TaskRepository,
  UpdateProjectInput,
  UpdateTaskInput,
  VersionedTaskUpdateInput,
} from "@/repositories/contracts";
import type { FileRecord, TaskFileSummary, TaskRecord } from "@/domains/task/types";
import type { ProjectRecord } from "@/domains/project/types";
import { storageProvider } from "@/storage";

function toProjectRecord(project: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    source: "postgres",
  };
}

function toTaskRecord(task: {
  id: string;
  projectId: string;
  taskNumber: number;
  actionId: number;
  issueId: string;
  parentTaskId: string | null;
  rootTaskId: string;
  depth: number;
  siblingOrder: number;
  dueDate: string;
  category: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requester: string;
  relatedDisciplines: string;
  assignee: string;
  assigneeProfileId: string | null;
  title: string;
  reviewedAt: string;
  createdAt: Date;
  createdBy: string | null;
  isDaily: boolean;
  locationRef: string;
  calendarLinked: boolean;
  description: string;
  status: string;
  statusHistory: string;
  conclusion: string;
  completedAt: Date | null;
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
}): TaskRecord {
  const status = normalizeTaskStatus(task.status, DEFAULT_TASK_STATUS);
  return {
    id: task.id,
    projectId: task.projectId,
    taskNumber: task.taskNumber,
    actionId: task.actionId || task.taskNumber,
    issueId: task.issueId || `#${task.actionId || task.taskNumber}`,
    parentTaskId: task.parentTaskId,
    rootTaskId: task.rootTaskId,
    depth: task.depth,
    siblingOrder: task.siblingOrder,
    dueDate: task.dueDate,
    workType: task.category,
    coordinationScope: task.coordinationScope,
    ownerDiscipline: task.ownerDiscipline,
    requestedBy: task.requester,
    relatedDisciplines: task.relatedDisciplines,
    assignee: task.assignee,
    assigneeProfileId: task.assigneeProfileId,
    issueTitle: task.title,
    reviewedAt: task.reviewedAt,
    createdAt: task.createdAt.toISOString().slice(0, 10),
    createdBy: task.createdBy,
    isDaily: task.isDaily,
    locationRef: task.locationRef,
    calendarLinked: task.calendarLinked,
    issueDetailNote: task.description,
    status,
    statusHistory: canonicalizeTaskStatusHistory(task.statusHistory, status, task.updatedAt.toISOString()),
    decision: task.conclusion,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    version: task.version,
    updatedAt: task.updatedAt.toISOString(),
    updatedBy: task.updatedBy,
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    purgedAt: task.purgedAt ? task.purgedAt.toISOString() : null,
  };
}

function toFileRecord(file: {
  id: string;
  taskId: string;
  projectId: string;
  fileGroupId: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: bigint;
  storageBucket: string;
  objectPath: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy: string | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
}): FileRecord {
  return {
    id: file.id,
    taskId: file.taskId,
    projectId: file.projectId,
    fileGroupId: file.fileGroupId,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    storageBucket: file.storageBucket,
    objectPath: file.objectPath,
    version: file.version,
    versionNumber: file.version,
    versionLabel: `v${file.version}`,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    uploadedBy: file.uploadedBy,
    deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
    purgedAt: file.purgedAt ? file.purgedAt.toISOString() : null,
  };
}

function applyTaskFileSummary(task: TaskRecord, fileSummaryByTaskId: Map<string, TaskFileSummary>): TaskRecord {
  return {
    ...task,
    fileSummary: fileSummaryByTaskId.get(task.id) ?? { count: 0, latestFileName: null },
  };
}

function buildTaskFileSummaryMap(files: FileRecord[]) {
  const summaryByTaskId = new Map<string, TaskFileSummary & { latestCreatedAt: string | null }>();

  for (const file of files) {
    const current = summaryByTaskId.get(file.taskId);
    if (!current) {
      summaryByTaskId.set(file.taskId, {
        count: 1,
        latestFileName: file.originalName,
        latestCreatedAt: file.createdAt,
      });
      continue;
    }

    summaryByTaskId.set(file.taskId, {
      count: current.count + 1,
      latestFileName:
        !current.latestCreatedAt || file.createdAt >= current.latestCreatedAt ? file.originalName : current.latestFileName,
      latestCreatedAt: !current.latestCreatedAt || file.createdAt >= current.latestCreatedAt ? file.createdAt : current.latestCreatedAt,
    });
  }

  return new Map(
    [...summaryByTaskId.entries()].map(([taskId, summary]) => [
      taskId,
      {
        count: summary.count,
        latestFileName: summary.latestFileName,
      },
    ]),
  );
}

function taskWriteData(input: UpdateTaskInput | CreateTaskInput) {
  const nextStatus = input.status === undefined ? undefined : normalizeTaskStatus(input.status, DEFAULT_TASK_STATUS);
  return {
    dueDate: input.dueDate ?? undefined,
    category: input.workType === undefined ? undefined : requireStoredTaskWorkTypeValue(input.workType),
    coordinationScope: input.coordinationScope ?? undefined,
    ownerDiscipline: input.ownerDiscipline ?? undefined,
    requester: input.requestedBy ?? undefined,
    relatedDisciplines: input.relatedDisciplines ?? undefined,
    assignee: input.assignee ?? undefined,
    assigneeProfileId: Object.prototype.hasOwnProperty.call(input, "assigneeProfileId")
      ? input.assigneeProfileId ?? null
      : undefined,
    title: input.issueTitle ?? "",
    reviewedAt: input.reviewedAt ?? undefined,
    locationRef: input.locationRef ?? undefined,
    calendarLinked: input.calendarLinked ?? undefined,
    description: input.issueDetailNote ?? undefined,
    status: nextStatus,
    statusHistory:
      nextStatus === undefined
        ? input.statusHistory ?? undefined
        : canonicalizeTaskStatusHistory(input.statusHistory, nextStatus) || undefined,
    conclusion: input.decision ?? undefined,
    completedAt: input.completedAt ? new Date(input.completedAt) : input.completedAt === null ? null : undefined,
  };
}

async function getOrCreateProject() {
  const existing = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.project.create({
    data: {
      name: defaultProjectName,
    },
  });
}

class PostgresProjectRepository implements ProjectRepository {
  async getProject() {
    const project = await getOrCreateProject();
    return toProjectRecord(project);
  }

  async updateProject(input: UpdateProjectInput) {
    const current = await getOrCreateProject();
    const updated = await prisma.project.update({
      where: { id: current.id },
      data: {
        name: input.name,
        updatedBy: input.updatedBy ?? null,
      },
    });

    return toProjectRecord(updated);
  }
}

class PostgresTaskRepository implements TaskRepository {
  async listActiveTasks(projectId?: string) {
    const project = projectId ? { id: projectId } : await getOrCreateProject();
    const [tasks, files] = await Promise.all([
      prisma.task.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          purgedAt: null,
        },
        orderBy: [{ siblingOrder: "asc" }, { actionId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.file.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          purgedAt: null,
        },
        orderBy: [{ fileGroupId: "asc" }, { version: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const latestByGroup = new Map<string, (typeof files)[number]>();
    for (const file of files) {
      if (!latestByGroup.has(file.fileGroupId)) {
        latestByGroup.set(file.fileGroupId, file);
      }
    }

    const fileSummaryByTaskId = buildTaskFileSummaryMap([...latestByGroup.values()].map(toFileRecord));
    return tasks.map((task) => applyTaskFileSummary(toTaskRecord(task), fileSummaryByTaskId));
  }

  async listTrashTasks(projectId?: string) {
    const project = projectId ? { id: projectId } : await getOrCreateProject();
    const [tasks, files] = await Promise.all([
      prisma.task.findMany({
        where: {
          projectId: project.id,
          deletedAt: { not: null },
          purgedAt: null,
        },
        orderBy: [{ deletedAt: "desc" }, { actionId: "asc" }],
      }),
      prisma.file.findMany({
        where: {
          projectId: project.id,
          deletedAt: { not: null },
          purgedAt: null,
        },
        orderBy: [{ deletedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const fileSummaryByTaskId = buildTaskFileSummaryMap(files.map(toFileRecord));
    return tasks.map((task) => applyTaskFileSummary(toTaskRecord(task), fileSummaryByTaskId));
  }

  async findTaskById(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    return task && !task.purgedAt ? toTaskRecord(task) : null;
  }

  async getNextTaskNumber(projectId: string) {
    const last = await prisma.task.findFirst({
      where: { projectId },
      orderBy: { taskNumber: "desc" },
      select: { taskNumber: true },
    });

    return (last?.taskNumber ?? 0) + 1;
  }

  async createTask(input: CreateTaskInput) {
    const id = randomUUID();
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(104729, hashtext(${input.projectId}))`);
      const last = await tx.task.findFirst({
        where: { projectId: input.projectId },
        orderBy: { taskNumber: "desc" },
        select: { taskNumber: true },
      });
      const taskNumber = (last?.taskNumber ?? 0) + 1;

      return tx.task.create({
        data: {
          id,
          projectId: input.projectId,
          taskNumber,
          actionId: taskNumber,
          parentTaskId: input.parentTaskId ?? null,
          rootTaskId: input.rootTaskId?.trim() || id,
          depth: input.depth ?? 0,
          siblingOrder: input.siblingOrder ?? 0,
          ...taskWriteData(input),
          issueId: buildProjectIssueId(input.projectName, taskNumber),
          createdAt,
          isDaily: input.isDaily,
          createdBy: input.createdBy ?? null,
          updatedBy: input.updatedBy ?? input.createdBy ?? null,
          purgedAt: null,
        },
      });
    });

    return toTaskRecord(record);
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    const { parentTaskNumber: _parentTaskNumber, updatedBy, ...data } = input;
    const record = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...taskWriteData(data as UpdateTaskInput),
        issueId: data.issueId ?? undefined,
        parentTaskId: data.parentTaskId,
        rootTaskId: data.rootTaskId,
        depth: data.depth,
        siblingOrder: data.siblingOrder,
        isDaily: data.isDaily,
        deletedAt: input.deletedAt === null ? null : input.deletedAt ? new Date(input.deletedAt) : undefined,
        purgedAt: input.purgedAt === null ? null : input.purgedAt ? new Date(input.purgedAt) : undefined,
        updatedBy: updatedBy ?? undefined,
        version: { increment: 1 },
      },
    });

    return toTaskRecord(record);
  }

  async updateTaskWithVersion(taskId: string, input: VersionedTaskUpdateInput) {
    const { expectedVersion, parentTaskNumber: _parentTaskNumber, updatedBy, ...data } = input;
    const result = await prisma.task.updateMany({
      where: {
        id: taskId,
        version: expectedVersion,
      },
      data: {
        ...taskWriteData(data as UpdateTaskInput),
        issueId: data.issueId ?? undefined,
        parentTaskId: data.parentTaskId,
        rootTaskId: data.rootTaskId,
        depth: data.depth,
        siblingOrder: data.siblingOrder,
        isDaily: data.isDaily,
        deletedAt: input.deletedAt === null ? null : input.deletedAt ? new Date(input.deletedAt) : undefined,
        purgedAt: input.purgedAt === null ? null : input.purgedAt ? new Date(input.purgedAt) : undefined,
        updatedBy: updatedBy ?? undefined,
        version: {
          increment: 1,
        },
      },
    });

    if (result.count === 0) {
      return null;
    }

    const record = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    return toTaskRecord(record);
  }

  async updateTaskOrders(inputs: ReadonlyArray<TaskOrderUpdateInput>) {
    if (inputs.length === 0) {
      return [];
    }

    const records = await prisma.$transaction(async (tx) => {
      const updated: Array<Parameters<typeof toTaskRecord>[0]> = [];

      for (const input of inputs) {
        const data = {
          siblingOrder: input.siblingOrder,
          updatedBy: input.updatedBy ?? undefined,
          version: { increment: 1 },
        };

        if (Number.isInteger(input.expectedVersion)) {
          const result = await tx.task.updateMany({
            where: { id: input.id, version: input.expectedVersion },
            data,
          });

          if (result.count === 0) {
            throw conflict(
              "Task order changed before this reorder could be saved. Reload the latest data and try again.",
              "TASK_REORDER_CONFLICT",
            );
          }
        } else {
          await tx.task.update({
            where: { id: input.id },
            data,
          });
        }

        const record = await tx.task.findUniqueOrThrow({ where: { id: input.id } });

        updated.push(record);
      }

      return updated;
    });

    return records.map(toTaskRecord);
  }

  async syncProjectTaskIssueIds(projectId: string, projectName: string, updatedBy?: string | null) {
    const issuePrefix = buildProjectIssuePrefix(projectName);
    const result = await prisma.$executeRaw(Prisma.sql`
      update tasks
      set
        issue_id = concat(${issuePrefix}, '-', lpad(task_number::text, 3, '0')),
        updated_at = now(),
        updated_by = coalesce(${updatedBy ?? null}, updated_by),
        version = version + 1
      where project_id = ${projectId}
        and purged_at is null
        and issue_id is distinct from concat(${issuePrefix}, '-', lpad(task_number::text, 3, '0'))
    `);

    return Number(result);
  }

  async moveTaskToTrash(taskId: string, updatedBy?: string | null) {
    const record = await prisma.task.update({
      where: { id: taskId },
      data: {
        deletedAt: new Date(),
        purgedAt: null,
        updatedBy: updatedBy ?? undefined,
        version: { increment: 1 },
      },
    });

    return toTaskRecord(record);
  }

  async restoreTask(taskId: string, updatedBy?: string | null) {
    const record = await prisma.task.update({
      where: { id: taskId },
      data: {
        deletedAt: null,
        purgedAt: null,
        updatedBy: updatedBy ?? undefined,
        version: { increment: 1 },
      },
    });

    return toTaskRecord(record);
  }

  async deleteTask(taskId: string) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        purgedAt: new Date(),
      },
    });
  }
}

class PostgresFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    const files = await prisma.file.findMany({
      where: {
        deletedAt: null,
        purgedAt: null,
        ...(taskId ? { taskId } : {}),
      },
      orderBy: [{ fileGroupId: "asc" }, { version: "desc" }, { createdAt: "desc" }],
    });

    const latestByGroup = new Map<string, (typeof files)[number]>();
    for (const file of files) {
      if (!latestByGroup.has(file.fileGroupId)) {
        latestByGroup.set(file.fileGroupId, file);
      }
    }

    return [...latestByGroup.values()].map((file) => toFileRecord(file));
  }

  async listTrashFiles(taskId?: string) {
    const files = await prisma.file.findMany({
      where: {
        deletedAt: { not: null },
        purgedAt: null,
        ...(taskId ? { taskId } : {}),
      },
      orderBy: [{ deletedAt: "desc" }, { createdAt: "desc" }],
    });

    return files.map((file) => toFileRecord(file));
  }

  async findFileById(fileId: string) {
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    return file && !file.purgedAt ? toFileRecord(file) : null;
  }

  async listFilesByTask(taskId: string) {
    const files = await prisma.file.findMany({
      where: { taskId, purgedAt: null },
      orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    });

    return files.map((file) => toFileRecord(file));
  }

  async attachFile(input: CreateFileInput) {
    const file = await prisma.file.create({
      data: {
        taskId: input.taskId,
        projectId: input.projectId,
        fileGroupId: input.fileGroupId ?? randomUUID(),
        originalName: input.originalName,
        mimeType: input.mimeType ?? null,
        sizeBytes: BigInt(input.sizeBytes),
        storageProvider: storageProvider.name,
        storageBucket: input.storageBucket,
        objectPath: input.objectPath,
        version: input.version ?? 1,
        uploadedBy: input.uploadedBy ?? null,
        purgedAt: null,
      },
    });

    return toFileRecord(file);
  }

  async moveFileToTrash(fileId: string) {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date(), purgedAt: null },
    });

    return toFileRecord(file);
  }

  async restoreFile(fileId: string) {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: null, purgedAt: null },
    });

    return toFileRecord(file);
  }

  async deleteFile(fileId: string) {
    await prisma.file.update({
      where: { id: fileId },
      data: {
        purgedAt: new Date(),
      },
    });
  }

  async moveFilesToTrashByTask(taskId: string) {
    await prisma.file.updateMany({
      where: { taskId, purgedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async restoreFilesByTask(taskId: string) {
    await prisma.file.updateMany({
      where: { taskId, purgedAt: null },
      data: { deletedAt: null },
    });
  }
}

class PostgresPreferenceRepository implements PreferenceRepository {
  async getQuickCreateWidths(profileId: string) {
    const record = await prisma.profilePreference.findUnique({
      where: { profileId },
      select: { quickCreateWidths: true },
    });

    return sanitizeQuickCreateWidths(record?.quickCreateWidths ?? {});
  }

  async saveQuickCreateWidths(profileId: string, widths: QuickCreateWidthMap) {
    const sanitized = sanitizeQuickCreateWidths(widths);
    const record = await prisma.profilePreference.upsert({
      where: { profileId },
      update: {
        quickCreateWidths: sanitized,
      },
      create: {
        profileId,
        quickCreateWidths: sanitized,
      },
      select: { quickCreateWidths: true },
    });

    return sanitizeQuickCreateWidths(record.quickCreateWidths);
  }

  async getTaskListLayout(profileId: string): Promise<TaskListLayoutPreference> {
    const record = await prisma.profilePreference.findUnique({
      where: { profileId },
      select: { taskListColumnWidths: true, taskListRowHeights: true, taskListDetailPanelWidth: true },
    });

    return sanitizeTaskListLayoutPreference({
      columnWidths: record?.taskListColumnWidths ?? {},
      rowHeights: record?.taskListRowHeights ?? {},
      detailPanelWidth: record?.taskListDetailPanelWidth,
    });
  }

  async saveTaskListLayout(profileId: string, layout: TaskListLayoutPreference) {
    const sanitized = sanitizeTaskListLayoutPreference(layout);
    const record = await prisma.profilePreference.upsert({
      where: { profileId },
      update: {
        taskListColumnWidths: sanitized.columnWidths,
        taskListRowHeights: sanitized.rowHeights,
        taskListDetailPanelWidth: sanitized.detailPanelWidth,
      },
      create: {
        profileId,
        taskListColumnWidths: sanitized.columnWidths,
        taskListRowHeights: sanitized.rowHeights,
        taskListDetailPanelWidth: sanitized.detailPanelWidth,
      },
      select: { taskListColumnWidths: true, taskListRowHeights: true, taskListDetailPanelWidth: true },
    });

    return sanitizeTaskListLayoutPreference({
      columnWidths: record.taskListColumnWidths,
      rowHeights: record.taskListRowHeights,
      detailPanelWidth: record.taskListDetailPanelWidth,
    });
  }

  async getThemePreference(profileId: string): Promise<ThemePreference> {
    const record = await prisma.profilePreference.findUnique({
      where: { profileId },
      select: { themeId: true },
    });

    return {
      themeId: sanitizeThemeId(record?.themeId ?? DEFAULT_THEME_ID),
    };
  }

  async saveThemePreference(profileId: string, themeId: ThemeId): Promise<ThemePreference> {
    const nextThemeId = sanitizeThemeId(themeId);
    const record = await prisma.profilePreference.upsert({
      where: { profileId },
      update: {
        themeId: nextThemeId,
      },
      create: {
        profileId,
        themeId: nextThemeId,
      },
      select: { themeId: true },
    });

    return {
      themeId: sanitizeThemeId(record.themeId),
    };
  }
}
export const postgresProjectRepository = new PostgresProjectRepository();
export const postgresTaskRepository = new PostgresTaskRepository();
export const postgresFileRepository = new PostgresFileRepository();
export const postgresPreferenceRepository = new PostgresPreferenceRepository();
