"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

type CandidateState = "candidate" | "pending_review" | "approved" | "rejected" | "not_candidate";
type Scope = "admin_only" | "organization" | "project_members" | "project";

type Evidence = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  priority: number;
  sourceUrl?: string;
};

type CandidateListItem = {
  id: string;
  state: CandidateState;
  title: string;
  summary: string;
  tags: string[];
  projectName: string;
  taskIssueId: string;
  taskTitle: string;
  confidenceScore: number;
  cleanupState: "draft" | "approved" | "deferred";
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CandidateDetail = CandidateListItem & {
  question: string;
  answer: string;
  evidence: Evidence[];
  confidenceReason: string;
  wikiDraft: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    tags: string[];
    scope: Scope;
  };
  review: {
    status: "approved" | "rejected";
    reviewedAt: string;
    rejectionReason?: string;
  } | null;
  approvedKnowledgeItem: unknown | null;
};

type KnowledgeAdminShellProps = {
  initialCandidates: CandidateListItem[];
};

type ApprovalGuardrail = {
  label: string;
  detail: string;
  tone: "ready" | "warning";
};

type ApprovalRiskGroup = {
  key: "scope" | "metadata" | "structure" | "evidence" | "state";
  label: string;
  readyCount: number;
  warningCount: number;
  items: ApprovalGuardrail[];
};

type ApprovalRiskFilter = ApprovalRiskGroup["key"] | "all";

type MarkdownHeading = {
  level: number;
  line: number;
  text: string;
};

type MarkdownStructureSummary = {
  headings: number;
  paragraphs: number;
  listItems: number;
  lines: number;
};

type MarkdownWikiLink = {
  line: number;
  target: string;
  label: string;
};

type CandidateRiskFilter = "all" | "low_confidence" | "unreviewed" | "cleanup_approved";
type CandidateSort = "newest" | "low_confidence";
type EvidenceSourceFilter = "all" | "sourced" | "unsourced";
type EvidencePriorityFilter = "all" | "high" | "normal" | "low";

const stateLabels: Record<CandidateState, string> = {
  candidate: "검토 대기",
  pending_review: "검토 중",
  approved: "승인됨",
  rejected: "반려됨",
  not_candidate: "후보 제외",
};

const scopeLabels: Record<Scope, string> = {
  admin_only: "관리자 전용",
  organization: "조직 공통",
  project_members: "프로젝트 멤버",
  project: "프로젝트 전용",
};

const candidateRiskFilterLabels: Record<CandidateRiskFilter, string> = {
  all: "All risk",
  low_confidence: "Low confidence",
  unreviewed: "Unreviewed",
  cleanup_approved: "Cleanup approved",
};

const candidateSortLabels: Record<CandidateSort, string> = {
  newest: "Newest first",
  low_confidence: "Low confidence first",
};

const evidenceSourceFilterLabels: Record<EvidenceSourceFilter, string> = {
  all: "All evidence",
  sourced: "Sourced",
  unsourced: "Unsourced",
};

const evidencePriorityFilterLabels: Record<EvidencePriorityFilter, string> = {
  all: "All priorities",
  high: "High priority",
  normal: "Normal priority",
  low: "Low priority",
};

