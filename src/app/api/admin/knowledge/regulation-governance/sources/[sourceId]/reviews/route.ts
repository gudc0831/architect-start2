import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createRegulationGovernanceSourceReview,
  getRegulationGovernanceReport,
  listRegulationGovernanceSourceReviews,
} from "@/use-cases/admin/knowledge-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  try {
    await requireKnowledgeAdmin();
    const { sourceId } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listRegulationGovernanceSourceReviews({
      packageId: searchParams.get("packageId"),
      sourceId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    const { sourceId } = await context.params;
    const body = await request.json().catch(() => ({}));
    await createRegulationGovernanceSourceReview(
      {
        ...(isRecord(body) ? body : {}),
        sourceId,
      },
      user,
    );
    const data = await getRegulationGovernanceReport();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
