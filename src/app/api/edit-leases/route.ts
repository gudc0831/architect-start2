import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { classifyRouteDatabaseError, handleRouteError, sanitizeRouteErrorDetails } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

const EDIT_LEASE_TTL_MS = 30_000;
const editableTaskFieldKeys = new Set([
  "dueDate",
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "assignee",
  "issueTitle",
  "reviewedAt",
  "locationRef",
  "calendarLinked",
  "issueDetailNote",
  "status",
  "decision",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EditLeaseTarget = {
  targetType: "taskField";
  targetId: string;
  fieldKey: string;
};
type EditLeaseUser = {
  id: string;
  displayName?: string | null;
  email?: string | null;
};

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const context = await requireCurrentProjectEditor(user);
    const target = readEditLeaseTarget(await request.json());
    await assertEditableTargetBelongsToProject(context.project.id, target);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EDIT_LEASE_TTL_MS);
    await cleanupExpiredEditLeasesBestEffort(context.project.id, target, now);

    try {
      const lease = await acquireEditLease(context.project.id, target, user, now, expiresAt);

      return buildEditLeaseResponse(lease);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const lease = await retryEditLeaseAcquisitionAfterUniqueConflict(context.project.id, target, user, now, expiresAt);
        return buildEditLeaseResponse(lease);
      }

      return handleEditLeaseAcquisitionError(error);
    }
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const context = await requireCurrentProjectEditor(user);
    const target = readEditLeaseTarget(await request.json());

    await prisma.editLease.deleteMany({
      where: {
        projectId: context.project.id,
        targetType: target.targetType,
        targetId: target.targetId,
        fieldKey: target.fieldKey,
        holderProfileId: user.id,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function readEditLeaseTarget(body: unknown): EditLeaseTarget {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Edit lease target is required", "EDIT_LEASE_TARGET_REQUIRED");
  }

  const source = body as Record<string, unknown>;
  const targetType = source.targetType;
  const targetId = source.targetId;
  const fieldKey = source.fieldKey;

  if (targetType !== "taskField") {
    throw badRequest("Edit lease target type is invalid", "EDIT_LEASE_TARGET_INVALID");
  }

  if (typeof targetId !== "string" || !targetId.trim()) {
    throw badRequest("Edit lease target id is required", "EDIT_LEASE_TARGET_REQUIRED");
  }

  if (!isUuid(targetId.trim())) {
    throw badRequest("Edit lease target id is invalid", "EDIT_LEASE_TARGET_ID_INVALID");
  }

  if (typeof fieldKey !== "string" || !editableTaskFieldKeys.has(fieldKey)) {
    throw badRequest("Edit lease field is invalid", "EDIT_LEASE_FIELD_INVALID");
  }

  return {
    targetType,
    targetId: targetId.trim(),
    fieldKey,
  };
}

async function assertEditableTargetBelongsToProject(projectId: string, target: EditLeaseTarget) {
  const task = await prisma.task.findFirst({
    where: {
      id: target.targetId,
      projectId,
      purgedAt: null,
    },
    select: { id: true },
  });

  if (!task) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }
}

function isUuid(value: string) {
  return uuidPattern.test(value);
}

function buildEditLeaseUniqueWhere(projectId: string, target: EditLeaseTarget) {
  return {
    projectId_targetType_targetId_fieldKey: {
      projectId,
      targetType: target.targetType,
      targetId: target.targetId,
      fieldKey: target.fieldKey,
    },
  };
}

function buildEditLeaseHolderDisplayName(user: EditLeaseUser) {
  return user.displayName || user.email || "Current user";
}

async function acquireEditLease(
  projectId: string,
  target: EditLeaseTarget,
  user: EditLeaseUser,
  now: Date,
  expiresAt: Date,
) {
  return prisma.$transaction((tx) => acquireOrRefreshEditLease(tx, projectId, target, user, now, expiresAt));
}

async function retryEditLeaseAcquisitionAfterUniqueConflict(
  projectId: string,
  target: EditLeaseTarget,
  user: EditLeaseUser,
  now: Date,
  expiresAt: Date,
) {
  return acquireEditLease(projectId, target, user, now, expiresAt);
}

async function acquireOrRefreshEditLease(
  tx: Prisma.TransactionClient,
  projectId: string,
  target: EditLeaseTarget,
  user: EditLeaseUser,
  now: Date,
  expiresAt: Date,
) {
  const existing = await tx.editLease.findUnique({
    where: buildEditLeaseUniqueWhere(projectId, target),
  });

  if (existing && existing.holderProfileId !== user.id && existing.expiresAt > now) {
    throw conflict(`${existing.holderDisplayName || "Another user"} is editing this field.`, "EDIT_LEASE_HELD");
  }

  if (existing) {
    return tx.editLease.update({
      where: { id: existing.id },
      data: {
        holderProfileId: user.id,
        holderDisplayName: buildEditLeaseHolderDisplayName(user),
        expiresAt,
      },
    });
  }

  return tx.editLease.create({
    data: {
      projectId,
      targetType: target.targetType,
      targetId: target.targetId,
      fieldKey: target.fieldKey,
      holderProfileId: user.id,
      holderDisplayName: buildEditLeaseHolderDisplayName(user),
      expiresAt,
    },
  });
}

function buildEditLeaseResponse(lease: Awaited<ReturnType<typeof acquireEditLease>>) {
  return NextResponse.json({
    data: {
      id: lease.id,
      projectId: lease.projectId,
      targetType: lease.targetType,
      targetId: lease.targetId,
      fieldKey: lease.fieldKey,
      holderProfileId: lease.holderProfileId,
      holderDisplayName: lease.holderDisplayName,
      expiresAt: lease.expiresAt.toISOString(),
    },
  });
}

async function cleanupExpiredEditLeasesBestEffort(projectId: string, target: EditLeaseTarget, now: Date) {
  try {
    await prisma.editLease.deleteMany({
      where: {
        projectId,
        targetType: target.targetType,
        targetId: target.targetId,
        expiresAt: { lte: now },
      },
    });
  } catch (error) {
    const classified = classifyRouteDatabaseError(error);
    if (classified?.code === "DATABASE_SCHEMA_UNAVAILABLE") {
      throw error;
    }

    console.warn("[edit-leases] expired lease cleanup skipped", sanitizeRouteErrorDetails(error));
  }
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  return "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
}

function getErrorMetaCode(error: unknown) {
  if (!error || typeof error !== "object" || !("meta" in error)) {
    return "";
  }

  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || !("code" in meta)) {
    return "";
  }

  return String((meta as { code?: unknown }).code ?? "");
}

