import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createRegulationGovernanceAcknowledgement,
  getRegulationGovernanceReport,
  listRegulationGovernanceAcknowledgements,
} from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const { searchParams } = new URL(request.url);
    const data = await listRegulationGovernanceAcknowledgements({
      packageId: searchParams.get("packageId"),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    const body = await request.json().catch(() => ({}));
    await createRegulationGovernanceAcknowledgement(isRecord(body) ? body : {}, user);
    const data = await getRegulationGovernanceReport();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
