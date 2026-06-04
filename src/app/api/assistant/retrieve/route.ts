import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { retrieveAssistantEvidence } from "@/use-cases/assistant-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const body = await request.json();
    const data = await retrieveAssistantEvidence({
      taskId: String(body.taskId ?? ""),
      question: String(body.question ?? ""),
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
