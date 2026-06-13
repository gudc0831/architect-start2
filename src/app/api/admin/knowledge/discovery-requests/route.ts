import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import {
  createKnowledgeDiscoveryRequest,
  listKnowledgeDiscoveryRequests,
} from "@/use-cases/admin/knowledge-discovery-service";

export async function GET() {
  try {
    const user = await requireKnowledgeAdmin();
    const context = await requireCurrentProjectAccess(user);
    const data = await listKnowledgeDiscoveryRequests(context.project.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.discovery.scan");
    const context = await requireCurrentProjectAccess(user);
    const body = await request.json();
    const data = await createKnowledgeDiscoveryRequest({
      projectId: context.project.id,
      taskId: isRecord(body) ? body.taskId : "",
      scanId: isRecord(body) ? body.scanId : "",
      recommendationScore: isRecord(body) ? body.recommendationScore : 0,
      recommendationReason: isRecord(body) ? body.recommendationReason : "",
      evidenceSummary: isRecord(body) ? body.evidenceSummary : {},
    }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
