import * as Y from "yjs";
import { Prisma } from "@prisma/client";
import {
  MAX_CELL_SNAPSHOT_BYTES,
  MAX_CELL_UPDATE_BYTES,
  TASK_CELL_TEXT_FIELD_TO_COLUMN,
  assertTaskCellDocumentFieldKey,
  getTaskCellDocumentType,
  isTextCellDocumentField,
  readTaskProjectionText,
  type TaskCellDocumentFieldKey,
  type TextCellDocumentFieldKey,
} from "@/domains/task/cell-documents";
import { badRequest, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

const MAX_RETAINED_CELL_UPDATES = 100;
const MAX_CELL_DOCUMENT_UPDATE_ATTEMPTS = 4;
const CELL_DOCUMENT_TRANSACTION_MAX_WAIT_MS = 10_000;
const CELL_DOCUMENT_TRANSACTION_TIMEOUT_MS = 20_000;
const CELL_DOCUMENT_RETRY_BASE_DELAY_MS = 75;

type TaskCellDocumentCatchUpUpdate = {
  id: string;
  clientUpdateId: string;
  actorProfileId: string;
  documentVersion: number;
  updateBase64: string;
  createdAt: string;
};

type TaskCellDocumentSnapshot = {
  id: string;
  projectId: string;
  taskId: string;
  fieldKey: TaskCellDocumentFieldKey;
  docType: string;
  version: number;
  plainText: string;
  scalarValueJson: unknown;
  yStateBase64: string | null;
  catchUpMode: "current" | "snapshot" | "updates";
  diffUpdateBase64: string | null;
  updates: TaskCellDocumentCatchUpUpdate[];
  updatedAt: string;
};

class TaskCellDocumentConcurrentUpdateError extends Error {
  constructor() {
    super("Task cell document concurrent update retry required.");
  }
}

type TaskProjectionForCell = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  conclusion: string;
};

export async function getTaskCellDocument(input: {
  projectId: string;
  taskId: string;
  fieldKey: string;
  knownVersion?: number | null;
  stateVectorBase64?: string | null;
}): Promise<TaskCellDocumentSnapshot> {
  const fieldKey = assertTaskCellDocumentFieldKey(input.fieldKey);
  const task = await findTaskProjection(input.projectId, input.taskId);
  const document = await ensureTaskCellDocument(input.projectId, task, fieldKey);
  const knownVersion = normalizeKnownVersion(input.knownVersion);
  const updates = knownVersion !== null ? await listCatchUpUpdates(document.id, knownVersion, document.version) : [];
  const diffUpdateBase64 = input.stateVectorBase64
    ? buildYStateDiffBase64(document.yState, input.stateVectorBase64)
    : null;

  return toTaskCellDocumentSnapshot(document, {
    diffUpdateBase64,
    knownVersion,
    updates,
  });
}

