import type { AuthUser } from "@/domains/auth/types";
import type { AssistantEvidence, AssistantRecord } from "@/domains/assistant/types";
import type { TaskRecord } from "@/domains/task/types";
import { badRequest } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { taskRepository } from "@/repositories";

export type SaasWikiCandidatePackage = {
  packageVersion: 1;
  status: "saas_wiki_candidate";
  generatedAt: string;
  source: "verified-legal-evidence-api";
  sourceApprovedPath: string;
  sourceDigests: string[];
  saasWikiApproved: false;
  approvedKnowledgeItem: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    tags: string[];
    scope: "organization";
    sourceRecordId: string;
    sourceTaskId: string;
    sourceProjectId: string;
  };
};

export type ImportVerifiedLegalCandidateInput = {
  pkg: unknown;
  taskId: string;
  projectId: string;
  user: AuthUser;
  dependencies?: {
    findTaskById?: (taskId: string) => Promise<Pick<TaskRecord, "id" | "projectId" | "purgedAt"> | null>;
    createRecord?: typeof assistantRepository.createRecord;
  };
};

export async function importVerifiedLegalCandidate(
  input: ImportVerifiedLegalCandidateInput,
): Promise<AssistantRecord> {
  const pkg = validateSaasWikiCandidatePackage(input.pkg);
  const task = await (input.dependencies?.findTaskById ?? taskRepository.findTaskById)(input.taskId);
  if (!task || task.projectId !== input.projectId || task.purgedAt) {
    throw badRequest("Task is not available in the current project.", "VERIFIED_LEGAL_CANDIDATE_TASK_SCOPE_INVALID");
  }
  const createRecord = input.dependencies?.createRecord ?? assistantRepository.createRecord;

  return createRecord({
    taskId: task.id,
    projectId: input.projectId,
    profileId: input.user.id,
    question: `Verified legal evidence candidate: ${pkg.approvedKnowledgeItem.title}`,
    answer: pkg.approvedKnowledgeItem.bodyMarkdown,
    evidence: normalizeCandidateEvidence(pkg),
    confidenceScore: 70,
    confidenceReason: "Imported from reviewed verified-legal evidence package; pending Architect SaaS Knowledge admin approval.",
    executionMode: "saas-api",
    runtimeMode: "verified-legal-candidate-import",
    draftSummary: {
      conclusion: pkg.approvedKnowledgeItem.summary,
      tags: pkg.approvedKnowledgeItem.tags,
      scope: pkg.approvedKnowledgeItem.scope,
    },
    candidateState: "pending_review",
  });
}

export function validateSaasWikiCandidatePackage(value: unknown): SaasWikiCandidatePackage {
  if (!isRecord(value)) {
    throw badRequest("Candidate package must be an object", "VERIFIED_LEGAL_CANDIDATE_INVALID");
  }
  if ("candidateState" in value) {
    throw badRequest("Candidate state is server controlled", "VERIFIED_LEGAL_CANDIDATE_STATE_FORBIDDEN");
  }
  if (value.packageVersion !== 1) {
    throw badRequest("Candidate package version is unsupported", "VERIFIED_LEGAL_CANDIDATE_VERSION_INVALID");
  }
  if (value.status !== "saas_wiki_candidate") {
    throw badRequest("Candidate package status is invalid", "VERIFIED_LEGAL_CANDIDATE_STATUS_INVALID");
  }
  if (value.saasWikiApproved !== false) {
    throw badRequest("Candidate package must not be pre-approved", "VERIFIED_LEGAL_CANDIDATE_APPROVAL_FORBIDDEN");
  }
  if (
    !Array.isArray(value.sourceDigests) ||
    value.sourceDigests.length === 0 ||
    value.sourceDigests.some((digest) => typeof digest !== "string" || !digest.trim())
  ) {
    throw badRequest("Candidate package source digests are required", "VERIFIED_LEGAL_CANDIDATE_DIGESTS_INVALID");
  }
  if (!isRecord(value.approvedKnowledgeItem)) {
    throw badRequest("Candidate package knowledge item is invalid", "VERIFIED_LEGAL_CANDIDATE_ITEM_INVALID");
  }
  if ("approvedBy" in value.approvedKnowledgeItem || "approvedAt" in value.approvedKnowledgeItem) {
    throw badRequest("Candidate approval metadata is server controlled", "VERIFIED_LEGAL_CANDIDATE_APPROVAL_METADATA_FORBIDDEN");
  }

  const item = value.approvedKnowledgeItem;
  assertString(value.generatedAt, "generatedAt");
  assertString(value.source, "source");
  assertString(value.sourceApprovedPath, "sourceApprovedPath");
  assertString(item.title, "approvedKnowledgeItem.title");
  assertString(item.summary, "approvedKnowledgeItem.summary");
  assertString(item.bodyMarkdown, "approvedKnowledgeItem.bodyMarkdown");
  assertString(item.sourceRecordId, "approvedKnowledgeItem.sourceRecordId");
  assertString(item.sourceTaskId, "approvedKnowledgeItem.sourceTaskId");
  assertString(item.sourceProjectId, "approvedKnowledgeItem.sourceProjectId");
  if (value.source !== "verified-legal-evidence-api" || item.scope !== "organization") {
    throw badRequest("Candidate package source or scope is invalid", "VERIFIED_LEGAL_CANDIDATE_SCOPE_INVALID");
  }
  if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw badRequest("Candidate package tags are invalid", "VERIFIED_LEGAL_CANDIDATE_TAGS_INVALID");
  }

  assertNoCredentialLikeText(value as SaasWikiCandidatePackage);
  return value as SaasWikiCandidatePackage;
}

function normalizeCandidateEvidence(pkg: SaasWikiCandidatePackage): AssistantEvidence[] {
  return pkg.sourceDigests.map((digest, index) => ({
    id: `verified-legal:${index + 1}`,
    kind: "regulation",
    priority: index + 1,
    title: pkg.approvedKnowledgeItem.title,
    excerpt: `Verified legal evidence digest ${digest}`,
    recordId: pkg.approvedKnowledgeItem.sourceRecordId,
    confidenceWeight: 0.7,
  }));
}

function assertNoCredentialLikeText(value: SaasWikiCandidatePackage): void {
  const serialized = JSON.stringify(value);
  if (/(LAW_OPEN_DATA_OC|LEGAL_QUERY_EMBEDDING_API_KEY|ARCHITECT_FILE_EMBEDDING_API_KEY|OPENAI_API_KEY|OC\s*=|sk-[A-Za-z0-9])/i.test(serialized)) {
    throw badRequest("Candidate package contains credential-like text", "VERIFIED_LEGAL_CANDIDATE_CREDENTIAL_TEXT");
  }
  const serviceSecret = process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET;
  if (serviceSecret && serviceSecret.length >= 8 && serialized.includes(serviceSecret)) {
    throw badRequest("Candidate package contains credential-like text", "VERIFIED_LEGAL_CANDIDATE_CREDENTIAL_TEXT");
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`Candidate package ${field} is required`, "VERIFIED_LEGAL_CANDIDATE_FIELD_REQUIRED");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
