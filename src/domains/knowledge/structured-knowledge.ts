export const knowledgeSourceKinds = [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
] as const;

export type KnowledgeSourceKind = (typeof knowledgeSourceKinds)[number];

export const knowledgeAllowedUseKinds = ["legal_basis", "context", "comparison", "citation", "do_not_publish"] as const;
export type KnowledgeAllowedUse = (typeof knowledgeAllowedUseKinds)[number];

export type KnowledgeSourceRef = {
  id: string;
  sourceKind: KnowledgeSourceKind;
  sourceId: string;
  title: string;
  locator: string;
  excerpt: string;
  sourceUrl: string | null;
  digest: string;
  authorityRank: number;
  verifiedAt: string | null;
  stale: boolean;
  legalChangeWarnings: string[];
  allowedUse: KnowledgeAllowedUse;
};

export type KnowledgeOntologyRelationKind =
  | "parent"
  | "child"
  | "related"
  | "depends_on"
  | "conflicts_with"
  | "supersedes"
  | "supplements";

export type KnowledgeOntologyNode = {
  conceptId: string;
  label: string;
  category: "legal_rule" | "workflow" | "project_condition" | "design_decision" | "reference";
  scope: "organization" | "project" | "project_members" | "admin_only";
  relations: Array<{
    kind: KnowledgeOntologyRelationKind;
    targetId: string;
    reason: string;
  }>;
};

export type KnowledgeTocItem = {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  purpose: "summary" | "applicability" | "procedure" | "evidence" | "exception" | "related" | "history";
  required: boolean;
};

export type KnowledgeSection = {
  tocId: string;
  anchor: string;
  heading: string;
  bodyMarkdown: string;
  sourceRefIds: string[];
};

export type KnowledgeClaimEvidence = {
  claim: string;
  sourceRefIds: string[];
  confidence: "high" | "medium" | "low";
  conflicts: string[];
  gaps: string[];
};

export type KnowledgeReviewIssue = {
  code:
    | "missing_required_source_bucket"
    | "missing_required_toc_section"
    | "missing_ontology"
    | "metadata_in_body"
    | "unsourced_claim"
    | "source_conflict"
    | "legal_freshness_warning";
  severity: "blocking" | "warning" | "ready";
  message: string;
  sourceRefIds: string[];
};

export type KnowledgeApprovalReadiness = {
  status: "blocked" | "needs_review" | "ready";
  issues: KnowledgeReviewIssue[];
};

export type StructuredKnowledgeDraft = {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  ontology: KnowledgeOntologyNode;
  toc: KnowledgeTocItem[];
  sections: KnowledgeSection[];
  reasoningSummary: string;
  claimEvidenceMatrix: KnowledgeClaimEvidence[];
  approvalReadiness: KnowledgeApprovalReadiness;
  sourceRefs: KnowledgeSourceRef[];
  markdown: string;
  warnings: string[];
};

export type KnowledgeGenerationProfile = {
  id: string;
  name: string;
  version: number;
  state: "draft" | "active" | "archived";
  sourceBucketRules: Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>;
  tocTemplate: KnowledgeTocItem[];
  ontologySchema: Record<string, unknown>;
  citationRules: string[];
  sectionRules: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
