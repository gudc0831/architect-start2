import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createKnowledgeProviderExecutionPackageReviewNote,
  listKnowledgeProviderExecutions,
} from "@/use-cases/admin/knowledge-service";

type RouteContext = { params: Promise<{ executionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireKnowledgeAdmin();
    const { executionId } = await context.params;
    const executions = await listKnowledgeProviderExecutions();
    const execution = executions.find((item) => item.id === executionId);
    return NextResponse.json({ data: execution?.packageReviewNotes ?? [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    const { executionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await createKnowledgeProviderExecutionPackageReviewNote(
      {
        ...(isRecord(body) ? body : {}),
        executionId,
      },
      user,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
