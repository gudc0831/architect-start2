import { createHash } from "node:crypto";
import type { AssistantEvidence } from "@/domains/assistant/types";
import { defaultAssistantRunPolicy } from "@/domains/assistant/saas-api-mode";
import type { ProjectWikiDraft, ProjectWikiSuitabilityState } from "@/domains/project-wiki/types";
import { assistantRepository } from "@/repositories/assistant";
import { runAssistantProviderWithSaasGovernance } from "@/use-cases/assistant-provider-governance-service";

const PROJECT_WIKI_DRAFT_LIMITS = {
  title: 80,
  summary: 220,
  bodyMarkdown: 2400,
  reason: 160,
  caution: 180,
  tags: 8,
} as const;

export async function evaluateProjectWikiSuitability(input: {
  projectId: string;
  taskId: string;
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
  userId: string;
}): Promise<ProjectWikiDraft> {
  const fallbackDraft = buildDeterministicProjectWikiDraft(input);
  const policy = (await assistantRepository.getRunPolicy(input.projectId)) ?? defaultAssistantRunPolicy({ projectId: input.projectId });
  if (!policy.enabled || policy.provider !== "openai") {
    return fallbackDraft;
  }

  const promptText = buildProviderPrompt(input);
  const { providerResult } = await runAssistantProviderWithSaasGovernance({
    projectId: input.projectId,
    taskId: input.taskId,
    profileId: input.userId,
    taskLabel: input.taskTitle || "project-wiki-registration",
    question: "승인된 작업 기록을 프로젝트 WIKI로 등록해도 되는지 평가하고 등록 초안을 JSON으로 작성하세요.",
    instruction: [
      "Return JSON only.",
      "Use this schema: {\"state\":\"recommended|caution|not_recommended\",\"reason\":\"...\",\"title\":\"...\",\"summary\":\"...\",\"bodyMarkdown\":\"...\",\"tags\":[\"...\"],\"commonizationCaution\":\"...\"}.",
      "Do not include provider, usage, cost, prompt, credential, token, or request metadata.",
    ].join("\n"),
    promptText,
    evidence: buildProviderEvidence(input.evidenceTitles),
    requestHash: createSuitabilityRequestHash(input),
    runtimeMode: "project-wiki-suitability-live-provider",
    auditEventType: "project_wiki.suitability.success",
    metadata: {
      purpose: "project_wiki_suitability",
      source: "project_wiki_registration_preview",
    },
  });
  return mergeProviderDraft(parseProviderDraft(providerResult.answer), fallbackDraft);
}

export function buildDeterministicProjectWikiDraft(input: {
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
}): ProjectWikiDraft {
  const taskTitle = normalizeDraftText(input.taskTitle);
  const approvedConclusion = normalizeDraftText(input.approvedConclusion);
  const approvedScope = normalizeDraftText(input.approvedScope);
  const approvedFollowUpAction = normalizeDraftText(input.approvedFollowUpAction);
  const evidenceTitles = input.evidenceTitles.map(normalizeDraftText).filter(Boolean).slice(0, 12);
  const suitability = decideSuitability({
    approvedConclusion,
    approvedScope,
    approvedFollowUpAction,
    evidenceTitles,
  });

  return {
    title: clampText(taskTitle || firstSentence(approvedConclusion) || "프로젝트 검토 기록", PROJECT_WIKI_DRAFT_LIMITS.title),
    summary: clampText(approvedConclusion || approvedFollowUpAction || "승인된 검토 요약을 프로젝트 WIKI로 등록합니다.", PROJECT_WIKI_DRAFT_LIMITS.summary),
    bodyMarkdown: clampText(
      [
        "## 승인 결론",
        approvedConclusion || "-",
        "",
        "## 적용 범위",
        approvedScope || "-",
        "",
        "## 후속 조치",
        approvedFollowUpAction || "-",
        "",
        "## 근거",
        evidenceTitles.length ? evidenceTitles.map((title) => `- ${title}`).join("\n") : "- 저장된 근거 제목 없음",
      ].join("\n"),
      PROJECT_WIKI_DRAFT_LIMITS.bodyMarkdown,
    ),
    tags: buildTags({ taskTitle, approvedScope, evidenceTitles }),
    aiSuitabilityState: suitability.state,
    aiSuitabilityReason: clampText(suitability.reason, PROJECT_WIKI_DRAFT_LIMITS.reason),
    commonizationCaution: clampText(suitability.caution, PROJECT_WIKI_DRAFT_LIMITS.caution),
  };
}

