import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { listApprovedKnowledgeItems } from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    await requireKnowledgeAdmin();
    const data = await listApprovedKnowledgeItems();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