function handleEditLeaseAcquisitionError(error: unknown) {
  const code = getErrorCode(error);
  const metaCode = getErrorMetaCode(error);
  if (code === "P2002") {
    return NextResponse.json(
      {
        error: {
          code: "EDIT_LEASE_RETRYABLE_CONFLICT",
          message: "Edit lease acquisition conflicted. Please retry.",
        },
        retryable: true,
      },
      { status: 409 },
    );
  }

  const classified = classifyRouteDatabaseError(error);
  if (!classified) {
    throw error;
  }

  if (classified.code === "DATABASE_RETRYABLE_CONFLICT" || metaCode === "40001" || metaCode === "40P01") {
    return NextResponse.json(
      {
        error: {
          code: "EDIT_LEASE_RETRYABLE_CONFLICT",
          message: "Edit lease acquisition conflicted. Please retry.",
        },
        retryable: true,
      },
      { status: 409 },
    );
  }

  if (classified.code === "DATABASE_RECORD_CONFLICT") {
    return NextResponse.json(
      {
        error: {
          code: "EDIT_LEASE_RETRYABLE_CONFLICT",
          message: "Edit lease changed before acquisition completed. Please retry.",
        },
        retryable: true,
      },
      { status: 409 },
    );
  }

  if (classified.code === "DATABASE_TRANSACTION_UNAVAILABLE") {
    return NextResponse.json(
      {
        error: {
          code: "EDIT_LEASE_TRANSACTION_UNAVAILABLE",
          message: "Edit lease transaction is temporarily unavailable.",
        },
        retryable: true,
      },
      { status: 503 },
    );
  }

  throw error;
}
