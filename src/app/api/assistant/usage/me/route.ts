import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireActiveUser } from "@/lib/auth/active-user";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { CODEX_DEFAULT_MODEL } from "@/domains/preferences/types";
import { createLocalCodexUsageEvent, getMyAssistantUsageSummary } from "@/use-cases/assistant-usage-service";

type LocalCodexUsageBody = {
  taskId?: string | null;
  assistantRecordId?: string | null;
  runtimeMode?: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status?: "success" | "failed" | "cancelled";
  metadata?: Record<string, unknown>;
};

export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();
    const url = new URL(request.url);
    const data = await getMyAssistantUsageSummary(
      {
        range: url.searchParams.get("range"),
        granularity: url.searchParams.get("granularity"),
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
    assertRequestIntegrity(request);
    const user = await requireActiveUser();
    const context = await requireCurrentProjectEditor(user);
    const rawBody = await request.json();
    const body =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? (rawBody as LocalCodexUsageBody) : {};
    const data = await createLocalCodexUsageEvent({
      projectId: context.project.id,
      taskId: body.taskId ?? null,
      profileId: user.id,
      assistantRecordId: body.assistantRecordId ?? null,
      runtimeMode: typeof body.runtimeMode === "string" ? body.runtimeMode : "extension-native-bridge-in-page",
      model: typeof body.model === "string" ? body.model : CODEX_DEFAULT_MODEL,
      inputTokens: typeof body.inputTokens === "number" ? body.inputTokens : null,
      outputTokens: typeof body.outputTokens === "number" ? body.outputTokens : null,
      status: body.status,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
