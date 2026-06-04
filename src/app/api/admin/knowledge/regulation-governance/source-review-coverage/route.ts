import { NextResponse } from "next/server";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getRegulationGovernanceSourceReviewCoverageReport } from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const { searchParams } = new URL(request.url);
    const report = await getRegulationGovernanceSourceReviewCoverageReport({
      coveragePreset: searchParams.get("coveragePreset"),
      staleDays: searchParams.get("staleDays"),
    });
    return NextResponse.json({ data: report });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load regulation source-review coverage",
      },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}
