import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import {
  createKnowledgeProviderExecution,
  listKnowledgeProviderExecutions,
} from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    await requireRole("admin");
    const data = await listKnowledgeProviderExecutions();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const body = await request.json().catch(() => ({}));
    const data = await createKnowledgeProviderExecution(
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
