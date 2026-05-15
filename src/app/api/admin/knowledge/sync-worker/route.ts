import { NextResponse } from "next/server";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getKnowledgeExternalSyncWorkerReport } from "@/use-cases/admin/knowledge-sync-worker-service";

export async function GET() {
  try {
    await requireKnowledgeAdmin();
    return NextResponse.json({ data: await getKnowledgeExternalSyncWorkerReport() });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to read Knowledge sync worker report",
      },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}
