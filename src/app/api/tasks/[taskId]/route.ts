import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { permanentlyDeleteTask, updateTask } from "@/use-cases/task-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { taskId } = await context.params;
    const body = await request.json();
    const task = await updateTask(taskId, buildUpdatePayload(body), user.id);

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleRouteError(error);
  }
}

function buildUpdatePayload(body: unknown) {
  const source = isRecord(body) && isRecord(body.changes) ? body.changes : body;
  if (!isRecord(source)) {
    return {};
  }

  const dirtyFieldNames = readDirtyFieldNames(body);
  if (!dirtyFieldNames) {
    return source;
  }

  const next = Object.fromEntries(
    Object.entries(source).filter(([key]) => dirtyFieldNames.has(key) || key === "version"),
  );

  if (!Object.prototype.hasOwnProperty.call(next, "version") && isRecord(body) && Object.prototype.hasOwnProperty.call(body, "version")) {
    next.version = body.version;
  }

  return next;
}

function readDirtyFieldNames(body: unknown) {
  if (!isRecord(body) || !Object.prototype.hasOwnProperty.call(body, "dirtyFields")) {
    return null;
  }

  const dirtyFields = body.dirtyFields;
  if (Array.isArray(dirtyFields)) {
    return new Set(dirtyFields.map((value) => String(value)));
  }

  if (isRecord(dirtyFields)) {
    return new Set(
      Object.entries(dirtyFields)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key),
    );
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    assertRequestIntegrity(_request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { taskId } = await context.params;
    await permanentlyDeleteTask(taskId, user.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