function decideSuitability(input: {
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
}): { state: ProjectWikiSuitabilityState; reason: string; caution: string } {
  const combined = [input.approvedConclusion, input.approvedScope, input.approvedFollowUpAction].join(" ");
  if (!input.approvedConclusion) {
    return {
      state: "not_recommended",
      reason: "승인 결론이 비어 있어 WIKI 등록 판단 근거가 부족합니다.",
      caution: "승인된 결론을 보강한 뒤 등록하세요.",
    };
  }
  if (/(비공개|개인정보|보안|계약금액|현장전용|현장 전용|일회성|특정\s*현장에만)/u.test(combined)) {
    return {
      state: "not_recommended",
      reason: "프로젝트 외 재사용이 부적절한 민감하거나 현장전용 표현이 포함되어 있습니다.",
      caution: "공용화 후보로 쓰려면 민감 정보와 특정 현장 맥락을 제거해야 합니다.",
    };
  }
  if (/(추가\s*확인|확인\s*필요|협의|조건부|미정|보류|현장|본\s*프로젝트|당\s*프로젝트)/u.test(combined)) {
    return {
      state: "caution",
      reason: "조건부 또는 프로젝트 특정 맥락이 포함되어 등록 후 적용 범위 확인이 필요합니다.",
      caution: "다른 프로젝트에 재사용하기 전 조건, 현장 맥락, 근거 최신성을 다시 확인하세요.",
    };
  }
  if (input.evidenceTitles.length === 0) {
    return {
      state: "caution",
      reason: "승인 결론은 있으나 근거 제목이 없어 출처 확인성이 낮습니다.",
      caution: "근거 문서나 법규 출처를 함께 확인한 뒤 재사용하세요.",
    };
  }
  return {
    state: "recommended",
    reason: "승인 결론, 적용 범위, 근거 제목이 함께 있어 프로젝트 WIKI 등록에 적합합니다.",
    caution: "공용 WIKI 후보화 시 프로젝트 특정 표현은 한 번 더 제거하세요.",
  };
}

function buildProviderPrompt(input: {
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
}) {
  return [
    `Task title: ${input.taskTitle}`,
    `Approved conclusion: ${input.approvedConclusion}`,
    `Approved scope: ${input.approvedScope}`,
    `Approved follow-up action: ${input.approvedFollowUpAction}`,
    "Evidence titles:",
    input.evidenceTitles.slice(0, 12).map((title, index) => `${index + 1}. ${title}`).join("\n") || "-",
    "",
    "Evaluate whether this approved task record should become project-scoped reusable knowledge.",
    "Use recommended only when it is generally reusable inside this project.",
    "Use caution when project-specific assumptions need a supplemental note or commonization warning.",
    "Use not_recommended when the content is one-off, sensitive, private, or too incomplete.",
  ].join("\n");
}

function buildProviderEvidence(evidenceTitles: string[]): AssistantEvidence[] {
  return evidenceTitles.slice(0, 8).map((title, index) => ({
    id: `project-wiki-suitability:evidence:${index + 1}`,
    kind: "task",
    priority: index + 1,
    title: normalizeDraftText(title) || `근거 ${index + 1}`,
    excerpt: normalizeDraftText(title) || "제목 없는 저장 근거",
  }));
}

