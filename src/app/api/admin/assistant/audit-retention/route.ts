import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import {
  executeAssistantAuditRetentionCleanup,
  getAssistantAuditRetentionPreview,
} from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantAuditRetentionPreview(
      {
        projectId: searchParams.get("projectId"),
        retentionDays: searchParams.get("retentionDays"),
        cutoffAt: searchParams.get("cutoffAt"),
        limit: searchParams.get("limit"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    const body = (await request.json()) as {
      projectId?: string | null;
      retentionDays?: string | null;
      cutoffAt?: string | null;
      limit?: string | null;
      archivePreviewToken?: unknown;
      confirmation?: unknown;
    };
    const data = await executeAssistantAuditRetentionCleanup(body, user);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
