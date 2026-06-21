import type { KnowledgeDraftSubview } from "@/components/admin/knowledge-admin-tabs";
import {
  KnowledgeSourceBucketPanel,
  type KnowledgeSourceBucketView,
} from "@/components/admin/knowledge-source-bucket-panel";
import { KnowledgeOntologyEditor } from "@/components/admin/knowledge-ontology-editor";
import { KnowledgeTocEditor } from "@/components/admin/knowledge-toc-editor";
import type {
  KnowledgeSection,
  KnowledgeTocItem,
  StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

export type StructuredDraftGenerationMetadata = {
  generationRunId: string;
  profileId: string;
  profileVersion: number;
  sourceBundleDigest: string;
  promptDigest: string;
  warnings: string[];
};

type KnowledgeStructuredDraftPanelProps = {
  sourceBuckets: KnowledgeSourceBucketView[];
  sourceBucketsLoading: boolean;
  sourceBucketsError: string;
  structuredDraft: StructuredKnowledgeDraft | null;
  generationMetadata: StructuredDraftGenerationMetadata | null;
  generating: boolean;
  selectedSubview: KnowledgeDraftSubview;
  onSubviewChange: (subview: KnowledgeDraftSubview) => void;
  onGenerate: () => void;
  onApplyDraft: () => void;
  onDraftChange: (draft: StructuredKnowledgeDraft) => void;
  legacyMarkdown: string;
  previewCompact: boolean;
  onPreviewCompactChange: () => void;
  disabled?: boolean;
};

const draftSubviewLabels: Record<KnowledgeDraftSubview, string> = {
  sources: "Source buckets",
  reasoning: "Integrated reasoning summary",
  ontology: "Ontology",
  toc: "TOC",
  sections: "Section editor",
  preview: "Markdown preview",
  metadata: "Generation metadata",
};

const draftSubviewOrder: KnowledgeDraftSubview[] = [
  "sources",
  "reasoning",
  "ontology",
  "toc",
  "sections",
  "preview",
  "metadata",
];

const issueSeverityLabels = {
  blocking: "blocking / 차단",
  warning: "warning / 주의",
  ready: "ready / 준비됨",
} as const;

export function KnowledgeStructuredDraftPanel({
  sourceBuckets,
  sourceBucketsLoading,
  sourceBucketsError,
  structuredDraft,
  generationMetadata,
  generating,
  selectedSubview,
  onSubviewChange,
  onGenerate,
  onApplyDraft,
  onDraftChange,
  legacyMarkdown,
  previewCompact,
  onPreviewCompactChange,
  disabled = false,
}: KnowledgeStructuredDraftPanelProps) {
  return (
    <section className={styles.structuredDraftShell} aria-label="structured draft admin UI">
      <div className={styles.structuredDraftHeader}>
        <div>
          <p>Structured draft</p>
          <h3>구조화 초안 검토</h3>
        </div>
        <div className={styles.editorTools}>
          <button disabled={disabled || generating} onClick={onGenerate} type="button">
            {generating ? "생성 중" : "구조화 초안 생성"}
          </button>
          <button disabled={disabled || !structuredDraft} onClick={onApplyDraft} type="button">
            Markdown 본문에 반영
          </button>
        </div>
      </div>
      <div className={styles.draftSubviewList} aria-label="draftSubview navigation">
        {draftSubviewOrder.map((subview) => (
          <button
            className={selectedSubview === subview ? styles.draftSubviewActive : styles.draftSubview}
            key={subview}
            onClick={() => onSubviewChange(subview)}
            type="button"
          >
            {draftSubviewLabels[subview]}
          </button>
        ))}
      </div>
      {renderSubview({
        sourceBuckets,
        sourceBucketsLoading,
        sourceBucketsError,
        structuredDraft,
        generationMetadata,
        selectedSubview,
        onDraftChange,
        legacyMarkdown,
        previewCompact,
        onPreviewCompactChange,
      })}
      {selectedSubview !== "metadata" ? (
        <GenerationMetadataDetails metadata={generationMetadata} />
      ) : null}
    </section>
  );
}

function renderSubview(input: {
  sourceBuckets: KnowledgeSourceBucketView[];
  sourceBucketsLoading: boolean;
  sourceBucketsError: string;
  structuredDraft: StructuredKnowledgeDraft | null;
  generationMetadata: StructuredDraftGenerationMetadata | null;
  selectedSubview: KnowledgeDraftSubview;
  onDraftChange: (draft: StructuredKnowledgeDraft) => void;
  legacyMarkdown: string;
  previewCompact: boolean;
  onPreviewCompactChange: () => void;
}) {
  if (input.selectedSubview === "sources") {
    return (
      <KnowledgeSourceBucketPanel
        buckets={input.sourceBuckets}
        loading={input.sourceBucketsLoading}
        error={input.sourceBucketsError}
      />
    );
  }

  if (!input.structuredDraft) {
    return (
      <section className={styles.structuredPanel} aria-label="structured draft empty">
        <div className={styles.structuredPanelHeader}>
          <div>
            <p>{draftSubviewLabels[input.selectedSubview]}</p>
            <h4>구조화 초안 대기</h4>
          </div>
          <span>warning / 대기</span>
        </div>
        <p className={styles.empty}>구조화 초안을 생성하면 이 하위 화면에서 검토할 수 있습니다.</p>
      </section>
    );
  }

  const draft = input.structuredDraft;

  if (input.selectedSubview === "reasoning") {
    return <ReasoningSummary draft={draft} />;
  }
  if (input.selectedSubview === "ontology") {
    return (
      <KnowledgeOntologyEditor
        ontology={draft.ontology}
        onChange={(ontology) => input.onDraftChange(withDraftMarkdown({ ...draft, ontology }))}
      />
    );
  }
  if (input.selectedSubview === "toc") {
    return (
      <KnowledgeTocEditor
        toc={draft.toc}
        sections={draft.sections}
        issues={draft.approvalReadiness.issues}
        onChange={(toc) => input.onDraftChange(withDraftMarkdown({ ...draft, toc }))}
      />
    );
  }
  if (input.selectedSubview === "sections") {
    return (
      <SectionEditor
        draft={draft}
        onChange={(sections) => input.onDraftChange(withDraftMarkdown({ ...draft, sections }))}
      />
    );
  }
  if (input.selectedSubview === "preview") {
    return (
      <MarkdownPreview
        markdown={draft.markdown}
        legacyMarkdown={input.legacyMarkdown}
        previewCompact={input.previewCompact}
        onPreviewCompactChange={input.onPreviewCompactChange}
      />
    );
  }

  return <GenerationMetadataDetails metadata={input.generationMetadata} />;
}

function ReasoningSummary({ draft }: { draft: StructuredKnowledgeDraft }) {
  return (
    <section className={styles.structuredPanel} aria-label="integrated reasoning summary">
      <div className={styles.structuredPanelHeader}>
        <div>
          <p>Integrated reasoning summary</p>
          <h4>통합 추론 요약</h4>
        </div>
        <span>{draft.approvalReadiness.status}</span>
      </div>
      <p>{draft.reasoningSummary || "통합 추론 요약이 없습니다."}</p>
      <div className={styles.issueChips} aria-label="approval readiness labels">
        {draft.approvalReadiness.issues.length ? draft.approvalReadiness.issues.map((issue) => (
          <span className={readIssueClass(issue.severity)} key={`${issue.code}-${issue.message}`}>
            {issueSeverityLabels[issue.severity]} · {issue.message}
          </span>
        )) : <span className={styles.issueReady}>{issueSeverityLabels.ready}</span>}
      </div>
      <section className={styles.claimEvidenceList} aria-label="claim-evidence matrix">
        <div className={styles.structuredPanelHeader}>
          <div>
            <p>Claim-evidence matrix</p>
            <h4>주장-근거 매트릭스</h4>
          </div>
          <span>{draft.claimEvidenceMatrix.length} claims</span>
        </div>
        {draft.claimEvidenceMatrix.length ? draft.claimEvidenceMatrix.map((claim, index) => (
          <article key={`${claim.claim}-${index}`}>
            <strong>{claim.claim}</strong>
            <span>confidence {claim.confidence}</span>
            <p>sourceRefIds: {claim.sourceRefIds.join(", ") || "없음"}</p>
            {claim.conflicts.length ? <p>conflicts: {claim.conflicts.join(", ")}</p> : null}
            {claim.gaps.length ? <p>gaps: {claim.gaps.join(", ")}</p> : null}
          </article>
        )) : <p className={styles.empty}>주장-근거 매트릭스가 없습니다.</p>}
      </section>
    </section>
  );
}

function SectionEditor({
  draft,
  onChange,
}: {
  draft: StructuredKnowledgeDraft;
  onChange: (sections: KnowledgeSection[]) => void;
}) {
  const tocById = new Map(draft.toc.map((item) => [item.id, item]));
  return (
    <section className={styles.structuredPanel} aria-label="section editor">
      <div className={styles.structuredPanelHeader}>
        <div>
          <p>Section editor</p>
          <h4>섹션 편집</h4>
        </div>
        <span>{draft.sections.length} sections</span>
      </div>
      <div className={styles.sectionEditorList}>
        {draft.sections.length ? draft.sections.map((section, index) => {
          const tocItem = tocById.get(section.tocId);
          return (
            <article key={`${section.tocId}-${section.anchor}-${index}`}>
              <label>
                Heading
                <input
                  value={section.heading}
                  onChange={(event) => updateSection(draft.sections, onChange, index, { heading: event.target.value })}
                />
              </label>
              <label>
                Body
                <textarea
                  rows={5}
                  value={section.bodyMarkdown}
                  onChange={(event) => updateSection(draft.sections, onChange, index, { bodyMarkdown: event.target.value })}
                />
              </label>
              <div className={styles.sourceChips} aria-label="section source refs">
                <span>{tocItem?.title ?? section.tocId}</span>
                <span>anchor {section.anchor}</span>
                <span>source refs {section.sourceRefIds.length}</span>
              </div>
            </article>
          );
        }) : <p className={styles.empty}>편집할 섹션이 없습니다.</p>}
      </div>
    </section>
  );
}

function MarkdownPreview({
  markdown,
  legacyMarkdown,
  previewCompact,
  onPreviewCompactChange,
}: {
  markdown: string;
  legacyMarkdown: string;
  previewCompact: boolean;
  onPreviewCompactChange: () => void;
}) {
  return (
    <section
      className={[
        styles.markdownPreview,
        previewCompact ? styles.markdownPreviewCompact : "",
      ].filter(Boolean).join(" ")}
      aria-label="structured Markdown preview"
    >
      <div className={styles.markdownPreviewHeader}>
        <h4>Markdown preview</h4>
        <button onClick={onPreviewCompactChange} type="button">
          {previewCompact ? "넓게 보기" : "압축 보기"}
        </button>
      </div>
      <pre>{markdown.trim() || "아직 Markdown 본문이 없습니다."}</pre>
      <details className={styles.compactMetadata}>
        <summary>고급 Markdown textarea</summary>
        <label>
          Plain Markdown textarea
          <textarea
            readOnly
            rows={8}
            value={legacyMarkdown}
          />
        </label>
      </details>
    </section>
  );
}

function GenerationMetadataDetails({ metadata }: { metadata: StructuredDraftGenerationMetadata | null }) {
  return (
    <details className={styles.compactMetadata}>
      <summary>생성 메타데이터</summary>
      {metadata ? (
        <div className={styles.sourceChips} aria-label="generation metadata">
          <span>run {metadata.generationRunId.slice(0, 8)}</span>
          <span>profile {metadata.profileId.slice(0, 8)}</span>
          <span>version {metadata.profileVersion}</span>
          <span>source digest {metadata.sourceBundleDigest.slice(0, 12)}</span>
          <span>prompt digest {metadata.promptDigest.slice(0, 12)}</span>
          <span>warnings {metadata.warnings.length}</span>
        </div>
      ) : (
        <p className={styles.empty}>생성 메타데이터가 아직 없습니다.</p>
      )}
    </details>
  );
}

function updateSection(
  sections: KnowledgeSection[],
  onChange: (sections: KnowledgeSection[]) => void,
  index: number,
  patch: Partial<KnowledgeSection>,
) {
  onChange(sections.map((section, sectionIndex) => (sectionIndex === index ? { ...section, ...patch } : section)));
}

function withDraftMarkdown(draft: StructuredKnowledgeDraft): StructuredKnowledgeDraft {
  return {
    ...draft,
    markdown: renderClientStructuredDraftMarkdown(draft),
  };
}

function renderClientStructuredDraftMarkdown(draft: StructuredKnowledgeDraft) {
  const tocLines = draft.sections.map((section) => {
    const tocItem = draft.toc.find((item) => item.id === section.tocId);
    const label = tocItem?.title || section.heading;
    return `- [${label}](#${section.anchor})`;
  });
  const sectionBlocks = draft.sections.map((section) => {
    const tocItem = draft.toc.find((item) => item.id === section.tocId);
    const level = "#".repeat(Math.max(2, Math.min(3, tocItem?.level ?? 2)));
    return `${level} ${section.heading} {#${section.anchor}}\n\n${section.bodyMarkdown.trim() || "검토 가능한 본문이 아직 없습니다."}`;
  });
  return [
    `# ${draft.title}`,
    "## 목차",
    tocLines.length ? tocLines.join("\n") : "- 등록된 섹션 없음",
    "## 출처 범위",
    renderSourceCoverage(draft),
    ...sectionBlocks,
  ].join("\n\n");
}

function renderSourceCoverage(draft: StructuredKnowledgeDraft) {
  if (!draft.sourceRefs.length) {
    return "- 검토 가능한 출처 없음";
  }
  return [`- 전체 출처: ${draft.sourceRefs.length}개`]
    .concat(draft.sourceRefs.map((sourceRef) => `- ${sourceRef.title}`))
    .join("\n");
}

function readIssueClass(severity: keyof typeof issueSeverityLabels) {
  if (severity === "blocking") {
    return styles.issueBlocking;
  }
  if (severity === "warning") {
    return styles.issueWarning;
  }
  return styles.issueReady;
}
