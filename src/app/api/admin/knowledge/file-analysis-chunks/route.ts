import { NextResponse } from "next/server";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getFileAnalysisChunkDebugReport } from "@/use-cases/admin/file-analysis-chunk-debug-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const { searchParams } = new URL(request.url);
    const report = await getFileAnalysisChunkDebugReport({
      query: searchParams.get("query"),
      sourceType: searchParams.get("sourceType"),
      verificationState: searchParams.get("verificationState"),
      sampleLimit: searchParams.get("sampleLimit"),
    });
    return NextResponse.json({ data: report });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to read file-analysis chunk debug report",
      },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}
