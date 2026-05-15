import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createKnowledgeExportSyncAudit,
  listKnowledgeExportSyncAudits,
} from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    await requireKnowledgeAdmin();
    const data = await listKnowledgeExportSyncAudits();
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
    const data = await createKnowledgeExportSyncAudit(
      isRecord(body) ? body : {},
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
