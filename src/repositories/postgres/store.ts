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
import type {
  AiSettingsPreference,
  QuickCreateWidthMap,
  TaskListLayoutPreference,
  ThemeId,
  ThemePreference,
} from "@/domains/preferences/types";
import {
  DEFAULT_THEME_ID,
  sanitizeQuickCreateWidths,
  sanitizeAiSettingsPreference,
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
  SearchFileAnalysesInput,
  SetTaskSiblingOrderInput,
  SetTaskUserSiblingOrderInput,
  TaskFileSummaryMap,
  TaskOrderUpdateInput,
  TaskRepository,
  TaskRepositoryCreateOptions,
  TaskUserOrderRecord,
  UpdateProjectInput,
  UpdateTaskInput,
  VersionedTaskUpdateInput,
} from "@/repositories/contracts";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import type { ProjectRecord } from "@/domains/project/types";
import { storageProvider } from "@/storage";
import { getFileAnalysisEntries, normalizeFileMetadata } from "@/domains/file/analysis";
import type { FileMetadata } from "@/domains/file/analysis";
import {
  buildFileAnalysisChunks,
  compareFileAnalysisSearchResults,
  rankFileAnalyses,
  scoreFileAnalysisMatch,
  tokenizeSearchText,
  type FileAnalysisSearchResult,
} from "@/domains/file/search";

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

function toTaskUserOrderRecord(order: {
  projectId: string;
  profileId: string;
  taskId: string;
  parentTaskId: string | null;
  siblingOrder: number;
  updatedAt: Date;
}): TaskUserOrderRecord {
  return {
    projectId: order.projectId,
    profileId: order.profileId,
    taskId: order.taskId,
    parentTaskId: order.parentTaskId,
    siblingOrder: order.siblingOrder,
    updatedAt: order.updatedAt.toISOString(),
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
  metadata: Prisma.JsonValue;
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
    metadata: normalizeFileMetadata(file.metadata),
  };
}

type PostgresFileAnalysisSearchRow = {
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
  metadata: Prisma.JsonValue;
  analysis: Prisma.JsonValue;
  ftsRank: number | null;
  analysisId?: string | null;
  chunkText?: string | null;
  vectorDistance?: number | null;
};
type PostgresTaskFileSummaryRow = {
  taskId: string;
  count: number | bigint;
  latestFileName: string | null;
};

function normalizeQueryEmbeddingLiteral(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1536) {
    return null;
  }

  const normalized = value.map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.max(-1, Math.min(1, item)) : 0));
  return `[${normalized.join(",")}]`;
}

function scoreChunkText(value: string, query: string) {
  const terms = tokenizeSearchText(query);
  if (terms.length === 0 || !value) {
    return 0;
  }

  const haystack = value.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1.2 : 0), 0);
}

