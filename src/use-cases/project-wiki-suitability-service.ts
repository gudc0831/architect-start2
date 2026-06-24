import type { ProjectWikiDraft, ProjectWikiSuitabilityState } from "@/domains/project-wiki/types";

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
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
  userId: string;
}): Promise<ProjectWikiDraft> {
  return buildDeterministicProjectWikiDraft(input);
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
