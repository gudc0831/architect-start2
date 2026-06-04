import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    await requireKnowledgeAdmin();
    const { recordId } = await context.params;
    const data = await getKnowledgeCandidate(recordId);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
