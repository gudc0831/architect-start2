import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

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

type EditLeaseTarget = {
  targetType: "taskField";
  targetId: string;
  fieldKey: string;
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
    await prisma.editLease.deleteMany({ where: { expiresAt: { lte: now } } });

    try {
      const lease = await prisma.$transaction(async (tx) => {
        const existing = await tx.editLease.findUnique({
          where: {
            projectId_targetType_targetId_fieldKey: {
              projectId: context.project.id,
              targetType: target.targetType,
              targetId: target.targetId,
              fieldKey: target.fieldKey,
            },
          },
        });

        if (existing && existing.holderProfileId !== user.id && existing.expiresAt > now) {
          throw conflict(
            `${existing.holderDisplayName || "Another user"} is editing this field.`,
            "EDIT_LEASE_HELD",
          );
        }

        if (existing) {
          return tx.editLease.update({
            where: { id: existing.id },
            data: {
              holderProfileId: user.id,
              holderDisplayName: user.displayName || user.email,
              expiresAt,
            },
          });
        }

        return tx.editLease.create({
          data: {
            projectId: context.project.id,
            targetType: target.targetType,
            targetId: target.targetId,
            fieldKey: target.fieldKey,
            holderProfileId: user.id,
            holderDisplayName: user.displayName || user.email,
            expiresAt,
          },
        });
      });

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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("Another user is editing this field.", "EDIT_LEASE_HELD");
      }

      throw error;
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
