import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listExternalEvidence, saveExternalEvidence } from "@/use-cases/assistant-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const data = await listExternalEvidence(searchParams.get("taskId") ?? "");

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const body = await request.json();
    const data = await saveExternalEvidence(body, user);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
