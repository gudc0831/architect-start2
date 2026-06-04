import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { importVerifiedLegalCandidate } from "@/use-cases/admin/verified-legal-candidate-import-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    const context = await requireCurrentProjectAccess(user);
    const body = await request.json();
    const input = readImportBody(body);
    const data = await importVerifiedLegalCandidate({
      pkg: input.package,
      taskId: input.taskId,
      projectId: context.project.id,
      user,
    });

    return NextResponse.json({
      data: {
        recordId: data.id,
        candidateState: data.candidateState,
      },
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function readImportBody(body: unknown): { package: unknown; taskId: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Request body is required.", "VERIFIED_LEGAL_CANDIDATE_BODY_INVALID");
  }
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "package" && key !== "taskId")) {
    throw badRequest("Only package and taskId are accepted.", "VERIFIED_LEGAL_CANDIDATE_BODY_FIELDS_INVALID");
  }
  const taskIdValue = (body as { taskId?: unknown }).taskId;
  if (typeof taskIdValue !== "string") {
    throw badRequest("taskId is required.", "VERIFIED_LEGAL_CANDIDATE_TASK_REQUIRED");
  }
  const taskId = taskIdValue.trim();
  if (!taskId) {
    throw badRequest("taskId is required.", "VERIFIED_LEGAL_CANDIDATE_TASK_REQUIRED");
  }
  return {
    package: (body as { package?: unknown }).package,
    taskId,
  };
}
