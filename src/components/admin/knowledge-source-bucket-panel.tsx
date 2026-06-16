import {
  knowledgeSourceKinds,
  type KnowledgeSourceKind,
  type KnowledgeSourceRef,
} from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

export type KnowledgeSourceBucketView = {
  kind: KnowledgeSourceKind;
  label?: string;
  required: boolean;
  items: KnowledgeSourceRef[];
  warnings: string[];
};

export const sourceBucketLabels = {
  legal_evidence: "법규 근거",
  task_context: "Task 맥락",
  project_document: "프로젝트 자료",
  approved_wiki: "기존 승인 WIKI",
  local_wiki: "로컬 WIKI",
  external_evidence: "외부 근거",
} satisfies Record<KnowledgeSourceKind, string>;

const fallbackRequiredBuckets = {
  legal_evidence: false,
  task_context: true,
  project_document: false,
  approved_wiki: false,
  local_wiki: false,
  external_evidence: false,
} satisfies Record<KnowledgeSourceKind, boolean>;

const sourceBucketStatusLabels = {
  blocking: "blocking / 차단",
  warning: "warning / 주의",
  ready: "ready / 준비됨",
  muted: "optional empty / 선택 비어 있음",
} as const;

type SourceBucketStatus = keyof typeof sourceBucketStatusLabels;

type KnowledgeSourceBucketPanelProps = {
  buckets: KnowledgeSourceBucketView[];
  loading?: boolean;
  error?: string;
};

export function KnowledgeSourceBucketPanel({
  buckets,
  loading = false,
  error = "",
}: KnowledgeSourceBucketPanelProps) {
  const bucketsByKind = new Map(buckets.map((bucket) => [bucket.kind, bucket]));

  return (
    <section className={styles.structuredPanel} aria-label="structured source buckets">
      <div className={styles.structuredPanelHeader}>
        <div>
          <p>Source buckets</p>
          <h4>출처 버킷</h4>
        </div>
        <span>{loading ? "불러오는 중" : `${buckets.length}개 응답`}</span>
      </div>
      {error ? <p className={styles.structuredError}>{error}</p> : null}
      <div className={styles.issueChips} aria-label="source bucket status legend">
        <span className={styles.issueBlocking}>{sourceBucketStatusLabels.blocking}</span>
        <span className={styles.issueWarning}>{sourceBucketStatusLabels.warning}</span>
        <span className={styles.issueReady}>{sourceBucketStatusLabels.ready}</span>
        <span>{sourceBucketStatusLabels.muted}</span>
      </div>
      <div className={styles.sourceBucketGrid}>
        {knowledgeSourceKinds.map((kind) => {
          const bucket = bucketsByKind.get(kind) ?? {
            kind,
            required: fallbackRequiredBuckets[kind],
            items: [],
            warnings: [],
          };
          const status = readBucketStatus(bucket);
          return (
            <article className={readBucketClass(status)} key={kind}>
              <div className={styles.sourceBucketHeader}>
                <strong>{sourceBucketLabels[kind]}</strong>
                <span>{sourceBucketStatusLabels[status]}</span>
              </div>
              <p>
                {bucket.required ? "필수 버킷" : "선택 버킷"} · 출처 {bucket.items.length}개
              </p>
              {bucket.warnings.length ? (
                <ul className={styles.structuredList}>
                  {bucket.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {bucket.items.length ? (
                <div className={styles.sourceRefList}>
                  {bucket.items.slice(0, 4).map((item) => (
                    <div key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.allowedUse} · rank {item.authorityRank}</span>
                      <p>{item.excerpt || item.locator || "검토 가능한 발췌가 없습니다."}</p>
                    </div>
                  ))}
                  {bucket.items.length > 4 ? <span>추가 출처 {bucket.items.length - 4}개</span> : null}
                </div>
              ) : (
                <p className={styles.empty}>
                  {bucket.required ? "필수 출처가 없어 승인 전 차단됩니다." : "선택 출처가 비어 있습니다."}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function readBucketStatus(bucket: Pick<KnowledgeSourceBucketView, "required" | "items" | "warnings">): SourceBucketStatus {
  if (bucket.required && bucket.items.length === 0) {
    return "blocking";
  }
  if (bucket.warnings.length > 0) {
    return "warning";
  }
  if (bucket.items.length === 0) {
    return "muted";
  }
  return "ready";
}

function readBucketClass(status: SourceBucketStatus) {
  if (status === "blocking") {
    return styles.sourceBucketBlocking;
  }
  if (status === "warning") {
    return styles.sourceBucketWarning;
  }
  if (status === "muted") {
    return styles.sourceBucketMuted;
  }
  return styles.sourceBucketReady;
}
