import styles from "@/components/admin/knowledge-admin-shell.module.css";

type KnowledgeLocalImportPlaceholderPanelProps = {
  activeRubricLabel: string;
};

export function KnowledgeLocalImportPlaceholderPanel({
  activeRubricLabel,
}: KnowledgeLocalImportPlaceholderPanelProps) {
  return (
    <section aria-label="로컬 WIKI 가져오기 준비" className={styles.editor} id="knowledge-local-import-placeholder">
      <div className={styles.editorHeader}>
        <div>
          <p>로컬 WIKI 가져오기</p>
          <h3>미리보기 연결 준비</h3>
        </div>
      </div>
      <section className={styles.reviewBannerWarning} aria-label="로컬 WIKI 가져오기 Phase 1 경계">
        <strong>Phase 1에서는 후보를 생성하지 않습니다.</strong>
        <p>Phase 1에서는 로컬 파일을 스캔하지 않고, raw 경로와 파일 본문을 표시하지 않으며, 후보를 생성하지 않습니다.</p>
      </section>
      <div className={styles.sourceChips} aria-label="로컬 WIKI 가져오기 상태">
        <span>활성 기준 {activeRubricLabel}</span>
        <span>스캔 대기</span>
        <span>미리보기 없음</span>
        <span>후보 생성 없음</span>
      </div>
      <section className={styles.guardrails} aria-label="로컬 WIKI 가져오기 예정 흐름">
        <h4>예정 흐름</h4>
        <div>
          <article className={styles.guardrailReady}>
            <strong>가져오기</strong>
            <p>차단 규칙을 먼저 적용한 뒤 균형 선별 미리보기를 생성합니다.</p>
          </article>
          <article className={styles.guardrailReady}>
            <strong>미리보기 확정</strong>
            <p>사용자 확인 전에는 어떤 항목도 WIKI 후보가 되지 않습니다.</p>
          </article>
          <article className={styles.guardrailReady}>
            <strong>후보로 가져오기</strong>
            <p>확정된 항목만 SaaS 검토 대기 후보로 생성합니다.</p>
          </article>
        </div>
      </section>
      <p className={styles.empty}>
        LLM은 차단 규칙을 통과한 항목만 재사용 가치, 근거 강도, 업무 연결성, 최신성, WIKI 공백 보완성, 초안 작성 가능성, 위험도로 점수화합니다. 기준 버전: {activeRubricLabel}.
      </p>
    </section>
  );
}
