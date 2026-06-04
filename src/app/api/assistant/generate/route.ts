import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { generateAssistantWithSaasApi } from "@/use-cases/assistant-saas-mode-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const data = await generateAssistantWithSaasApi(await request.json(), user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
