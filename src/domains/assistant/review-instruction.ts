export const TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION = 1;

export const TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION = [
  `Task Assistant default review instruction v${TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION}`,
  "결론은 공식 법령, 내부 approved WIKI, 기존 검토기록/관련 task, 프로젝트 문서 근거를 한 답변 안에서 통합해 작성한다.",
  "근거와 출처 섹션은 official law, WIKI, prior records/task, project documents, external evidence를 구분해 표시한다.",
  "공식 법령은 applicability.officialVerified를 확정 근거로 다루고, applicability.candidates는 관련 후보 또는 추가 확인 대상으로 분리한다.",
  "관련 candidate가 high-risk 개념을 포함하고 누락 사실 때문에 결론이 바뀔 수 있으면 최종 verdict는 반드시 추가확인필요로 둔다.",
  "검토 결과 저장, WIKI 후보 생성, 승인 처리는 사용자가 검토기록저장을 명시적으로 실행하기 전에는 수행하지 않는다.",
].join("\n");
