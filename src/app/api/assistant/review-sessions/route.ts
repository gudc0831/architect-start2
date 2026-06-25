import { NextResponse } from "next/server";
import type { AssistantEvidence, AssistantExecutionMode } from "@/domains/assistant/types";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import {
  listTaskReviewSessions,
  saveTaskReviewSessionRecord,
  type SaveTaskReviewSessionRecordInput,
} from "@/use-cases/task-review-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const data = await listTaskReviewSessions(searchParams.get("taskId") ?? "", {
      includeSessionId: searchParams.get("includeSessionId"),
      includeWorkSummaryDraftId: searchParams.get("includeWorkSummaryDraftId"),
    });

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
    const data = await saveTaskReviewSessionRecord(parseSaveTaskReviewSessionBody(await request.json()), user);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseSaveTaskReviewSessionBody(rawBody: unknown): SaveTaskReviewSessionRecordInput {
  if (!isRecord(rawBody)) {
    throw badRequest("Invalid review session payload", "TASK_REVIEW_SESSION_PAYLOAD_INVALID");
  }
  if (typeof rawBody.taskId !== "string" || !rawBody.taskId.trim()) {
    throw badRequest("taskId is required", "TASK_REVIEW_SESSION_TASK_ID_REQUIRED");
  }
  if (typeof rawBody.question !== "string" || !rawBody.question.trim()) {
    throw badRequest("question is required", "TASK_REVIEW_SESSION_QUESTION_REQUIRED");
  }
  if (typeof rawBody.answer !== "string" || !rawBody.answer.trim()) {
    throw badRequest("answer is required", "TASK_REVIEW_SESSION_ANSWER_REQUIRED");
  }
  if (!Array.isArray(rawBody.evidence)) {
    throw badRequest("evidence is required", "TASK_REVIEW_SESSION_EVIDENCE_REQUIRED");
  }

  return {
    taskId: rawBody.taskId,
    question: rawBody.question,
    answer: rawBody.answer,
    evidence: rawBody.evidence.filter(isAssistantEvidencePayload),
    ...(typeof rawBody.title === "string" ? { title: rawBody.title } : {}),
    ...(isRecord(rawBody.generated) ? { generated: rawBody.generated as SaveTaskReviewSessionRecordInput["generated"] } : {}),
    ...(isRecord(rawBody.draftSummary) || rawBody.draftSummary === null
      ? { draftSummary: rawBody.draftSummary as SaveTaskReviewSessionRecordInput["draftSummary"] }
      : {}),
    ...(isAssistantExecutionMode(rawBody.executionMode) ? { executionMode: rawBody.executionMode } : {}),
    ...(typeof rawBody.runtimeMode === "string" && rawBody.runtimeMode.trim() ? { runtimeMode: rawBody.runtimeMode } : {}),
    ...(isRecord(rawBody.officialLawVerification)
      ? { officialLawVerification: rawBody.officialLawVerification as SaveTaskReviewSessionRecordInput["officialLawVerification"] }
      : {}),
    ...(isRecord(rawBody.legalApplicability)
      ? { legalApplicability: rawBody.legalApplicability as SaveTaskReviewSessionRecordInput["legalApplicability"] }
      : {}),
    ...(isRecord(rawBody.reviewSession)
      ? { reviewSession: rawBody.reviewSession as SaveTaskReviewSessionRecordInput["reviewSession"] }
      : {}),
  };
}

function isAssistantEvidencePayload(value: unknown): value is AssistantEvidence {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.priority === "number" &&
    typeof value.title === "string" &&
    typeof value.excerpt === "string"
  );
}

function isAssistantExecutionMode(value: unknown): value is AssistantExecutionMode {
  return value === "local-chatgpt-codex" || value === "mock" || value === "unavailable" || value === "saas-api";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
