import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createKnowledgeImportRubricDraft,
  listKnowledgeImportRubrics,
} from "@/use-cases/admin/knowledge-rubric-service";

export async function GET() {
  try {
    await requireKnowledgeAdmin();
    const data = await listKnowledgeImportRubrics();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.rubric.manage");
    const body = await request.json();
    const data = await createKnowledgeImportRubricDraft({
      name: isRecord(body) ? body.name : "",
      hardBlockers: isRecord(body) ? body.hardBlockers : [],
      scoringCriteria: isRecord(body) ? body.scoringCriteria : [],
      weights: isRecord(body) ? body.weights : {},
    }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