function createSuitabilityRequestHash(input: {
  projectId: string;
  taskId: string;
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      projectId: input.projectId,
      taskId: input.taskId,
      taskTitle: input.taskTitle,
      approvedConclusion: input.approvedConclusion,
      approvedScope: input.approvedScope,
      approvedFollowUpAction: input.approvedFollowUpAction,
      evidenceTitles: input.evidenceTitles.slice(0, 12),
    }))
    .digest("hex");
}

function parseProviderDraft(answer: string): Partial<ProjectWikiDraft> {
  const jsonText = extractJsonObjectText(answer);
  if (!jsonText) {
    return {};
  }
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      aiSuitabilityState: normalizeSuitabilityState(parsed.state),
      aiSuitabilityReason: normalizeDraftText(asString(parsed.reason)),
      title: normalizeDraftText(asString(parsed.title)),
      summary: normalizeDraftText(asString(parsed.summary)),
      bodyMarkdown: normalizeMultilineText(asString(parsed.bodyMarkdown)),
      tags: asStringArray(parsed.tags),
      commonizationCaution: normalizeDraftText(asString(parsed.commonizationCaution)),
    };
  } catch {
    return {};
  }
}

function mergeProviderDraft(providerDraft: Partial<ProjectWikiDraft>, fallbackDraft: ProjectWikiDraft): ProjectWikiDraft {
  const state = providerDraft.aiSuitabilityState ?? fallbackDraft.aiSuitabilityState;
  return {
    title: clampText(providerDraft.title || fallbackDraft.title, PROJECT_WIKI_DRAFT_LIMITS.title),
    summary: clampText(providerDraft.summary || fallbackDraft.summary, PROJECT_WIKI_DRAFT_LIMITS.summary),
    bodyMarkdown: clampText(providerDraft.bodyMarkdown || fallbackDraft.bodyMarkdown, PROJECT_WIKI_DRAFT_LIMITS.bodyMarkdown),
    tags: (providerDraft.tags?.length ? providerDraft.tags : fallbackDraft.tags).slice(0, PROJECT_WIKI_DRAFT_LIMITS.tags),
    aiSuitabilityState: state,
    aiSuitabilityReason: clampText(providerDraft.aiSuitabilityReason || fallbackDraft.aiSuitabilityReason, PROJECT_WIKI_DRAFT_LIMITS.reason),
    commonizationCaution: clampText(providerDraft.commonizationCaution || fallbackDraft.commonizationCaution, PROJECT_WIKI_DRAFT_LIMITS.caution),
  };
}

function extractJsonObjectText(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : "";
}

function normalizeSuitabilityState(value: unknown): ProjectWikiSuitabilityState | undefined {
  return value === "recommended" || value === "caution" || value === "not_recommended" ? value : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asString).map(normalizeDraftText).filter(Boolean).slice(0, PROJECT_WIKI_DRAFT_LIMITS.tags);
}

function normalizeMultilineText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}

function buildTags(input: { taskTitle: string; approvedScope: string; evidenceTitles: string[] }) {
  const candidates = [
    ...extractTagCandidates(input.taskTitle),
    ...extractTagCandidates(input.approvedScope),
    ...input.evidenceTitles.flatMap(extractTagCandidates),
    "project-wiki",
  ];
  return [...new Set(candidates)].slice(0, PROJECT_WIKI_DRAFT_LIMITS.tags);
}

function extractTagCandidates(value: string) {
  return value
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 30)
    .slice(0, 4);
}

function firstSentence(value: string) {
  return value.split(/[.!?。！？\n]/u)[0]?.trim() ?? "";
}

function normalizeDraftText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/gu, " ").trim();
}

function clampText(value: string, maxLength: number) {
  const normalized = normalizeDraftText(value);
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

export function normalizeProjectWikiSuitabilityState(value: unknown): ProjectWikiSuitabilityState {
  if (value === "추천" || value === "recommended") {
    return "recommended";
  }
  if (value === "주의" || value === "caution") {
    return "caution";
  }
  if (value === "비추천" || value === "not_recommended") {
    return "not_recommended";
  }
  return "caution";
}
