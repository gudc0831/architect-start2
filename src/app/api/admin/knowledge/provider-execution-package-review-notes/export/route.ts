import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { exportKnowledgeProviderExecutionPackageReviewNoteCsv } from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const searchParams = new URL(request.url).searchParams;
    const data = await exportKnowledgeProviderExecutionPackageReviewNoteCsv({
      category: searchParams.get("category"),
      reviewerId: searchParams.get("reviewerId"),
      packageDigest: searchParams.get("packageDigest"),
      executionId: searchParams.get("executionId"),
      coveragePreset: searchParams.get("coveragePreset"),
      staleDays: searchParams.get("staleDays"),
    });
    return new NextResponse(data.csv, {
      headers: {
        "content-disposition": `attachment; filename="${data.filename}"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