export function KnowledgeAdminShell({ initialCandidates }: KnowledgeAdminShellProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedId, setSelectedId] = useState(initialCandidates[0]?.id ?? "");
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState("후보를 선택하세요.");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CandidateState | "all">("candidate");
  const [riskFilter, setRiskFilter] = useState<CandidateRiskFilter>("all");
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("newest");
  const [candidateQueueCompact, setCandidateQueueCompact] = useState(false);
  const [evidenceSourceFilter, setEvidenceSourceFilter] = useState<EvidenceSourceFilter>("all");
  const [evidencePriorityFilter, setEvidencePriorityFilter] = useState<EvidencePriorityFilter>("all");
  const [approvalRiskFilter, setApprovalRiskFilter] = useState<ApprovalRiskFilter>("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [previewCompact, setPreviewCompact] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    summary: "",
    bodyMarkdown: "",
    tagsText: "",
    scope: "organization" as Scope,
    rejectionReason: "",
  });

  const visibleCandidates = useMemo(() => {
    const search = candidateSearch.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const stateMatches = filter === "all" || candidate.state === filter;
      if (!stateMatches) {
        return false;
      }
      const riskMatches =
        riskFilter === "all" ||
        (riskFilter === "low_confidence" && candidate.confidenceScore < 60) ||
        (riskFilter === "unreviewed" && !candidate.reviewedAt) ||
        (riskFilter === "cleanup_approved" && candidate.cleanupState === "approved");
      if (!riskMatches) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        candidate.title,
        candidate.summary,
        candidate.projectName,
        candidate.taskIssueId,
        candidate.taskTitle,
        candidate.tags.join(" "),
      ].some((value) => value.toLowerCase().includes(search));
    }).sort((left, right) => {
      if (candidateSort === "low_confidence") {
        return left.confidenceScore - right.confidenceScore || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [candidateSearch, candidateSort, candidates, filter, riskFilter]);
  const activeCandidateFilterChips = useMemo(() => {
    const search = candidateSearch.trim();
    return [
      `State: ${filter === "all" ? "All" : stateLabels[filter]}`,
      `Risk: ${candidateRiskFilterLabels[riskFilter]}`,
      `Sort: ${candidateSortLabels[candidateSort]}`,
      search ? `Search: ${search}` : "Search: none",
      `Showing: ${visibleCandidates.length}/${candidates.length}`,
    ];
  }, [candidateSearch, candidateSort, candidates.length, filter, riskFilter, visibleCandidates.length]);
  const candidateStateCounts = useMemo(
    () => ({
      all: candidates.length,
      candidate: candidates.filter((candidate) => candidate.state === "candidate").length,
      approved: candidates.filter((candidate) => candidate.state === "approved").length,
      rejected: candidates.filter((candidate) => candidate.state === "rejected").length,
    }),
    [candidates],
  );
  const candidateRiskCounts = useMemo(
    () => ({
      lowConfidence: candidates.filter((candidate) => candidate.confidenceScore < 60).length,
      unreviewed: candidates.filter((candidate) => !candidate.reviewedAt).length,
      cleanupApproved: candidates.filter((candidate) => candidate.cleanupState === "approved").length,
    }),
    [candidates],
  );
  const visibleCandidateRiskCounts = useMemo(
    () => ({
      lowConfidence: visibleCandidates.filter((candidate) => candidate.confidenceScore < 60).length,
      unreviewed: visibleCandidates.filter((candidate) => !candidate.reviewedAt).length,
      cleanupApproved: visibleCandidates.filter((candidate) => candidate.cleanupState === "approved").length,
    }),
    [visibleCandidates],
  );
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  );
  const selectedCandidateIndex = visibleCandidates.findIndex((candidate) => candidate.id === selectedId);
  const originalDraft = useMemo(() => (detail ? createDraftFromDetail(detail) : null), [detail]);
  const draftTags = useMemo(() => splitTags(draft.tagsText), [draft.tagsText]);
  const duplicateDraftTags = useMemo(() => readDuplicateTags(draftTags), [draftTags]);
  const scopeReview = useMemo(
    () => readScopeReview(draft.scope, originalDraft?.scope ?? null),
    [draft.scope, originalDraft?.scope],
  );
  const draftReadiness = useMemo(
    () => [
      { label: "Title", ready: Boolean(draft.title.trim()) },
      { label: "Summary", ready: Boolean(draft.summary.trim()) },
      { label: "Body", ready: Boolean(draft.bodyMarkdown.trim()) },
      { label: "Tags", ready: draftTags.length > 0 },
      { label: "Evidence", ready: Boolean(detail?.evidence.length) },
    ],
    [detail?.evidence.length, draft.bodyMarkdown, draft.summary, draft.title, draftTags.length],
  );
  const draftDirtyStates = useMemo(() => {
    if (!originalDraft) {
      return [];
    }

    return [
      { label: "Title", dirty: draft.title !== originalDraft.title },
      { label: "Summary", dirty: draft.summary !== originalDraft.summary },
      { label: "Body", dirty: draft.bodyMarkdown !== originalDraft.bodyMarkdown },
      { label: "Tags", dirty: draftTags.join("|") !== splitTags(originalDraft.tagsText).join("|") },
      { label: "Scope", dirty: draft.scope !== originalDraft.scope },
      { label: "Rejection reason", dirty: draft.rejectionReason.trim() !== originalDraft.rejectionReason.trim() },
    ];
  }, [draft.bodyMarkdown, draft.rejectionReason, draft.scope, draft.summary, draft.title, draftTags, originalDraft]);
  const dirtyDraftCount = draftDirtyStates.filter((item) => item.dirty).length;
  const markdownOutline = useMemo(
    () => readMarkdownOutline(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const markdownStructureSummary = useMemo(
    () => readMarkdownStructureSummary(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const markdownWikiLinks = useMemo(
    () => readMarkdownWikiLinks(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const evidenceKindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of detail?.evidence ?? []) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [detail?.evidence]);
  const evidencePriorityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of detail?.evidence ?? []) {
      const tier = readEvidencePriorityTier(item.priority);
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [detail?.evidence]);
  const evidenceSourceCoverage = useMemo(() => {
    const evidence = detail?.evidence ?? [];
    const sourced = evidence.filter((item) => Boolean(item.sourceUrl)).length;
    return {
      sourced,
      unsourced: evidence.length - sourced,
      total: evidence.length,
    };
  }, [detail?.evidence]);
  const visibleEvidence = useMemo(() => {
    const evidence = detail?.evidence ?? [];
    return evidence.filter((item) => {
      const sourceMatches =
        evidenceSourceFilter === "all" ||
        (evidenceSourceFilter === "sourced" && Boolean(item.sourceUrl)) ||
        (evidenceSourceFilter === "unsourced" && !item.sourceUrl);
      const priorityMatches =
        evidencePriorityFilter === "all" ||
        readEvidencePriorityFilter(item.priority) === evidencePriorityFilter;
      return sourceMatches && priorityMatches;
    });
  }, [detail?.evidence, evidencePriorityFilter, evidenceSourceFilter]);
  const activeEvidenceFilterChips = useMemo(() => {
    const total = detail?.evidence.length ?? 0;
    return [
      `Source: ${evidenceSourceFilterLabels[evidenceSourceFilter]}`,
      `Priority: ${evidencePriorityFilterLabels[evidencePriorityFilter]}`,
      `Visible: ${visibleEvidence.length}/${total}`,
    ];
  }, [detail?.evidence.length, evidencePriorityFilter, evidenceSourceFilter, visibleEvidence.length]);
  const visibleEvidenceSummary = useMemo(() => {
    const sourced = visibleEvidence.filter((item) => Boolean(item.sourceUrl)).length;
    const high = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "high").length;
    const normal = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "normal").length;
    const low = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "low").length;
    return {
      sourced,
      unsourced: visibleEvidence.length - sourced,
      high,
      normal,
      low,
    };
  }, [visibleEvidence]);
  const approvalGuardrails = useMemo(
    () => buildApprovalGuardrails(
      draftReadiness,
      detail,
      draftDirtyStates,
      markdownOutline,
      markdownStructureSummary,
      markdownWikiLinks,
      draftTags,
      duplicateDraftTags,
      draft.scope,
      originalDraft?.scope ?? null,
      draft.bodyMarkdown,
    ),
    [
      detail,
      draft.bodyMarkdown,
      draftDirtyStates,
      draftReadiness,
      markdownOutline,
      markdownStructureSummary,
      markdownWikiLinks,
      draftTags,
      duplicateDraftTags,
      draft.scope,
      originalDraft?.scope,
    ],
  );
  const guardrailWarningCount = approvalGuardrails.filter((item) => item.tone === "warning").length;
  const approvalRiskGroups = useMemo(
    () => readApprovalRiskGroups(approvalGuardrails),
    [approvalGuardrails],
  );
  const visibleApprovalRiskGroups = useMemo(
    () => approvalRiskFilter === "all"
      ? approvalRiskGroups
      : approvalRiskGroups.filter((group) => group.key === approvalRiskFilter),
    [approvalRiskFilter, approvalRiskGroups],
  );
  const approvalRiskWarningGroupCount = approvalRiskGroups.filter((group) => group.warningCount > 0).length;
  const readyReadinessCount = draftReadiness.filter((item) => item.ready).length;
  const reviewStatus = readReviewStatus(guardrailWarningCount, readyReadinessCount, draftReadiness.length);
  const hasCustomCandidateFilters =
    filter !== "candidate" || riskFilter !== "all" || Boolean(candidateSearch.trim());
  const hasCustomEvidenceFilters = evidenceSourceFilter !== "all" || evidencePriorityFilter !== "all";

  useEffect(() => {
    if (!selectedId && visibleCandidates[0]) {
      setSelectedId(visibleCandidates[0].id);
    }
  }, [selectedId, visibleCandidates]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let active = true;
    setBusy(true);
    setStatus("후보 상세를 불러오는 중입니다.");
    readJson<CandidateDetail>(`/api/admin/knowledge/candidates/${selectedId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setDetail(data);
        setDraft(createDraftFromDetail(data));
        setStatus(`${stateLabels[data.state]} 후보를 불러왔습니다.`);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setDetail(null);
        setStatus(error instanceof Error ? error.message : "후보 상세를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  async function refreshCandidates(nextSelectedId = selectedId) {
    const data = await readJson<CandidateListItem[]>("/api/admin/knowledge/candidates");
    setCandidates(data);
    setSelectedId(nextSelectedId);
  }

  function resetDraft() {
    if (!detail) {
      return;
    }

    setDraft(createDraftFromDetail(detail));
    setStatus("Draft restored from selected candidate.");
  }

  async function copyDraftMarkdown() {
    if (!draft.bodyMarkdown.trim()) {
      setStatus("No Markdown body to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.bodyMarkdown);
      setStatus("Markdown draft copied.");
    } catch {
      setStatus("Clipboard copy failed. Select the Markdown body manually.");
    }
  }

  async function copySourceHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createSourceHandoff(detail, draft, evidenceKindCounts));
      setStatus("Source handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Use the source chips to assemble the handoff manually.");
    }
  }

  async function copyApprovalChecklist() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createApprovalChecklist(detail, draftReadiness, approvalGuardrails, evidenceKindCounts),
      );
      setStatus("Approval checklist copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the guardrails manually.");
    }
  }

  async function copyApprovalRiskSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge approval risk summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Warning groups: ${approvalRiskWarningGroupCount}/${approvalRiskGroups.length}`,
          `- Warnings: ${guardrailWarningCount}`,
          "",
          ...approvalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- Warnings: ${group.warningCount}`,
            `- Ready: ${group.readyCount}`,
            ...group.items
              .filter((item) => item.tone === "warning")
              .map((item) => `- ${item.label}: ${item.detail}`),
            group.warningCount ? "" : "- No warnings",
            "",
          ]),
        ].join("\n"),
      );
      setStatus("Approval risk summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approval risk summary manually.");
    }
  }

  async function copyApprovalRiskFilterHandoff() {
    if (!detail) {
      return;
    }

    const activeLabel = approvalRiskFilter === "all"
      ? "All risk groups"
      : approvalRiskGroups.find((group) => group.key === approvalRiskFilter)?.label ?? approvalRiskFilter;
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge approval risk filter handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Active risk group: ${activeLabel}`,
          `- Showing: ${visibleApprovalRiskGroups.length}/${approvalRiskGroups.length}`,
          "",
          ...visibleApprovalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- Warnings: ${group.warningCount}`,
            `- Ready: ${group.readyCount}`,
            ...(
              group.warningCount
                ? group.items
                  .filter((item) => item.tone === "warning")
                  .map((item) => `- Warning: ${item.label} - ${item.detail}`)
                : [`- No ${group.label.toLowerCase()} warnings in the current draft.`]
            ),
            ...group.items
              .filter((item) => item.tone === "ready")
              .slice(0, 4)
              .map((item) => `- Ready: ${item.label}`),
            "",
          ]),
        ].join("\n"),
      );
      setStatus("Approval risk filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the active risk filter chips manually.");
    }
  }

  async function copyCandidateFilterHandoff() {
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge candidate queue handoff",
          `- State: ${filter === "all" ? "All" : stateLabels[filter]}`,
          `- Risk: ${candidateRiskFilterLabels[riskFilter]}`,
          `- Sort: ${candidateSortLabels[candidateSort]}`,
          `- Search: ${candidateSearch.trim() || "none"}`,
          `- Showing: ${visibleCandidates.length}/${candidates.length}`,
          `- Selected: ${selectedCandidate ? `${selectedCandidate.title} (${selectedCandidate.id})` : "none"}`,
        ].join("\n"),
      );
      setStatus("Candidate filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the active filter chips manually.");
    }
  }

  async function copyEvidenceFilterHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge evidence filter handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Source filter: ${evidenceSourceFilterLabels[evidenceSourceFilter]}`,
          `- Priority filter: ${evidencePriorityFilterLabels[evidencePriorityFilter]}`,
          `- Visible evidence: ${visibleEvidence.length}/${detail.evidence.length}`,
          "",
          "Visible evidence",
          ...visibleEvidence.map((item) => `- ${item.title} (${item.kind}, ${readEvidencePriorityTier(item.priority)}, priority ${item.priority})`),
        ].join("\n"),
      );
      setStatus("Evidence filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the evidence filter chips manually.");
    }
  }

  async function copyDirtyDraftSummary() {
    if (!detail) {
      return;
    }

    const changedFields = draftDirtyStates.filter((item) => item.dirty).map((item) => item.label);
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge dirty draft summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Changed fields: ${changedFields.length}/${draftDirtyStates.length}`,
          `- Fields: ${changedFields.join(", ") || "none"}`,
          `- Scope: ${scopeLabels[draft.scope]}`,
          `- Tags: ${draftTags.join(", ") || "none"}`,
        ].join("\n"),
      );
      setStatus("Dirty draft summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the dirty-state indicators manually.");
    }
  }

  async function copyMarkdownOutline() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown outline",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Headings: ${markdownOutline.length}`,
          "",
          ...(
            markdownOutline.length
              ? markdownOutline.map((heading) => `- H${heading.level} L${heading.line}: ${heading.text}`)
              : ["- No Markdown headings"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown outline copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown outline manually.");
    }
  }

  async function copyMarkdownStructureSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown structure summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Headings: ${markdownStructureSummary.headings}`,
          `- Paragraphs: ${markdownStructureSummary.paragraphs}`,
          `- List items: ${markdownStructureSummary.listItems}`,
          `- Non-empty lines: ${markdownStructureSummary.lines}`,
        ].join("\n"),
      );
      setStatus("Markdown structure summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown structure summary manually.");
    }
  }

  async function copyMarkdownWikiLinks() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown WIKI links",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- WIKI links: ${markdownWikiLinks.length}`,
          "",
          ...(
            markdownWikiLinks.length
              ? markdownWikiLinks.map((link) => `- L${link.line}: [[${link.target}]]${link.label !== link.target ? ` as ${link.label}` : ""}`)
              : ["- No Markdown WIKI links"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown WIKI links copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown WIKI link preview manually.");
    }
  }

  async function copyDraftTagHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge draft tag handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Tags: ${draftTags.length}`,
          `- Duplicate tags: ${duplicateDraftTags.join(", ") || "none"}`,
          "",
          ...(
            draftTags.length
              ? draftTags.map((tag) => `- ${tag}`)
              : ["- No draft tags"]
          ),
        ].join("\n"),
      );
      setStatus("Draft tag handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the draft tag preview manually.");
    }
  }

  async function copyScopeHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge publication scope handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Current scope: ${scopeLabels[draft.scope]}`,
          `- Original scope: ${originalDraft ? scopeLabels[originalDraft.scope] : "unknown"}`,
          `- Scope changed: ${scopeReview.changed ? "yes" : "no"}`,
          `- Scope review: ${scopeReview.label}`,
          `- Review note: ${scopeReview.detail}`,
        ].join("\n"),
      );
      setStatus("Publication scope handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the publication scope preview manually.");
    }
  }

  async function approveCandidate() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setStatus("WIKI 지식으로 승인하는 중입니다.");
    try {
      const data = await writeJson<CandidateDetail>(`/api/admin/knowledge/candidates/${detail.id}/approve`, {
        title: draft.title,
        summary: draft.summary,
        bodyMarkdown: draft.bodyMarkdown,
        tags: draftTags,
        scope: draft.scope,
      });
      setDetail(data);
      await refreshCandidates(data.id);
      setStatus("승인된 지식으로 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectCandidate() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setStatus("후보를 반려하는 중입니다.");
    try {
      const data = await writeJson<CandidateDetail>(`/api/admin/knowledge/candidates/${detail.id}/reject`, {
        rejectionReason: draft.rejectionReason,
      });
      setDetail(data);
      await refreshCandidates(data.id);
      setStatus("후보를 반려했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "반려에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function clearCandidateFilters() {
    setFilter("candidate");
    setRiskFilter("all");
    setCandidateSearch("");
  }

  function revealSelectedCandidate() {
    if (!selectedCandidate) {
      return;
    }
    if (selectedCandidate.state === "candidate" || selectedCandidate.state === "approved" || selectedCandidate.state === "rejected") {
      setFilter(selectedCandidate.state);
    } else {
      setFilter("all");
    }
    setRiskFilter("all");
    setCandidateSearch("");
    setCandidateSort("newest");
  }

  function clearEvidenceFilters() {
    setEvidenceSourceFilter("all");
    setEvidencePriorityFilter("all");
  }

  function clearApprovalRiskFilter() {
    setApprovalRiskFilter("all");
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Knowledge Admin</p>
          <h1>WIKI 후보 검토</h1>
        </div>
        <a className={styles.secondaryLink} href="/admin">관리 설정</a>
      </header>

      <div className={styles.layout}>
        <aside className={styles.queue} aria-label="Knowledge candidates">
          <div className={styles.queueHeader}>
            <h2>후보 목록</h2>
            <select
              aria-label="후보 상태 필터"
              value={filter}
              onChange={(event) => setFilter(event.target.value as CandidateState | "all")}
            >
              <option value="candidate">검토 대기</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
              <option value="all">전체</option>
            </select>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge candidate state counts">
            <span>Candidate {candidateStateCounts.candidate}</span>
            <span>Approved {candidateStateCounts.approved}</span>
            <span>Rejected {candidateStateCounts.rejected}</span>
            <span>All {candidateStateCounts.all}</span>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge candidate risk totals">
            <span>Low confidence {candidateRiskCounts.lowConfidence}</span>
            <span>Unreviewed {candidateRiskCounts.unreviewed}</span>
            <span>Cleanup approved {candidateRiskCounts.cleanupApproved}</span>
            <span>Risk groups 3</span>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge visible candidate risk totals">
            <span>Visible low {visibleCandidateRiskCounts.lowConfidence}</span>
            <span>Visible unreviewed {visibleCandidateRiskCounts.unreviewed}</span>
            <span>Visible cleanup {visibleCandidateRiskCounts.cleanupApproved}</span>
            <span>Visible {visibleCandidates.length}</span>
          </div>
          <div className={styles.queueQuickFilters} aria-label="Knowledge candidate quick filters">
            {(["candidate", "approved", "rejected", "all"] as Array<CandidateState | "all">).map((value) => (
              <button
                className={filter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "all" ? "All" : stateLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.queueQuickFilters} aria-label="Knowledge candidate risk quick filters">
            {(["all", "low_confidence", "unreviewed", "cleanup_approved"] as CandidateRiskFilter[]).map((value) => (
              <button
                className={riskFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                key={value}
                onClick={() => setRiskFilter(value)}
                type="button"
              >
                {candidateRiskFilterLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.queueFilterSummary} aria-label="Knowledge candidate active filter chips">
            {activeCandidateFilterChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
          <div className={styles.queueFilterActions}>
            <button disabled={!hasCustomCandidateFilters} onClick={clearCandidateFilters} type="button">
              Clear candidate filters
            </button>
            <button onClick={copyCandidateFilterHandoff} type="button">Copy filter handoff</button>
          </div>
          <label className={styles.queueSort}>
            Sort candidates
            <select
              aria-label="Knowledge candidate sort"
              onChange={(event) => setCandidateSort(event.target.value as CandidateSort)}
              value={candidateSort}
            >
              {(["newest", "low_confidence"] as CandidateSort[]).map((value) => (
                <option key={value} value={value}>{candidateSortLabels[value]}</option>
              ))}
            </select>
          </label>
          <div className={styles.queueSelectionSummary} aria-label="Knowledge candidate selection summary">
            {selectedCandidate ? (
              <>
                <span>{selectedCandidateIndex >= 0 ? `Selected ${selectedCandidateIndex + 1}/${visibleCandidates.length}` : "Selected outside filters"}</span>
                <strong>{selectedCandidate.title}</strong>
                {selectedCandidateIndex < 0 ? (
                  <button onClick={revealSelectedCandidate} type="button">Show selected candidate</button>
                ) : null}
              </>
            ) : (
              <span>No selected candidate</span>
            )}
          </div>
          <div className={styles.queueDensity} aria-label="Knowledge candidate queue density controls">
            <button
              className={candidateQueueCompact ? styles.queueQuickFilter : styles.queueQuickFilterActive}
              onClick={() => setCandidateQueueCompact(false)}
              type="button"
            >
              Detailed queue
            </button>
            <button
              className={candidateQueueCompact ? styles.queueQuickFilterActive : styles.queueQuickFilter}
              onClick={() => setCandidateQueueCompact(true)}
              type="button"
            >
              Compact queue
            </button>
          </div>
          <label className={styles.queueSearch}>
            Search candidates
            <div>
              <input
                onChange={(event) => setCandidateSearch(event.target.value)}
                placeholder="Title, task, project, tag"
                value={candidateSearch}
              />
              <button disabled={!candidateSearch.trim()} onClick={() => setCandidateSearch("")} type="button">
                Clear
              </button>
            </div>
          </label>

          <div className={styles.candidateList}>
            {visibleCandidates.length ? visibleCandidates.map((candidate) => (
              <button
                className={candidate.id === selectedId ? styles.candidateActive : styles.candidate}
                key={candidate.id}
                onClick={() => setSelectedId(candidate.id)}
                type="button"
              >
                <span>{stateLabels[candidate.state]}</span>
                <strong>{candidate.title}</strong>
                {candidateQueueCompact ? null : <small>{candidate.projectName} / {candidate.taskIssueId}</small>}
                <span className={styles.candidateRiskChips}>
                  <span>Confidence {readConfidenceBand(candidate.confidenceScore)}</span>
                  <span>{candidate.reviewedAt ? "Reviewed" : "Unreviewed"}</span>
                  <span>Cleanup {candidate.cleanupState}</span>
                </span>
              </button>
            )) : (
              <p className={styles.empty}>표시할 후보가 없습니다.</p>
            )}
          </div>
        </aside>

        <main className={styles.detail}>
          {detail ? (
            <>
              <section className={styles.summaryBand}>
                <div>
                  <p>{detail.projectName} / {detail.taskIssueId}</p>
                  <h2>{detail.taskTitle}</h2>
                </div>
                <span>{detail.confidenceScore}%</span>
              </section>

              <section className={styles.grid}>
                <div className={styles.panel}>
                  <h3>원문 검토</h3>
                  <dl className={styles.meta}>
                    <div>
                      <dt>상태</dt>
                      <dd>{stateLabels[detail.state]}</dd>
                    </div>
                    <div>
                      <dt>정리 상태</dt>
                      <dd>{detail.cleanupState}</dd>
                    </div>
                    <div>
                      <dt>신뢰도</dt>
                      <dd>{detail.confidenceReason}</dd>
                    </div>
                  </dl>
                  <h4>질문</h4>
                  <p>{detail.question}</p>
                  <h4>답변</h4>
                  <p className={styles.answer}>{detail.answer}</p>
                </div>

                <div className={styles.panel}>
                  <h3>근거</h3>
                  <div className={styles.evidenceFilters} aria-label="Knowledge evidence source filters">
                    {(["all", "sourced", "unsourced"] as EvidenceSourceFilter[]).map((value) => (
                      <button
                        className={evidenceSourceFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                        key={value}
                        onClick={() => setEvidenceSourceFilter(value)}
                        type="button"
                      >
                        {evidenceSourceFilterLabels[value]}
                      </button>
                    ))}
                  </div>
                  <div className={styles.evidenceFilters} aria-label="Knowledge evidence priority filters">
                    {(["all", "high", "normal", "low"] as EvidencePriorityFilter[]).map((value) => (
                      <button
                        className={evidencePriorityFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                        key={value}
                        onClick={() => setEvidencePriorityFilter(value)}
                        type="button"
                      >
                        {evidencePriorityFilterLabels[value]}
                      </button>
                    ))}
                  </div>
                  <div className={styles.sourceChips} aria-label="Knowledge active evidence filter chips">
                    {activeEvidenceFilterChips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  <div className={styles.sourceChips} aria-label="Knowledge visible evidence summary">
                    <span>Visible sourced {visibleEvidenceSummary.sourced}</span>
                    <span>Visible unsourced {visibleEvidenceSummary.unsourced}</span>
                    <span>Visible high {visibleEvidenceSummary.high}</span>
                    <span>Visible normal {visibleEvidenceSummary.normal}</span>
                    <span>Visible low {visibleEvidenceSummary.low}</span>
                  </div>
                  <div className={styles.evidenceFilters}>
                    <button
                      className={styles.queueQuickFilter}
                      disabled={!hasCustomEvidenceFilters}
                      onClick={clearEvidenceFilters}
                      type="button"
                    >
                      Clear evidence filters
                    </button>
                    <button className={styles.queueQuickFilter} onClick={copyEvidenceFilterHandoff} type="button">
                      Copy evidence filter handoff
                    </button>
                  </div>
                  <div className={styles.evidenceList}>
                    {visibleEvidence.length ? visibleEvidence.map((evidence) => (
                      <article className={styles.evidence} key={evidence.id}>
                        <span>{evidence.kind}</span>
                        <span>{readEvidencePriorityTier(evidence.priority)} / Priority {evidence.priority}</span>
                        <strong>{evidence.title}</strong>
                        <p>{evidence.excerpt}</p>
                        {evidence.sourceUrl ? (
                          <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
                            source
                          </a>
                        ) : null}
                      </article>
                    )) : (
                      <p className={styles.empty}>
                        No evidence matches {evidenceSourceFilterLabels[evidenceSourceFilter]} and {evidencePriorityFilterLabels[evidencePriorityFilter]}. Clear evidence filters to restore rows.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className={styles.editor}>
                <div className={styles.editorHeader}>
                  <div>
                    <p>WIKI Draft</p>
                    <h3>승인 전 편집</h3>
                  </div>
                  <div className={styles.editorTools}>
                    <button onClick={resetDraft} type="button">Reset draft</button>
                    <button disabled={!draft.bodyMarkdown.trim()} onClick={copyDraftMarkdown} type="button">
                      Copy Markdown
                    </button>
                    <button onClick={copyMarkdownOutline} type="button">Copy Markdown outline</button>
                    <button onClick={copyMarkdownStructureSummary} type="button">Copy Markdown structure</button>
                    <button onClick={copyMarkdownWikiLinks} type="button">Copy WIKI links</button>
                    <button onClick={copyDraftTagHandoff} type="button">Copy draft tags</button>
                    <button onClick={copyScopeHandoff} type="button">Copy scope handoff</button>
                    <button onClick={copySourceHandoff} type="button">Copy source handoff</button>
                    <button onClick={copyApprovalChecklist} type="button">Copy approval checklist</button>
                    <button onClick={copyApprovalRiskSummary} type="button">Copy risk summary</button>
                    <button onClick={copyDirtyDraftSummary} type="button">Copy dirty draft summary</button>
                    <select
                      aria-label="공개 범위"
                      value={draft.scope}
                      onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as Scope }))}
                    >
                      {Object.entries(scopeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <section
                  className={dirtyDraftCount ? styles.reviewBannerWarning : styles.reviewBannerReady}
                  aria-label="Knowledge dirty draft reset warning"
                >
                  <strong>{dirtyDraftCount ? "Draft has unsaved edits" : "Draft matches selected candidate"}</strong>
                  <p>
                    {dirtyDraftCount
                      ? `Reset draft will discard ${dirtyDraftCount} changed field${dirtyDraftCount === 1 ? "" : "s"}.`
                      : "Reset draft will keep the current values unchanged."}
                  </p>
                </section>
                <section
                  className={reviewStatus.tone === "ready" ? styles.reviewBannerReady : styles.reviewBannerWarning}
                  aria-label="Knowledge review status banner"
                >
                  <strong>{reviewStatus.label}</strong>
                  <p>{reviewStatus.detail}</p>
                </section>
                <div className={styles.sourceChips} aria-label="Knowledge draft source references">
                  <span>Task {detail.taskIssueId}</span>
                  <span>Record {detail.id.slice(0, 8)}</span>
                  <span>{detail.evidence.length} evidence</span>
                  <span>Scope {scopeLabels[draft.scope]}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft freshness">
                  <span>Created {formatDate(detail.createdAt)}</span>
                  <span>Updated {formatDate(detail.updatedAt)}</span>
                  <span>Reviewed {detail.reviewedAt ? formatDate(detail.reviewedAt) : "-"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft approval summary">
                  <span>State {stateLabels[detail.state]}</span>
                  <span>Cleanup {detail.cleanupState}</span>
                  <span>Confidence {detail.confidenceScore}%</span>
                  <span>Review {detail.review?.status ?? "pending"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge publication scope preview">
                  <span>Current scope {scopeLabels[draft.scope]}</span>
                  <span>{scopeReview.label}</span>
                  <span>{scopeReview.changed ? "Scope changed" : "Scope unchanged"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence kind rollup">
                  {evidenceKindCounts.length ? (
                    evidenceKindCounts.map(([kind, count]) => <span key={kind}>{kind} {count}</span>)
                  ) : (
                    <span>No evidence kinds</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence priority rollup">
                  {evidencePriorityCounts.length ? (
                    evidencePriorityCounts.map(([tier, count]) => <span key={tier}>{tier} {count}</span>)
                  ) : (
                    <span>No evidence priority</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence source coverage">
                  <span>Sourced {evidenceSourceCoverage.sourced}</span>
                  <span>Unsourced {evidenceSourceCoverage.unsourced}</span>
                  <span>Total evidence {evidenceSourceCoverage.total}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft length counters">
                  <span>Title {draft.title.trim().length} chars</span>
                  <span>Summary {draft.summary.trim().length} chars</span>
                  <span>Body {draft.bodyMarkdown.trim().length} chars</span>
                  <span>Tags {draftTags.length}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft dirty-state indicators">
                  <span>Changed {dirtyDraftCount}/{draftDirtyStates.length}</span>
                  {draftDirtyStates.map((item) => (
                    <span key={item.label}>{item.dirty ? "Changed" : "Original"} {item.label}</span>
                  ))}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft tag preview">
                  {draftTags.length ? (
                    draftTags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)
                  ) : (
                    <span>No draft tags</span>
                  )}
                  {duplicateDraftTags.map((tag) => (
                    <span key={`duplicate-${tag}`}>Duplicate {tag}</span>
                  ))}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge guardrail summary">
                  <span>Guardrails {guardrailWarningCount} warnings</span>
                  <span>Risk groups {approvalRiskWarningGroupCount}/{approvalRiskGroups.length}</span>
                  <span>Readiness {readyReadinessCount}/{draftReadiness.length}</span>
                  <span>Confidence {detail ? readConfidenceBand(detail.confidenceScore) : "unknown"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge approval risk summary">
                  {approvalRiskGroups.map((group) => (
                    <span key={group.key}>
                      {group.label} {group.warningCount} warnings
                    </span>
                  ))}
                </div>
                <div className={styles.queueQuickFilters} aria-label="Knowledge approval risk filter shortcuts">
                  {(["all", "scope", "metadata", "structure", "evidence", "state"] as ApprovalRiskFilter[]).map((value) => (
                    <button
                      className={approvalRiskFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                      key={value}
                      onClick={() => setApprovalRiskFilter(value)}
                      type="button"
                    >
                      {value === "all" ? "All risk groups" : approvalRiskGroups.find((group) => group.key === value)?.label ?? value}
                    </button>
                  ))}
                  <button
                    className={styles.queueQuickFilter}
                    disabled={approvalRiskFilter === "all"}
                    onClick={clearApprovalRiskFilter}
                    type="button"
                  >
                    Clear risk group
                  </button>
                  <button className={styles.queueQuickFilter} onClick={copyApprovalRiskFilterHandoff} type="button">
                    Copy risk filter
                  </button>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge active approval risk filter chips">
                  <span>
                    Risk group {approvalRiskFilter === "all" ? "All risk groups" : approvalRiskGroups.find((group) => group.key === approvalRiskFilter)?.label ?? approvalRiskFilter}
                  </span>
                  <span>Showing {visibleApprovalRiskGroups.length}/{approvalRiskGroups.length}</span>
                </div>
                <section className={styles.guardrails} aria-label="Knowledge approval risk groups">
                  <h4>Approval risk groups</h4>
                  <div>
                    {visibleApprovalRiskGroups.map((group) => (
                      <article
                        className={group.warningCount ? styles.guardrailWarning : styles.guardrailReady}
                        key={group.key}
                      >
                        <strong>{group.label}</strong>
                        <p>{group.warningCount} warnings / {group.readyCount} ready notes</p>
                        {group.warningCount ? (
                          <ul>
                            {group.items.filter((item) => item.tone === "warning").map((item) => (
                              <li key={item.label}>{item.label}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No {group.label.toLowerCase()} warnings in the current draft.</p>
                        )}
                        {group.readyCount ? (
                          <p>
                            Ready: {group.items
                              .filter((item) => item.tone === "ready")
                              .map((item) => item.label)
                              .slice(0, 4)
                              .join(", ")}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
                <section className={styles.guardrails} aria-label="Knowledge approval guardrail notes">
                  <h4>Approval guardrails</h4>
                  <div>
                    {approvalGuardrails.map((item) => (
                      <article
                        className={item.tone === "ready" ? styles.guardrailReady : styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <label>
                  제목
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <div className={styles.readinessList} aria-label="Knowledge draft readiness">
                  {draftReadiness.map((item) => (
                    <span className={item.ready ? styles.readinessReady : styles.readinessMissing} key={item.label}>
                      {item.ready ? "Ready" : "Missing"} {item.label}
                    </span>
                  ))}
                </div>
                <label>
                  요약
                  <textarea
                    rows={3}
                    value={draft.summary}
                    onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
                <label>
                  태그
                  <input
                    value={draft.tagsText}
                    onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))}
                  />
                </label>
                <label>
                  Markdown 본문
                  <textarea
                    rows={10}
                    value={draft.bodyMarkdown}
                    onChange={(event) => setDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))}
                  />
                </label>
                <section
                  className={[
                    styles.markdownPreview,
                    previewCompact ? styles.markdownPreviewCompact : "",
                  ].filter(Boolean).join(" ")}
                  aria-label="Knowledge draft Markdown preview"
                >
                  <div className={styles.markdownPreviewHeader}>
                    <h4>Markdown preview</h4>
                    <button onClick={() => setPreviewCompact((current) => !current)} type="button">
                      {previewCompact ? "Expanded preview" : "Compact preview"}
                    </button>
                  </div>
                  <pre>{draft.bodyMarkdown.trim() || "No Markdown body yet."}</pre>
                </section>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown outline preview">
                  {markdownOutline.length ? (
                    markdownOutline.map((heading) => (
                      <span key={`${heading.line}-${heading.text}`}>
                        H{heading.level} L{heading.line}: {heading.text}
                      </span>
                    ))
                  ) : (
                    <span>No Markdown headings</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown structure summary">
                  <span>Headings {markdownStructureSummary.headings}</span>
                  <span>Paragraphs {markdownStructureSummary.paragraphs}</span>
                  <span>List items {markdownStructureSummary.listItems}</span>
                  <span>Lines {markdownStructureSummary.lines}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown WIKI link preview">
                  {markdownWikiLinks.length ? (
                    markdownWikiLinks.map((link) => (
                      <span key={`${link.line}-${link.target}-${link.label}`}>
                        L{link.line}: [[{link.target}]]
                      </span>
                    ))
                  ) : (
                    <span>No Markdown WIKI links</span>
                  )}
                </div>
              </section>

              <footer className={styles.footer}>
                <label>
                  반려 사유
                  <input
                    value={draft.rejectionReason}
                    onChange={(event) => setDraft((current) => ({ ...current, rejectionReason: event.target.value }))}
                    placeholder="반려할 때 필요한 사유"
                  />
                </label>
                <div className={styles.actions}>
                  <button disabled={busy} onClick={rejectCandidate} type="button">반려</button>
                  <button disabled={busy} onClick={approveCandidate} type="button">WIKI 지식 승인</button>
                </div>
              </footer>
            </>
          ) : (
            <p className={styles.empty}>선택된 후보가 없습니다.</p>
          )}
        </main>
      </div>
      <p className={styles.status}>{status}</p>
    </section>
  );
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload));
  }
  return payload.data as T;
}

async function writeJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload));
  }
  return payload.data as T;
}

function readError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) {
      return error.message;
    }
  }
  return "요청을 처리하지 못했습니다.";
}

function splitTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

function readDuplicateTags(tags: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      duplicates.add(tag);
    }
    seen.add(key);
  }
  return Array.from(duplicates);
}

function readScopeReview(scope: Scope, originalScope: Scope | null) {
  const changed = Boolean(originalScope && originalScope !== scope);
  if (scope === "organization") {
    return {
      label: "Organization-wide scope",
      detail: "This draft will be visible at organization scope. Confirm it is reusable beyond one project.",
      changed,
    };
  }
  if (scope === "admin_only") {
    return {
      label: "Admin-only scope",
      detail: "This draft remains limited to admins until it is ready for broader publication.",
      changed,
    };
  }
  return {
    label: "Restricted scope",
    detail: "This draft is limited to project or project-member scope.",
    changed,
  };
}

function readMarkdownOutline(markdown: string): MarkdownHeading[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line.trim());
    if (!match) {
      return [];
    }

    return [{
      level: match[1].length,
      line: index + 1,
      text: match[2].trim(),
    }];
  }).slice(0, 12);
}

function readMarkdownStructureSummary(markdown: string): MarkdownStructureSummary {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line)).length;
  const listItems = lines.filter((line) => /^([-*+]|\d+\.)\s+/.test(line)).length;
  const paragraphs = lines.filter((line) => !/^#{1,6}\s+/.test(line) && !/^([-*+]|\d+\.)\s+/.test(line)).length;
  return {
    headings,
    paragraphs,
    listItems,
    lines: lines.length,
  };
}

function readMarkdownWikiLinks(markdown: string): MarkdownWikiLink[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const links: MarkdownWikiLink[] = [];
    for (const match of line.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const raw = match[1].trim();
      if (!raw) {
        continue;
      }
      const [target, label] = raw.split("|").map((item) => item.trim());
      links.push({
        line: index + 1,
        target,
        label: label || target,
      });
    }
    return links;
  }).slice(0, 12);
}

function createDraftFromDetail(detail: CandidateDetail) {
  return {
    title: detail.wikiDraft.title,
    summary: detail.wikiDraft.summary,
    bodyMarkdown: detail.wikiDraft.bodyMarkdown,
    tagsText: detail.wikiDraft.tags.join(", "),
    scope: detail.wikiDraft.scope,
    rejectionReason: detail.review?.rejectionReason ?? "",
  };
}

function createSourceHandoff(
  detail: CandidateDetail,
  draft: ReturnType<typeof createDraftFromDetail>,
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "Knowledge candidate handoff",
    `Record: ${detail.id}`,
    `Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `Project: ${detail.projectName}`,
    `State: ${detail.state}`,
    `Review: ${detail.review?.status ?? "pending"}`,
    `Scope: ${draft.scope}`,
    `Confidence: ${detail.confidenceScore}%`,
    `Evidence: ${detail.evidence.length}`,
    `Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
  ].join("\n");
}

function createApprovalChecklist(
  detail: CandidateDetail,
  readiness: Array<{ label: string; ready: boolean }>,
  guardrails: ApprovalGuardrail[],
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "Knowledge approval checklist",
    `Record: ${detail.id}`,
    `Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `State: ${detail.state}`,
    `Confidence: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `Evidence: ${detail.evidence.length}`,
    `Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
    "",
    "Readiness",
    ...readiness.map((item) => `- ${item.ready ? "Ready" : "Missing"} ${item.label}`),
    "",
    "Guardrails",
    ...guardrails.map((item) => `- ${item.tone}: ${item.label} - ${item.detail}`),
  ].join("\n");
}

function readApprovalRiskGroups(guardrails: ApprovalGuardrail[]): ApprovalRiskGroup[] {
  const groups: ApprovalRiskGroup[] = [
    { key: "scope", label: "Scope", readyCount: 0, warningCount: 0, items: [] },
    { key: "metadata", label: "Metadata", readyCount: 0, warningCount: 0, items: [] },
    { key: "structure", label: "Structure", readyCount: 0, warningCount: 0, items: [] },
    { key: "evidence", label: "Evidence", readyCount: 0, warningCount: 0, items: [] },
    { key: "state", label: "State", readyCount: 0, warningCount: 0, items: [] },
  ];
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  for (const guardrail of guardrails) {
    const group = groupByKey.get(readApprovalRiskGroupKey(guardrail.label)) ?? groups[1];
    group.items.push(guardrail);
    if (guardrail.tone === "warning") {
      group.warningCount += 1;
    } else {
      group.readyCount += 1;
    }
  }
  return groups;
}

function readApprovalRiskGroupKey(label: string): ApprovalRiskGroup["key"] {
  if (label.includes("scope") || label.includes("Scope")) {
    return "scope";
  }
  if (label.includes("Markdown")) {
    return "structure";
  }
  if (label.includes("evidence") || label.includes("Evidence") || label.includes("priority")) {
    return "evidence";
  }
  if (label.includes("confidence") || label.includes("Confidence") || label.includes("State")) {
    return "state";
  }
  return "metadata";
}

function buildApprovalGuardrails(
  readiness: Array<{ label: string; ready: boolean }>,
  detail: CandidateDetail | null,
  draftDirtyStates: Array<{ label: string; dirty: boolean }>,
  markdownOutline: MarkdownHeading[],
  markdownStructureSummary: MarkdownStructureSummary,
  markdownWikiLinks: MarkdownWikiLink[],
  draftTags: string[],
  duplicateDraftTags: string[],
  draftScope: Scope,
  originalScope: Scope | null,
  bodyMarkdown: string,
): ApprovalGuardrail[] {
  const guardrails: ApprovalGuardrail[] = [];
  const missing = readiness.filter((item) => !item.ready).map((item) => item.label);

  if (missing.length) {
    guardrails.push({
      label: "Missing readiness",
      detail: `Review ${missing.join(", ")} before approval.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Draft fields ready",
      detail: "Required draft fields and evidence are present.",
      tone: "ready",
    });
  }

  if (!detail) {
    return guardrails;
  }

  if (draftScope === "organization") {
    guardrails.push({
      label: "Organization scope review",
      detail: "Publication scope is organization-wide. Confirm this knowledge should be shared across the organization.",
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Restricted scope selected",
      detail: `Publication scope is ${scopeLabels[draftScope]}.`,
      tone: "ready",
    });
  }

  if (originalScope && originalScope !== draftScope) {
    guardrails.push({
      label: "Publication scope changed",
      detail: `Scope changed from ${scopeLabels[originalScope]} to ${scopeLabels[draftScope]}. Confirm the new audience before approval.`,
      tone: "warning",
    });
  } else if (originalScope) {
    guardrails.push({
      label: "Publication scope unchanged",
      detail: `Scope remains ${scopeLabels[draftScope]}.`,
      tone: "ready",
    });
  }

  if (draftTags.length >= 2) {
    guardrails.push({
      label: "Tag coverage ready",
      detail: `${draftTags.length} draft tags are present for retrieval and WIKI grouping.`,
      tone: "ready",
    });
  } else {
    guardrails.push({
      label: "Tag coverage limited",
      detail: `${draftTags.length}/2 recommended draft tags are present. Add tags before approval when possible.`,
      tone: "warning",
    });
  }

  if (duplicateDraftTags.length) {
    guardrails.push({
      label: "Duplicate draft tags",
      detail: `Remove duplicate tag values before approval: ${duplicateDraftTags.join(", ")}.`,
      tone: "warning",
    });
  } else if (draftTags.length) {
    guardrails.push({
      label: "Draft tags unique",
      detail: "Draft tags do not contain duplicates.",
      tone: "ready",
    });
  }

  if (bodyMarkdown.trim()) {
    if (markdownOutline.length) {
      guardrails.push({
        label: "Markdown outline present",
        detail: `${markdownOutline.length} Markdown headings are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown headings missing",
        detail: "Draft body has Markdown content but no headings. Confirm structure before approval.",
        tone: "warning",
      });
    }

    if (markdownStructureSummary.listItems) {
      guardrails.push({
        label: "Markdown list structure present",
        detail: `${markdownStructureSummary.listItems} Markdown list items are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown list structure missing",
        detail: "Draft body has no Markdown list items. Confirm action or context extraction before approval.",
        tone: "warning",
      });
    }

    if (markdownWikiLinks.length) {
      guardrails.push({
        label: "Markdown WIKI links present",
        detail: `${markdownWikiLinks.length} Markdown WIKI links are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown WIKI links missing",
        detail: "Draft body has no [[WIKI links]]. Confirm whether this item should connect to existing knowledge.",
        tone: "warning",
      });
    }
  }

  const changedDraftFields = draftDirtyStates.filter((item) => item.dirty).map((item) => item.label);
  if (changedDraftFields.length) {
    guardrails.push({
      label: "Edited draft fields",
      detail: `Approval will use edited draft fields: ${changedDraftFields.join(", ")}.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Draft unchanged",
      detail: "Draft fields match the selected candidate draft.",
      tone: "ready",
    });
  }

  if (detail.confidenceScore < 60) {
    guardrails.push({
      label: "Low confidence",
      detail: `Confidence is ${detail.confidenceScore}%. Confirm evidence before approval.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Confidence acceptable",
      detail: `Confidence is ${detail.confidenceScore}%.`,
      tone: "ready",
    });
  }

  if (detail.state !== "candidate" && detail.state !== "pending_review") {
    guardrails.push({
      label: "State review",
      detail: `Candidate is currently ${detail.state}. Confirm this item should be edited again.`,
      tone: "warning",
    });
  }

  if (detail.evidence.length) {
    const unsourcedCount = detail.evidence.filter((item) => !item.sourceUrl).length;
    const highPriorityCount = detail.evidence.filter((item) => item.priority <= 3).length;
    if (unsourcedCount) {
      guardrails.push({
        label: "Unsourced evidence",
        detail: `${unsourcedCount}/${detail.evidence.length} evidence rows do not include source URLs.`,
        tone: "warning",
      });
    } else {
      guardrails.push({
        label: "Evidence sources present",
        detail: "Every evidence row includes a source URL.",
        tone: "ready",
      });
    }
    if (highPriorityCount) {
      guardrails.push({
        label: "High-priority evidence present",
        detail: `${highPriorityCount}/${detail.evidence.length} evidence rows are high priority.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "No high-priority evidence",
        detail: "Evidence is present, but none is high priority. Confirm support before approval.",
        tone: "warning",
      });
    }
  }

  return guardrails;
}

function readConfidenceBand(score: number) {
  if (score >= 80) {
    return "high";
  }
  if (score >= 60) {
    return "medium";
  }
  return "low";
}

function readEvidencePriorityTier(priority: number) {
  if (priority <= 3) {
    return "High priority";
  }
  if (priority <= 5) {
    return "Normal priority";
  }
  return "Low priority";
}

function readEvidencePriorityFilter(priority: number): EvidencePriorityFilter {
  if (priority <= 3) {
    return "high";
  }
  if (priority <= 5) {
    return "normal";
  }
  return "low";
}

function readReviewStatus(warnings: number, readyCount: number, totalCount: number): ApprovalGuardrail {
  if (readyCount < totalCount) {
    return {
      label: "Review incomplete",
      detail: `${readyCount}/${totalCount} readiness items are complete. Resolve missing draft inputs before approval.`,
      tone: "warning",
    };
  }

  if (warnings > 0) {
    return {
      label: "Review with caution",
      detail: `${warnings} guardrail warning${warnings === 1 ? "" : "s"} need review before approval.`,
      tone: "warning",
    };
  }

  return {
    label: "Ready for approval review",
    detail: "Readiness fields are complete and no guardrail warnings are active.",
    tone: "ready",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
