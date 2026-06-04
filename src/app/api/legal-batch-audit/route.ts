import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { fetchLegalBatchAuditStatus } from "@/use-cases/legal-batch-audit-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireKnowledgeAdmin();
    await requireCurrentProjectAccess(user);
    const data = await fetchLegalBatchAuditStatus();

    return NextResponse.json({ data }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