async function syncFileAnalysisChunks(file: FileRecord) {
  const chunks = getFileAnalysisEntries(file.metadata).flatMap((analysis) => buildFileAnalysisChunks(file, analysis));

  try {
    if (chunks.length === 0) {
      await prisma.$executeRaw(Prisma.sql`delete from file_analysis_chunks where file_id = ${file.id}::uuid`);
      return;
    }

    await prisma.$executeRaw(Prisma.sql`
      delete from file_analysis_chunks existing
      where existing.file_id = ${file.id}::uuid
        and not exists (
          select 1
          from (values ${Prisma.join(chunks.map((chunk) => Prisma.sql`(${chunk.analysisId}, ${chunk.chunkIndex}, ${chunk.tokenHash})`))})
            as incoming(analysis_id, chunk_index, token_hash)
          where incoming.analysis_id = existing.analysis_id
            and incoming.chunk_index = existing.chunk_index
            and incoming.token_hash = existing.token_hash
        )
    `);

    await prisma.$executeRaw(Prisma.sql`
      insert into file_analysis_chunks (
        file_id,
        project_id,
        task_id,
        analysis_id,
        chunk_index,
        text,
        token_hash,
        metadata
      )
      values ${Prisma.join(
        chunks.map((chunk) => Prisma.sql`(
          ${chunk.fileId}::uuid,
          ${chunk.projectId}::uuid,
          ${chunk.taskId}::uuid,
          ${chunk.analysisId},
          ${chunk.chunkIndex},
          ${chunk.text},
          ${chunk.tokenHash},
          ${JSON.stringify(chunk.metadata)}::jsonb
        )`),
      )}
      on conflict (file_id, analysis_id, chunk_index)
      do update set
        text = excluded.text,
        token_hash = excluded.token_hash,
        metadata = excluded.metadata,
        updated_at = now()
    `);
  } catch {
    // The chunk table is created by the cloud migration. Local/dev stores keep the metadata-only fallback.
  }
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
    title: input.issueTitle === undefined ? undefined : input.issueTitle,
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
    const tasks = await prisma.task.findMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        purgedAt: null,
      },
      orderBy: [{ siblingOrder: "asc" }, { actionId: "asc" }, { createdAt: "asc" }],
    });

    return tasks.map(toTaskRecord);
  }

  async listTrashTasks(projectId?: string) {
    const project = projectId ? { id: projectId } : await getOrCreateProject();
    const tasks = await prisma.task.findMany({
      where: {
        projectId: project.id,
        deletedAt: { not: null },
        purgedAt: null,
      },
      orderBy: [{ deletedAt: "desc" }, { actionId: "asc" }],
    });

    return tasks.map(toTaskRecord);
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

  async createTask(input: CreateTaskInput, options: TaskRepositoryCreateOptions = {}) {
    const recordTiming = options.recordTiming;
    const id = input.id ?? randomUUID();
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const record = await prisma.$transaction(async (tx) => {
      if (input.id) {
        const existingStart = performance.now();
        const existing = await tx.task.findUnique({ where: { id } });
        recordTiming?.("repository.existingIdLookup", performance.now() - existingStart);
        if (existing && !existing.purgedAt) {
          return existing;
        }
      }

      const taskNumberStart = performance.now();
      const [taskNumberRow] = await tx.$queryRaw<{ taskNumber: number }[]>(Prisma.sql`
        with lock as (
          select pg_advisory_xact_lock(104729, hashtext(${input.projectId}))
        )
        select coalesce(max(t.task_number), 0) + 1 as "taskNumber"
        from lock
        left join tasks t on t.project_id = ${input.projectId}::uuid
      `);
      recordTiming?.("repository.lockAndTaskNumberLookup", performance.now() - taskNumberStart);
      const taskNumber = Number(taskNumberRow?.taskNumber ?? 1);
      const parentTaskId = input.parentTaskId ?? null;
      const siblingOrderStart = performance.now();
      const siblingOrder =
        input.siblingOrder ??
        ((await tx.task.aggregate({
          where: {
            projectId: input.projectId,
            parentTaskId,
            deletedAt: null,
            purgedAt: null,
          },
          _max: { siblingOrder: true },
        }))._max.siblingOrder ?? -1) + 1;
      recordTiming?.("repository.siblingOrderAggregate", performance.now() - siblingOrderStart);

      const insertStart = performance.now();
      const created = await tx.task.create({
        data: {
          id,
          projectId: input.projectId,
          taskNumber,
          actionId: taskNumber,
          parentTaskId,
          rootTaskId: input.rootTaskId?.trim() || id,
          depth: input.depth ?? 0,
          siblingOrder,
          ...taskWriteData(input),
          title: input.issueTitle,
          issueId: buildProjectIssueId(input.projectName, taskNumber),
          createdAt,
          isDaily: input.isDaily,
          createdBy: input.createdBy ?? null,
          updatedBy: input.updatedBy ?? input.createdBy ?? null,
          purgedAt: null,
        },
      });
      recordTiming?.("repository.insert", performance.now() - insertStart);
      return created;
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

  async setTaskSiblingOrder(input: SetTaskSiblingOrderInput) {
    const orderedTaskIds = [...new Set(input.orderedTaskIds.filter(Boolean))];
    if (orderedTaskIds.length === 0) {
      return [];
    }

    const siblingOrderStart =
      Number.isInteger(input.siblingOrderStart) && (input.siblingOrderStart ?? 0) >= 0 ? input.siblingOrderStart ?? 0 : 0;
    const inputRows = Prisma.join(
      orderedTaskIds.map(
        (taskId, index) => Prisma.sql`(${taskId}::uuid, ${siblingOrderStart + index}::integer)`,
      ),
    );
    const parentPredicate = input.parentTaskId
      ? Prisma.sql`t.parent_task_id = ${input.parentTaskId}::uuid`
      : Prisma.sql`t.parent_task_id is null`;
    const result = await prisma.$queryRaw<Array<{ eligible_count: number; input_count: number; updated_count: number }>>`
      with settings as materialized (
        select
          set_config('lock_timeout', '15000ms', true) as lock_timeout,
          set_config('statement_timeout', '24000ms', true) as statement_timeout
      ),
      input(id, sibling_order) as (
        values ${inputRows}
      ),
      eligible as (
        select t.id
        from tasks as t
        join input on input.id = t.id
        cross join settings
        where t.project_id = ${input.projectId}::uuid
          and ${parentPredicate}
          and t.deleted_at is null
          and t.purged_at is null
      ),
      updated as (
        update tasks as t
        set
          sibling_order = input.sibling_order,
          updated_by = coalesce(${input.updatedBy ?? null}::uuid, t.updated_by),
          version = t.version + 1,
          updated_at = now()
        from input, settings
        where t.id = input.id
          and (select count(*) from eligible) = (select count(*) from input)
          and t.sibling_order is distinct from input.sibling_order
        returning t.id
      )
      select
        (select count(*)::integer from eligible) as eligible_count,
        (select count(*)::integer from input) as input_count,
        (select count(*)::integer from updated) as updated_count
    `;

    const summary = result[0];
    if (!summary || summary.eligible_count !== summary.input_count) {
      throw conflict(
        "Task order changed before this reorder could be saved. Reload the latest data and try again.",
        "TASK_REORDER_CONFLICT",
      );
    }

    return [];
  }

  async listTaskUserOrders(projectId: string, profileId: string) {
    const rows = await prisma.taskUserOrder.findMany({
      where: {
        projectId,
        profileId,
      },
    });

    return rows.map(toTaskUserOrderRecord);
  }

  async setTaskUserSiblingOrder(input: SetTaskUserSiblingOrderInput) {
    const orderedTaskIds = [...new Set(input.orderedTaskIds.filter(Boolean))];
    if (orderedTaskIds.length === 0) {
      return [];
    }

    const siblingOrderStart =
      Number.isInteger(input.siblingOrderStart) && (input.siblingOrderStart ?? 0) >= 0 ? input.siblingOrderStart ?? 0 : 0;
    const inputRows = Prisma.join(
      orderedTaskIds.map((taskId, index) => Prisma.sql`(${taskId}::uuid, ${siblingOrderStart + index}::integer)`),
    );
    const parentPredicate = input.parentTaskId
      ? Prisma.sql`t.parent_task_id = ${input.parentTaskId}::uuid`
      : Prisma.sql`t.parent_task_id is null`;
    const parentTaskIdValue = input.parentTaskId ? Prisma.sql`${input.parentTaskId}::uuid` : Prisma.sql`null::uuid`;
    const result = await prisma.$queryRaw<Array<{ eligible_count: number; input_count: number; upserted_count: number }>>`
      with input(id, sibling_order) as (
        values ${inputRows}
      ),
      eligible as (
        select t.id, input.sibling_order
        from tasks as t
        join input on input.id = t.id
        where t.project_id = ${input.projectId}::uuid
          and ${parentPredicate}
          and t.deleted_at is null
          and t.purged_at is null
      ),
      upserted as (
        insert into task_user_orders (
          project_id,
          profile_id,
          task_id,
          parent_task_id,
          sibling_order,
          created_at,
          updated_at
        )
        select
          ${input.projectId}::uuid,
          ${input.profileId}::uuid,
          eligible.id,
          ${parentTaskIdValue},
          eligible.sibling_order,
          now(),
          now()
        from eligible
        where (select count(*) from eligible) = (select count(*) from input)
        on conflict (project_id, profile_id, task_id)
        do update set
          parent_task_id = excluded.parent_task_id,
          sibling_order = excluded.sibling_order,
          updated_at = now()
        returning task_id
      )
      select
        (select count(*)::integer from eligible) as eligible_count,
        (select count(*)::integer from input) as input_count,
        (select count(*)::integer from upserted) as upserted_count
    `;

    const summary = result[0];
    if (!summary || summary.eligible_count !== summary.input_count || summary.upserted_count !== summary.input_count) {
      throw conflict(
        "Task order changed before this reorder could be saved. Reload the latest data and try again.",
        "TASK_REORDER_CONFLICT",
      );
    }

    return this.listTaskUserOrders(input.projectId, input.profileId);
  }

  async updateTaskOrders(inputs: ReadonlyArray<TaskOrderUpdateInput>) {
    if (inputs.length === 0) {
      return [];
    }

    const inputRows = Prisma.join(
      inputs.map((input) => {
        const hasExpectedVersion = Number.isInteger(input.expectedVersion);
        return Prisma.sql`(${input.id}::uuid, ${input.siblingOrder}::integer, ${input.updatedBy ?? null}::uuid, ${
          hasExpectedVersion ? input.expectedVersion : null
        }::integer, ${hasExpectedVersion}::boolean)`;
      }),
    );
    const updatedIds = await prisma.$queryRaw<Array<{ id: string }>>`
      with input(id, sibling_order, updated_by, expected_version, has_expected_version) as (
        values ${inputRows}
      ),
      eligible as (
        select t.id
        from tasks as t
        join input on input.id = t.id
        where not input.has_expected_version or t.version = input.expected_version
      ),
      updated as (
        update tasks as t
        set
          sibling_order = input.sibling_order,
          updated_by = coalesce(input.updated_by, t.updated_by),
          version = t.version + 1,
          updated_at = now()
        from input
        where t.id = input.id
          and (select count(*) from eligible) = (select count(*) from input)
          and (not input.has_expected_version or t.version = input.expected_version)
        returning t.id
      )
      select id from updated
    `;

    if (updatedIds.length !== inputs.length) {
      throw conflict(
        "Task order changed before this reorder could be saved. Reload the latest data and try again.",
        "TASK_REORDER_CONFLICT",
      );
    }

    const updated = await prisma.task.findMany({
      where: { id: { in: inputs.map((input) => input.id) } },
    });
    const updatedById = new Map(updated.map((record) => [record.id, record]));
    const records = inputs.map((input) => {
      const record = updatedById.get(input.id);
      if (!record) {
        throw conflict(
          "Task order changed before this reorder could be saved. Reload the latest data and try again.",
          "TASK_REORDER_CONFLICT",
        );
      }
      return record;
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

  async listFilesByProject(projectId: string) {
    const files = await prisma.file.findMany({
      where: { projectId, deletedAt: null, purgedAt: null },
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

  async listFileSummaryByProject(projectId: string, scope: "active" | "trash" = "active"): Promise<TaskFileSummaryMap> {
    const rows =
      scope === "trash"
        ? await prisma.$queryRaw<PostgresTaskFileSummaryRow[]>(Prisma.sql`
            select
              f.task_id as "taskId",
              count(*)::int as "count",
              (array_agg(f.original_name order by f.created_at desc))[1] as "latestFileName"
            from files f
            where f.project_id = ${projectId}::uuid
              and f.deleted_at is not null
              and f.purged_at is null
            group by f.task_id
          `)
        : await prisma.$queryRaw<PostgresTaskFileSummaryRow[]>(Prisma.sql`
            with latest_files as (
              select distinct on (f.file_group_id)
                f.task_id,
                f.original_name,
                f.created_at
              from files f
              where f.project_id = ${projectId}::uuid
                and f.deleted_at is null
                and f.purged_at is null
              order by f.file_group_id, f.version desc, f.created_at desc
            )
            select
              task_id as "taskId",
              count(*)::int as "count",
              (array_agg(original_name order by created_at desc))[1] as "latestFileName"
            from latest_files
            group by task_id
          `);

    return Object.fromEntries(
      rows.map((row) => [
        row.taskId,
        {
          count: Number(row.count),
          latestFileName: row.latestFileName,
        },
      ]),
    );
  }

  async searchFileAnalyses(input: SearchFileAnalysesInput) {
    const limit = Math.max(0, input.limit ?? 4);
    if (limit === 0 || tokenizeSearchText(input.query).length === 0) {
      return [];
    }

    const chunkResults = await this.searchFileAnalysisChunks(input, limit);
    if (chunkResults.length > 0) {
      return chunkResults;
    }

    try {
      const rows = await prisma.$queryRaw<PostgresFileAnalysisSearchRow[]>(Prisma.sql`
        with latest_files as (
          select distinct on (f.file_group_id)
            f.id,
            f.task_id as "taskId",
            f.project_id as "projectId",
            f.file_group_id as "fileGroupId",
            f.original_name as "originalName",
            f.mime_type as "mimeType",
            f.size_bytes as "sizeBytes",
            f.storage_bucket as "storageBucket",
            f.object_path as "objectPath",
            f.version,
            f.created_at as "createdAt",
            f.updated_at as "updatedAt",
            f.uploaded_by as "uploadedBy",
            f.deleted_at as "deletedAt",
            f.purged_at as "purgedAt",
            f.metadata
          from files f
          where f.project_id = ${input.projectId}::uuid
            and f.deleted_at is null
            and f.purged_at is null
          order by f.file_group_id, f.version desc, f.created_at desc
        ),
        analysis_entries as (
          select
            latest_files.*,
            analysis.value as analysis,
            concat_ws(
              ' ',
              latest_files."originalName",
              analysis.value->>'summary',
              analysis.value->>'extractedText',
              (analysis.value->'tags')::text
            ) as search_text
          from latest_files
          cross join lateral jsonb_array_elements(coalesce(latest_files.metadata->'analysis', '[]'::jsonb)) as analysis(value)
          where coalesce(analysis.value->>'verificationState', 'unverified') <> 'rejected'
            and (
              coalesce(analysis.value->>'summary', '') <> ''
              or coalesce(analysis.value->>'extractedText', '') <> ''
            )
        )
        select
          id,
          "taskId",
          "projectId",
          "fileGroupId",
          "originalName",
          "mimeType",
          "sizeBytes",
          "storageBucket",
          "objectPath",
          version,
          "createdAt",
          "updatedAt",
          "uploadedBy",
          "deletedAt",
          "purgedAt",
          metadata,
          analysis,
          ts_rank_cd(to_tsvector('simple', search_text), plainto_tsquery('simple', ${input.query}))::float as "ftsRank"
        from analysis_entries
        order by "ftsRank" desc, "updatedAt" desc
        limit ${Math.min(200, Math.max(50, limit * 12))}
      `);
      const excludedFileIds = new Set(input.excludedFileIds ?? []);
      const results = rows
        .filter((row) => !excludedFileIds.has(row.id))
        .map((row): FileAnalysisSearchResult | null => {
          const file = toFileRecord(row);
          const analysis = getFileAnalysisEntries({ analysis: [row.analysis] })[0];
          if (!analysis) {
            return null;
          }

          const lexicalScore = scoreFileAnalysisMatch(file, analysis, input.query);
          const ftsRank = Math.max(0, Number(row.ftsRank ?? 0));
          const score = lexicalScore.score + ftsRank * 12;
          if (score <= 0) {
            return null;
          }

          return {
            file,
            analysis,
            score,
            matchedTerms: lexicalScore.matchedTerms,
            mode: ftsRank > 0 ? "text_hybrid" : "lexical",
          };
        })
        .filter((result): result is FileAnalysisSearchResult => Boolean(result))
        .sort(compareFileAnalysisSearchResults)
        .slice(0, limit);

      return results;
    } catch {
      return rankFileAnalyses({
        files: await this.listFilesByProject(input.projectId),
        query: input.query,
        excludedFileIds: input.excludedFileIds,
        limit,
        mode: "lexical",
      });
    }
  }

  private async searchFileAnalysisChunks(input: SearchFileAnalysesInput, limit: number) {
    const queryVector = normalizeQueryEmbeddingLiteral(input.queryEmbedding);
    const vectorDistanceSelect = queryVector
      ? Prisma.sql`, min(c.embedding <=> ${queryVector}::vector)::float as "vectorDistance"`
      : Prisma.sql`, null::float as "vectorDistance"`;
    const vectorCandidatePredicate = queryVector ? Prisma.sql`or c.embedding is not null` : Prisma.sql``;

    try {
      const rows = await prisma.$queryRaw<PostgresFileAnalysisSearchRow[]>(Prisma.sql`
        with latest_files as (
          select distinct on (f.file_group_id)
            f.id,
            f.task_id as "taskId",
            f.project_id as "projectId",
            f.file_group_id as "fileGroupId",
            f.original_name as "originalName",
            f.mime_type as "mimeType",
            f.size_bytes as "sizeBytes",
            f.storage_bucket as "storageBucket",
            f.object_path as "objectPath",
            f.version,
            f.created_at as "createdAt",
            f.updated_at as "updatedAt",
            f.uploaded_by as "uploadedBy",
            f.deleted_at as "deletedAt",
            f.purged_at as "purgedAt",
            f.metadata
          from files f
          where f.project_id = ${input.projectId}::uuid
            and f.deleted_at is null
            and f.purged_at is null
          order by f.file_group_id, f.version desc, f.created_at desc
        ),
        chunk_matches as (
          select
            latest_files.id,
            latest_files."taskId",
            latest_files."projectId",
            latest_files."fileGroupId",
            latest_files."originalName",
            latest_files."mimeType",
            latest_files."sizeBytes",
            latest_files."storageBucket",
            latest_files."objectPath",
            latest_files.version,
            latest_files."createdAt",
            latest_files."updatedAt",
            latest_files."uploadedBy",
            latest_files."deletedAt",
            latest_files."purgedAt",
            latest_files.metadata,
            c.analysis_id as "analysisId",
            string_agg(c.text, ' ' order by c.chunk_index) as "chunkText",
            max(ts_rank_cd(to_tsvector('simple', c.text), plainto_tsquery('simple', ${input.query})))::float as "ftsRank"
            ${vectorDistanceSelect}
          from latest_files
          join file_analysis_chunks c on c.file_id = latest_files.id
          where c.project_id = ${input.projectId}::uuid
            and (
              to_tsvector('simple', c.text) @@ plainto_tsquery('simple', ${input.query})
              ${vectorCandidatePredicate}
            )
          group by
            latest_files.id,
            latest_files."taskId",
            latest_files."projectId",
            latest_files."fileGroupId",
            latest_files."originalName",
            latest_files."mimeType",
            latest_files."sizeBytes",
            latest_files."storageBucket",
            latest_files."objectPath",
            latest_files.version,
            latest_files."createdAt",
            latest_files."updatedAt",
            latest_files."uploadedBy",
            latest_files."deletedAt",
            latest_files."purgedAt",
            latest_files.metadata,
            c.analysis_id
        )
        select
          id,
          "taskId",
          "projectId",
          "fileGroupId",
          "originalName",
          "mimeType",
          "sizeBytes",
          "storageBucket",
          "objectPath",
          version,
          "createdAt",
          "updatedAt",
          "uploadedBy",
          "deletedAt",
          "purgedAt",
          metadata,
          null::jsonb as analysis,
          "analysisId",
          "chunkText",
          "ftsRank",
          "vectorDistance"
        from chunk_matches
        order by coalesce("vectorDistance", 99) asc, "ftsRank" desc, "updatedAt" desc
        limit ${Math.min(200, Math.max(50, limit * 12))}
      `);

      const excludedFileIds = new Set(input.excludedFileIds ?? []);
      return rows
        .filter((row) => !excludedFileIds.has(row.id))
        .map((row): FileAnalysisSearchResult | null => {
          const file = toFileRecord(row);
          const analysis = getFileAnalysisEntries(file.metadata).find((entry) => entry.id === row.analysisId);
          if (!analysis) {
            return null;
          }

          const lexicalScore = scoreFileAnalysisMatch(file, analysis, input.query);
          const chunkScore = scoreChunkText(row.chunkText ?? "", input.query);
          const ftsRank = Math.max(0, Number(row.ftsRank ?? 0));
          const vectorDistance = typeof row.vectorDistance === "number" && Number.isFinite(row.vectorDistance) ? row.vectorDistance : null;
          const vectorScore = vectorDistance === null ? 0 : Math.max(0, 1 - vectorDistance) * 8;
          const score = lexicalScore.score + chunkScore + ftsRank * 16 + vectorScore;
          if (score <= 0) {
            return null;
          }

          return {
            file,
            analysis,
            score,
            matchedTerms: lexicalScore.matchedTerms,
            mode: vectorDistance === null ? "text_hybrid" : "vector_hybrid",
          };
        })
        .filter((result): result is FileAnalysisSearchResult => Boolean(result))
        .sort(compareFileAnalysisSearchResults)
        .slice(0, limit);
    } catch {
      return [];
    }
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
        metadata: {},
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

  async updateFileMetadata(fileId: string, metadata: FileMetadata) {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: {
        metadata: normalizeFileMetadata(metadata) as Prisma.InputJsonValue,
      },
    });

    const record = toFileRecord(file);
    await syncFileAnalysisChunks(record);
    return record;
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

  async getAiSettingsPreference(profileId: string): Promise<AiSettingsPreference> {
    const record = await prisma.profilePreference.findUnique({
      where: { profileId },
      select: {
        aiDefaultModel: true,
        aiReasoningEffort: true,
        aiServiceTier: true,
        aiRequestTimeoutMs: true,
        aiLocalUsageDefaultRangeDays: true,
        aiLocalCodexNoHistory: true,
      },
    });

    return sanitizeAiSettingsPreference(record ?? {});
  }

  async saveAiSettingsPreference(profileId: string, preference: AiSettingsPreference): Promise<AiSettingsPreference> {
    const sanitized = sanitizeAiSettingsPreference(preference);
    const record = await prisma.profilePreference.upsert({
      where: { profileId },
      update: sanitized,
      create: {
        profileId,
        ...sanitized,
      },
      select: {
        aiDefaultModel: true,
        aiReasoningEffort: true,
        aiServiceTier: true,
        aiRequestTimeoutMs: true,
        aiLocalUsageDefaultRangeDays: true,
        aiLocalCodexNoHistory: true,
      },
    });

    return sanitizeAiSettingsPreference(record);
  }
}
export const postgresProjectRepository = new PostgresProjectRepository();
export const postgresTaskRepository = new PostgresTaskRepository();
export const postgresFileRepository = new PostgresFileRepository();
export const postgresPreferenceRepository = new PostgresPreferenceRepository();
