import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createKnowledgeGenerationProfileDraft,
  getOrCreateActiveKnowledgeGenerationProfile,
  listKnowledgeGenerationProfiles,
} from "@/use-cases/admin/knowledge-generation-profile-service";

export async function GET(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.generation.manage");
    await getOrCreateActiveKnowledgeGenerationProfile(user);
    const data = await listKnowledgeGenerationProfiles();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.generation.manage");
    const body = await request.json();
    const data = await createKnowledgeGenerationProfileDraft({
      name: isRecord(body) ? body.name : "",
      sourceBucketRules: isRecord(body) ? body.sourceBucketRules : undefined,
      tocTemplate: isRecord(body) ? body.tocTemplate : undefined,
      ontologySchema: isRecord(body) ? body.ontologySchema : undefined,
      citationRules: isRecord(body) ? body.citationRules : undefined,
      sectionRules: isRecord(body) ? body.sectionRules : undefined,
    }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