export async function applyTaskCellDocumentUpdate(input: {
  projectId: string;
  taskId: string;
  fieldKey: string;
  actorProfileId: string;
  clientUpdateId: string;
  updateBase64: string;
}): Promise<TaskCellDocumentSnapshot> {
  const fieldKey = assertTaskCellDocumentFieldKey(input.fieldKey);
  if (!isTextCellDocumentField(fieldKey)) {
    throw badRequest("Scalar cell document updates are not enabled yet.", "TASK_CELL_DOCUMENT_SCALAR_UPDATE_UNSUPPORTED");
  }

  const clientUpdateId = input.clientUpdateId.trim();
  if (!clientUpdateId) {
    throw badRequest("clientUpdateId is required.", "TASK_CELL_DOCUMENT_CLIENT_UPDATE_ID_REQUIRED");
  }

  const updatePayload = decodeBase64Bytes(input.updateBase64, "TASK_CELL_DOCUMENT_UPDATE_INVALID");
  if (updatePayload.byteLength === 0 || updatePayload.byteLength > MAX_CELL_UPDATE_BYTES) {
    throw badRequest("Cell document update size is invalid.", "TASK_CELL_DOCUMENT_UPDATE_SIZE_INVALID");
  }

  for (let attempt = 0; attempt < MAX_CELL_DOCUMENT_UPDATE_ATTEMPTS; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: {
        id: input.taskId,
        projectId: input.projectId,
        deletedAt: null,
        purgedAt: null,
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        conclusion: true,
      },
    });

    if (!task) {
      throw notFound("Task not found", "TASK_NOT_FOUND");
    }

    await tx.$executeRaw(
      Prisma.sql`select pg_advisory_xact_lock(209759, hashtext(${buildTaskCellDocumentLockKey(input.projectId, input.taskId, fieldKey)}))`,
    );

    await tx.taskCellDocument.createMany({
      data: [buildInitialTaskCellDocumentCreateInput(input.projectId, task, fieldKey, input.actorProfileId)],
      skipDuplicates: true,
    });

    const lockedDocumentRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        select id::text
        from task_cell_documents
        where project_id = ${input.projectId}::uuid
          and task_id = ${input.taskId}::uuid
          and field_key = ${fieldKey}
        for update
      `,
    );
    const lockedDocumentId = lockedDocumentRows[0]?.id;
    if (!lockedDocumentId) {
      throw new Error("Task cell document row lock failed.");
    }

    const document = await tx.taskCellDocument.findUniqueOrThrow({
      where: { id: lockedDocumentId },
    });

    const duplicateUpdate = await tx.taskCellUpdate.findUnique({
      where: {
        cellDocumentId_clientUpdateId: {
          cellDocumentId: document.id,
          clientUpdateId,
        },
      },
    });

    if (duplicateUpdate) {
      return document;
    }

    const nextDocumentVersion = document.version + 1;
    const nextDocumentState = applyYTextUpdate(document.yState, updatePayload);
    const projectionColumn = TASK_CELL_TEXT_FIELD_TO_COLUMN[fieldKey];

    await tx.taskCellUpdate.create({
      data: {
        projectId: input.projectId,
        cellDocumentId: document.id,
        clientUpdateId,
        actorProfileId: input.actorProfileId,
        documentVersion: nextDocumentVersion,
        updatePayload,
      },
    });

    const updatedDocumentResult = await tx.taskCellDocument.updateMany({
      where: { id: document.id, version: document.version },
      data: {
        yState: nextDocumentState.yState,
        plainText: nextDocumentState.plainText,
        version: { increment: 1 },
        updatedBy: input.actorProfileId,
      },
    });
    if (updatedDocumentResult.count !== 1) {
      throw new TaskCellDocumentConcurrentUpdateError();
    }
    const updatedDocument = await tx.taskCellDocument.findUniqueOrThrow({
      where: { id: document.id },
    });

    await pruneTaskCellDocumentUpdates(tx, document.id);

    await tx.task.updateMany({
      where: {
        id: input.taskId,
        projectId: input.projectId,
      },
      data: {
        [projectionColumn]: nextDocumentState.plainText,
        updatedBy: input.actorProfileId,
        version: { increment: 1 },
      },
    });

    return updatedDocument;
      }, {
        maxWait: CELL_DOCUMENT_TRANSACTION_MAX_WAIT_MS,
        timeout: CELL_DOCUMENT_TRANSACTION_TIMEOUT_MS,
      });

      return toTaskCellDocumentSnapshot(result);
    } catch (error) {
      if (isRetryableTaskCellDocumentUpdateError(error) && attempt < MAX_CELL_DOCUMENT_UPDATE_ATTEMPTS - 1) {
        await sleep(CELL_DOCUMENT_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw new TaskCellDocumentConcurrentUpdateError();
}

async function listCatchUpUpdates(documentId: string, knownVersion: number, currentVersion: number) {
  if (knownVersion >= currentVersion) {
    return [];
  }

  const expectedGap = currentVersion - knownVersion;
  if (expectedGap > MAX_RETAINED_CELL_UPDATES) {
    return [];
  }

  const updates = await prisma.taskCellUpdate.findMany({
    where: {
      cellDocumentId: documentId,
      documentVersion: { gt: knownVersion },
    },
    orderBy: [{ documentVersion: "asc" }, { createdAt: "asc" }],
    take: MAX_RETAINED_CELL_UPDATES + 1,
  });

  return updates.length === expectedGap ? updates : [];
}

async function pruneTaskCellDocumentUpdates(tx: Prisma.TransactionClient, documentId: string) {
  await tx.$executeRaw(Prisma.sql`
    delete from task_cell_updates
    where cell_document_id = ${documentId}::uuid
      and id not in (
        select id
        from task_cell_updates
        where cell_document_id = ${documentId}::uuid
        order by document_version desc, created_at desc
        limit ${MAX_RETAINED_CELL_UPDATES}
      )
  `);
}

function buildTaskCellDocumentLockKey(projectId: string, taskId: string, fieldKey: TaskCellDocumentFieldKey) {
  return `${projectId}:${taskId}:${fieldKey}`;
}

async function findTaskProjection(projectId: string, taskId: string): Promise<TaskProjectionForCell> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
      deletedAt: null,
      purgedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      description: true,
      conclusion: true,
    },
  });

  if (!task) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  return task;
}

async function ensureTaskCellDocument(projectId: string, task: TaskProjectionForCell, fieldKey: TaskCellDocumentFieldKey) {
  const existing = await prisma.taskCellDocument.findUnique({
    where: {
      projectId_taskId_fieldKey: {
        projectId,
        taskId: task.id,
        fieldKey,
      },
    },
  });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.taskCellDocument.create({
      data: buildInitialTaskCellDocumentCreateInput(projectId, task, fieldKey),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.taskCellDocument.findUnique({
        where: {
          projectId_taskId_fieldKey: {
            projectId,
            taskId: task.id,
            fieldKey,
          },
        },
      });
      if (raced) {
        return raced;
      }
    }

    throw error;
  }
}

function buildInitialTaskCellDocumentCreateInput(
  projectId: string,
  task: TaskProjectionForCell,
  fieldKey: TaskCellDocumentFieldKey,
  updatedBy?: string,
) {
  const docType = getTaskCellDocumentType(fieldKey);
  if (!isTextCellDocumentField(fieldKey)) {
    return {
      projectId,
      taskId: task.id,
      fieldKey,
      docType,
      scalarValueJson: Prisma.JsonNull,
      updatedBy,
    };
  }

  const plainText = readTaskProjectionText(task, fieldKey);
  return {
    projectId,
    taskId: task.id,
    fieldKey,
    docType,
    plainText,
    yState: createYTextStateFromPlainText(plainText),
    updatedBy,
  };
}

function createYTextStateFromPlainText(plainText: string) {
  const doc = new Y.Doc();
  doc.getText("value").insert(0, plainText);
  return toPrismaBytes(Y.encodeStateAsUpdate(doc));
}

function applyYTextUpdate(currentState: Uint8Array | Buffer | null, updatePayload: Uint8Array) {
  const doc = new Y.Doc();
  if (currentState) {
    Y.applyUpdate(doc, new Uint8Array(currentState));
  }

  try {
    Y.applyUpdate(doc, updatePayload);
  } catch {
    throw badRequest("Cell document update payload is invalid.", "TASK_CELL_DOCUMENT_UPDATE_INVALID");
  }

  const plainText = doc.getText("value").toString();
  const yState = toPrismaBytes(Y.encodeStateAsUpdate(doc));
  if (yState.byteLength > MAX_CELL_SNAPSHOT_BYTES) {
    throw badRequest("Cell document snapshot is too large.", "TASK_CELL_DOCUMENT_SNAPSHOT_TOO_LARGE");
  }

  return { plainText, yState };
}

function buildYStateDiffBase64(currentState: Uint8Array | Buffer | null, stateVectorBase64: string) {
  if (!currentState) {
    return null;
  }

  const stateVector = decodeBase64Bytes(stateVectorBase64, "TASK_CELL_DOCUMENT_STATE_VECTOR_INVALID");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(currentState));
  return Buffer.from(Y.encodeStateAsUpdate(doc, stateVector)).toString("base64");
}

function toTaskCellDocumentSnapshot(document: {
  id: string;
  projectId: string;
  taskId: string;
  fieldKey: string;
  docType: string;
  yState: Uint8Array | Buffer | null;
  plainText: string;
  scalarValueJson: unknown;
  version: number;
  updatedAt: Date;
}, options: {
  diffUpdateBase64?: string | null;
  knownVersion?: number | null;
  updates?: Array<{
    id: string;
    clientUpdateId: string;
    actorProfileId: string;
    documentVersion: number;
    updatePayload: Uint8Array | Buffer;
    createdAt: Date;
  }>;
} = {}): TaskCellDocumentSnapshot {
  const updates = options.updates ?? [];
  const knownVersion = options.knownVersion ?? null;
  const catchUpMode =
    knownVersion === null || knownVersion >= document.version
      ? "current"
      : updates.length > 0
        ? "updates"
        : "snapshot";

  return {
    id: document.id,
    projectId: document.projectId,
    taskId: document.taskId,
    fieldKey: assertTaskCellDocumentFieldKey(document.fieldKey),
    docType: document.docType,
    version: document.version,
    plainText: document.plainText,
    scalarValueJson: document.scalarValueJson,
    yStateBase64: document.yState ? Buffer.from(document.yState).toString("base64") : null,
    catchUpMode,
    diffUpdateBase64: options.diffUpdateBase64 ?? null,
    updates: updates.map((update) => ({
      id: update.id,
      clientUpdateId: update.clientUpdateId,
      actorProfileId: update.actorProfileId,
      documentVersion: update.documentVersion,
      updateBase64: Buffer.from(update.updatePayload).toString("base64"),
      createdAt: update.createdAt.toISOString(),
    })),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function normalizeKnownVersion(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function decodeBase64Bytes(value: string, code: string) {
  try {
    return toPrismaBytes(Buffer.from(value, "base64"));
  } catch {
    throw badRequest("Base64 payload is invalid.", code);
  }
}

function toPrismaBytes(bytes: Uint8Array) {
  return Uint8Array.from(bytes);
}

function isRetryableTaskCellDocumentUpdateError(error: unknown) {
  if (error instanceof TaskCellDocumentConcurrentUpdateError) {
    return true;
  }

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return (
    (error.code === "P2028" && /Unable to start a transaction/i.test(error.message)) ||
    error.code === "P2034"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
