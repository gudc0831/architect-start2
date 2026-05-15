import { NextResponse } from "next/server";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { exportRegulationGovernanceSourceReviewCoverageCsv } from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const { searchParams } = new URL(request.url);
    const exportData = await exportRegulationGovernanceSourceReviewCoverageCsv({
      coveragePreset: searchParams.get("coveragePreset"),
      staleDays: searchParams.get("staleDays"),
    });
    return new NextResponse(exportData.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportData.filename}"`,
      },
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to export regulation source-review coverage",
      },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}
