import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { exportKnowledgeProviderExecutionPackage } from "@/use-cases/admin/knowledge-service";

export async function GET(_request: Request, context: { params: Promise<{ executionId: string }> }) {
  try {
    const user = await requireKnowledgeAdmin();
    const { executionId } = await context.params;
    const data = await exportKnowledgeProviderExecutionPackage({ executionId }, user);

    return new NextResponse(data.json, {
      headers: {
        "content-disposition": `attachment; filename="${data.filename}"`,
        "content-type": "application/json; charset=utf-8",
        "x-provider-execution-package-digest": data.digest,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
