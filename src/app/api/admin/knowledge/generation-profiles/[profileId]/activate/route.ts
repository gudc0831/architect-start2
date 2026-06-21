import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { activateKnowledgeGenerationProfile } from "@/use-cases/admin/knowledge-generation-profile-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.generation.activate");
    const { profileId } = await context.params;
    const data = await activateKnowledgeGenerationProfile(profileId, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
