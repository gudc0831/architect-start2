import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { getAssistantRunPolicy } from "@/use-cases/assistant-saas-mode-service";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const policy = await getAssistantRunPolicy({}, user);
    return NextResponse.json({
      data: {
        enabled: policy.enabled,
        provider: policy.provider,
        model: policy.model,
        externalEvidenceAllowed: policy.externalEvidenceAllowed,
        allowedEvidenceKinds: policy.allowedEvidenceKinds,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
