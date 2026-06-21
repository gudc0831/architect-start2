import type {
  KnowledgeReviewIssue,
  KnowledgeSection,
  KnowledgeTocItem,
} from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

export const requiredTocSectionLabels = ["요약", "적용 기준", "확인 절차", "근거", "예외 / 주의"] as const;

const requiredTocPurposes: Array<{ purpose: KnowledgeTocItem["purpose"]; title: (typeof requiredTocSectionLabels)[number] }> = [
  { purpose: "summary", title: "요약" },
  { purpose: "applicability", title: "적용 기준" },
  { purpose: "procedure", title: "확인 절차" },
  { purpose: "evidence", title: "근거" },
  { purpose: "exception", title: "예외 / 주의" },
];

type KnowledgeTocEditorProps = {
  toc: KnowledgeTocItem[];
  sections: KnowledgeSection[];
  issues?: KnowledgeReviewIssue[];
  onChange?: (toc: KnowledgeTocItem[]) => void;
};

export function KnowledgeTocEditor({
  toc,
  sections,
  issues = [],
  onChange,
}: KnowledgeTocEditorProps) {
  const editable = Boolean(onChange);
  const requiredStatuses = requiredTocPurposes.map((required) => {
    const item = toc.find((tocItem) => tocItem.purpose === required.purpose || tocItem.title === required.title);
    const section = item ? sections.find((candidate) => candidate.tocId === item.id) : null;
    return { ...required, item, section, missing: !item || !section };
  });
  const missingRequired = requiredStatuses.filter((status) => status.missing);
  const blockingIssues = issues.filter((issue) => issue.severity === "blocking" && issue.code === "missing_required_toc_section");

  return (
    <section className={styles.structuredPanel} aria-label="TOC editor">
      <div className={styles.structuredPanelHeader}>
        <div>
          <p>TOC</p>
          <h4>목차</h4>
        </div>
        <span>{missingRequired.length ? `blocking / 누락 ${missingRequired.length}` : "ready / 준비됨"}</span>
      </div>
      <div className={styles.tocRequiredGrid} aria-label="required TOC sections">
        {requiredStatuses.map((status) => (
          <article className={status.missing ? styles.tocRequiredMissing : styles.tocRequiredReady} key={status.title}>
            <strong>{status.title}</strong>
            <span>{status.missing ? "blocking / 필수 섹션 누락" : "ready / 섹션 있음"}</span>
          </article>
        ))}
      </div>
      {blockingIssues.length ? (
        <ul className={styles.structuredList}>
          {blockingIssues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.tocList}>
        {toc.length ? toc.map((item, index) => (
          <article className={styles.tocItem} key={`${item.id}-${index}`}>
            <label>
              제목
              <input
                disabled={!editable}
                value={item.title}
                onChange={(event) => updateTocItem(toc, onChange, index, { title: event.target.value })}
              />
            </label>
            <label>
              Level
              <select
                disabled={!editable}
                value={String(item.level)}
                onChange={(event) => updateTocItem(toc, onChange, index, { level: Number(event.target.value) as KnowledgeTocItem["level"] })}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <span>{item.purpose}</span>
            <span>{item.required ? "필수" : "선택"}</span>
            <span>{sections.some((section) => section.tocId === item.id) ? "section ready" : "blocking / section missing"}</span>
          </article>
        )) : <p className={styles.empty}>목차 항목이 없습니다. 필수 섹션 요약, 적용 기준, 확인 절차, 근거, 예외 / 주의가 차단 상태입니다.</p>}
      </div>
    </section>
  );
}

function updateTocItem(
  toc: KnowledgeTocItem[],
  onChange: KnowledgeTocEditorProps["onChange"],
  index: number,
  patch: Partial<KnowledgeTocItem>,
) {
  onChange?.(toc.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}
