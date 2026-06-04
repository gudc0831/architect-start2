import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { getKnowledgeProviderExecutionPackageReviewNoteReport } from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    await requireKnowledgeAdmin();
    const searchParams = new URL(request.url).searchParams;
    const data = await getKnowledgeProviderExecutionPackageReviewNoteReport({
      category: searchParams.get("category"),
      reviewerId: searchParams.get("reviewerId"),
      packageDigest: searchParams.get("packageDigest"),
      executionId: searchParams.get("executionId"),
      coveragePreset: searchParams.get("coveragePreset"),
      staleDays: searchParams.get("staleDays"),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
