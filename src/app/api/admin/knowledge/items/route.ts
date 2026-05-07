import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { listApprovedKnowledgeItems } from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    await requireRole("admin");
    const data = await listApprovedKnowledgeItems();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
