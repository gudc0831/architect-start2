export type KnowledgeWorkTab = "candidates" | "approved" | "local_import" | "operations";
export type KnowledgeCandidateTab = "evidence" | "draft" | "decision";
export type KnowledgeDraftSubview = "sources" | "reasoning" | "ontology" | "toc" | "sections" | "preview" | "metadata";
export type KnowledgeApprovedFocus = "readback" | "export_sync";
export type KnowledgeApprovedSyncTarget = "portable_archive" | "obsidian" | "notion" | "assistant_retrieval";

export type KnowledgeAdminNavigation = {
  work: KnowledgeWorkTab;
  candidateTab: KnowledgeCandidateTab;
  draftSubview: KnowledgeDraftSubview;
  candidateId: string;
  approvedId: string;
  approvedFocus: KnowledgeApprovedFocus;
  approvedSyncTarget: KnowledgeApprovedSyncTarget;
  discoveryId: string;
  importPreviewId: string;
  rubricId: string;
};

export const knowledgeWorkTabLabels: Record<KnowledgeWorkTab, string> = {
  candidates: "후보 관리",
  approved: "승인 WIKI",
  local_import: "로컬 WIKI 가져오기",
  operations: "운영 점검",
};

export const knowledgeWorkTabDescriptions: Record<KnowledgeWorkTab, string> = {
  candidates: "자동 발굴 요청과 AI 검토 WIKI 후보를 구분해서 검토합니다.",
  approved: "승인 WIKI를 검색, 확인, 복사하고 보조 내보내기/동기화를 처리합니다.",
  local_import: "로컬 WIKI 후보를 미리보고 균형 선별 기준과 rubric을 관리합니다.",
  operations: "Provider, 법규 모니터, 파일 청크, sync worker, 출처 거버넌스를 점검합니다.",
};

export const knowledgeCandidateTabLabels: Record<KnowledgeCandidateTab, string> = {
  evidence: "근거 확인",
  draft: "초안 다듬기",
  decision: "승인 결정",
};

export const knowledgeCandidateTabDescriptions: Record<KnowledgeCandidateTab, string> = {
  evidence: "질문/답변, confidence reason, 근거 목록, 출처 유무와 우선순위를 확인합니다.",
  draft: "제목, 요약, 태그, 범위, Markdown 본문과 미리보기를 다듬습니다.",
  decision: "경고/차단 항목, 반려 사유, 승인 패키지, 최종 승인/반려를 처리합니다.",
};

export const knowledgeWorkTabs = Object.keys(knowledgeWorkTabLabels) as KnowledgeWorkTab[];
export const knowledgeCandidateTabs = Object.keys(knowledgeCandidateTabLabels) as KnowledgeCandidateTab[];
export const knowledgeDraftSubviews: KnowledgeDraftSubview[] = [
  "sources",
  "reasoning",
  "ontology",
  "toc",
  "sections",
  "preview",
  "metadata",
];
export const knowledgeApprovedFocusValues: KnowledgeApprovedFocus[] = ["readback", "export_sync"];
export const knowledgeApprovedSyncTargets: KnowledgeApprovedSyncTarget[] = [
  "portable_archive",
  "obsidian",
  "notion",
  "assistant_retrieval",
];

export const defaultKnowledgeAdminNavigation: KnowledgeAdminNavigation = {
  work: "candidates",
  candidateTab: "evidence",
  draftSubview: "sources",
  candidateId: "",
  approvedId: "",
  approvedFocus: "readback",
  approvedSyncTarget: "portable_archive",
  discoveryId: "",
  importPreviewId: "",
  rubricId: "",
};

export function parseKnowledgeAdminNavigation(searchParams: URLSearchParams): KnowledgeAdminNavigation {
  return {
    work: parseEnum(searchParams.get("work"), knowledgeWorkTabs, defaultKnowledgeAdminNavigation.work),
    candidateTab: parseEnum(searchParams.get("candidateTab"), knowledgeCandidateTabs, defaultKnowledgeAdminNavigation.candidateTab),
    draftSubview: parseEnum(searchParams.get("draftSubview"), knowledgeDraftSubviews, defaultKnowledgeAdminNavigation.draftSubview),
    candidateId: searchParams.get("candidateId")?.trim() ?? "",
    approvedId: searchParams.get("approvedId")?.trim() ?? "",
    approvedFocus: parseEnum(searchParams.get("approvedFocus"), knowledgeApprovedFocusValues, defaultKnowledgeAdminNavigation.approvedFocus),
    approvedSyncTarget: parseEnum(
      searchParams.get("approvedSyncTarget"),
      knowledgeApprovedSyncTargets,
      defaultKnowledgeAdminNavigation.approvedSyncTarget,
    ),
    discoveryId: searchParams.get("discoveryId")?.trim() ?? "",
    importPreviewId: searchParams.get("importPreviewId")?.trim() ?? "",
    rubricId: searchParams.get("rubricId")?.trim() ?? "",
  };
}

export function serializeKnowledgeAdminNavigation(
  current: URLSearchParams,
  next: Partial<KnowledgeAdminNavigation>,
) {
  const params = new URLSearchParams(current);
  const merged = {
    ...parseKnowledgeAdminNavigation(params),
    ...next,
  };

  writeParam(params, "work", merged.work, defaultKnowledgeAdminNavigation.work);
  writeParam(params, "candidateTab", merged.candidateTab, defaultKnowledgeAdminNavigation.candidateTab);
  writeParam(params, "draftSubview", merged.draftSubview, defaultKnowledgeAdminNavigation.draftSubview);
  writeParam(params, "candidateId", merged.candidateId, "");
  writeParam(params, "approvedId", merged.approvedId, "");
  writeParam(params, "approvedFocus", merged.approvedFocus, defaultKnowledgeAdminNavigation.approvedFocus);
  writeParam(params, "approvedSyncTarget", merged.approvedSyncTarget, defaultKnowledgeAdminNavigation.approvedSyncTarget);
  writeParam(params, "discoveryId", merged.discoveryId, "");
  writeParam(params, "importPreviewId", merged.importPreviewId, "");
  writeParam(params, "rubricId", merged.rubricId, "");

  return params.toString();
}

export function knowledgeWorkTabDomId(tab: KnowledgeWorkTab) {
  return `knowledge-work-tab-${tab}`;
}

export function knowledgeWorkPanelDomId(tab: KnowledgeWorkTab) {
  return `knowledge-work-panel-${tab}`;
}

export function knowledgeCandidateTabDomId(tab: KnowledgeCandidateTab) {
  return `knowledge-candidate-tab-${tab}`;
}

export function knowledgeCandidatePanelDomId(tab: KnowledgeCandidateTab) {
  return `knowledge-candidate-panel-${tab}`;
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T) {
  return value && allowed.includes(value as T) ? value as T : fallback;
}

function writeParam(params: URLSearchParams, key: string, value: string, fallback: string) {
  if (!value || value === fallback) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
