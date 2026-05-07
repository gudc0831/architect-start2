import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    await requireRole("admin");
    const { recordId } = await context.params;
    const data = await getKnowledgeCandidate(recordId);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
