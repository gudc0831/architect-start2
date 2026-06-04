import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getRegulationGovernanceReport } from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    await requireKnowledgeAdmin();
    const data = await getRegulationGovernanceReport();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
