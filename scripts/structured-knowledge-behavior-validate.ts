import assert from "node:assert/strict";
import type { KnowledgeSourceRef, StructuredKnowledgeDraft } from "@/domains/knowledge/structured-knowledge";
import { assertStructuredKnowledgeDraftPublishable } from "@/use-cases/admin/structured-knowledge-service";

const legalSource: KnowledgeSourceRef = {
  id: "legal_evidence:building-act-1",
  sourceKind: "legal_evidence",
  sourceId: "building-act-1",
  title: "건축법 제1조",
  locator: "article:1",
  excerpt: "건축법 조문 발췌",
  sourceUrl: "https://example.test/legal",
  digest: "legal-digest",
  authorityRank: 90,
  verifiedAt: "2026-06-16T00:00:00.000Z",
  stale: false,
  legalChangeWarnings: [],
  allowedUse: "legal_basis",
};

const taskSource: KnowledgeSourceRef = {
  id: "task_context:abc",
  sourceKind: "task_context",
  sourceId: "task-abc",
  title: "작업 맥락",
  locator: "task",
  excerpt: "작업 질문과 답변",
  sourceUrl: null,
  digest: "task-digest",
  authorityRank: 30,
  verifiedAt: "2026-06-16T00:00:00.000Z",
  stale: false,
  legalChangeWarnings: [],
  allowedUse: "context",
};

function draft(patch: Partial<StructuredKnowledgeDraft> = {}): StructuredKnowledgeDraft {
  const sourceRefs = patch.sourceRefs ?? [legalSource, taskSource];
  return {
    title: "승인 WIKI 구조화 검증",
    slug: "structured-policy-test",
    summary: "구조화 승인 정책 검증 초안",
    tags: ["policy"],
    ontology: {
      conceptId: "structured-policy-test",
      label: "승인 WIKI 구조화 검증",
      category: "legal_rule",
      scope: "project_members",
      relations: [],
    },
    toc: [{ id: "summary", level: 2, title: "요약", purpose: "summary", required: true }],
    sections: [{
      tocId: "summary",
      anchor: "summary",
      heading: "요약",
      bodyMarkdown: "검토 가능한 WIKI 본문",
      sourceRefIds: sourceRefs.map((source) => source.id),
    }],
    reasoningSummary: "법규 근거와 작업 맥락을 함께 검토했습니다.",
    claimEvidenceMatrix: [{
      claim: "검토 가능한 주장",
      sourceRefIds: sourceRefs.map((source) => source.id),
      confidence: "high",
      conflicts: [],
      gaps: [],
    }],
    approvalReadiness: { status: "ready", issues: [] },
    sourceRefs,
    markdown: "# 승인 WIKI 구조화 검증",
    warnings: [],
    ...patch,
  };
}

function expectCode(code: string, run: () => void) {
  try {
    run();
  } catch (error) {
    assert.equal((error as { code?: unknown }).code, code);
    return;
  }
  assert.fail(`Expected ${code}`);
}

assert.doesNotThrow(() =>
  assertStructuredKnowledgeDraftPublishable({
    draft: draft(),
    sourceBuckets: [{ kind: "legal_evidence", label: "법규 근거", required: false, items: [legalSource], warnings: [] }, {
      kind: "task_context",
      label: "작업 맥락",
      required: true,
      items: [taskSource],
      warnings: [],
    }],
    requestedScope: "project_members",
  }),
);

expectCode("STRUCTURED_WIKI_APPROVAL_BLOCKED", () =>
  assertStructuredKnowledgeDraftPublishable(draft({
    approvalReadiness: { status: "ready", issues: [] },
    sections: [],
  })),
);

expectCode("STRUCTURED_WIKI_DO_NOT_PUBLISH_SOURCE", () =>
  assertStructuredKnowledgeDraftPublishable(draft({ sourceRefs: [{ ...legalSource, allowedUse: "do_not_publish" }] })),
);

expectCode("STRUCTURED_WIKI_TASK_CONTEXT_ONLY", () =>
  assertStructuredKnowledgeDraftPublishable(draft({ sourceRefs: [taskSource] })),
);

expectCode("STRUCTURED_WIKI_UNKNOWN_SOURCE_REF", () =>
  assertStructuredKnowledgeDraftPublishable(draft({
    sections: [{ tocId: "summary", anchor: "summary", heading: "요약", bodyMarkdown: "본문", sourceRefIds: ["missing"] }],
  })),
);

expectCode("STRUCTURED_WIKI_SOURCE_REF_NOT_IN_BUCKET", () =>
  assertStructuredKnowledgeDraftPublishable({
    draft: draft({ sourceRefs: [legalSource] }),
    sourceBuckets: [{ kind: "legal_evidence", label: "법규 근거", required: false, items: [], warnings: [] }],
    requestedScope: "project_members",
  }),
);

expectCode("STRUCTURED_WIKI_ORGANIZATION_SCOPE_SOURCE_CONFLICT", () =>
  assertStructuredKnowledgeDraftPublishable(draft({
    ontology: {
      conceptId: "structured-policy-test",
      label: "승인 WIKI 구조화 검증",
      category: "legal_rule",
      scope: "organization",
      relations: [],
    },
  })),
);

console.log("structured-knowledge-behavior-validate: ok");
