# Task Assistant Unified Upgrade Design

Date: 2026-06-22
Scope: 건축 Task Assistant 통합 고도화 설계. 코드 구현 전 제품/데이터/UX 기준을 고정한다.

## Status

이 문서는 `2026-06-22-task-assistant-legal-graph-rag-design.md`의 법규 Graph RAG 설계를 흡수한다. 기존 문서는 법규 세부 설계의 초안으로 보존하되, 구현 기준은 이 통합 문서를 우선한다.

## Goal

Task Assistant를 다음 흐름으로 고도화한다.

```text
Task 선택
-> 질문 입력
-> 근거 조회
-> 통합 결론 생성
-> 사용자가 검토기록저장 여부 결정
-> 저장된 검토 세션에서 후속질의
```

사용자는 매번 검토지침을 작성하지 않는다. 서비스가 고정 기본 검토지침을 적용하고, 사용자는 질문이나 후속질의만 입력한다.

답변은 법규, 내부 WIKI, 과거 검토기록, 현재 task/파일근거를 따로따로 나열하는 것이 아니라 하나의 실무 결론으로 합성한다. 단, 근거는 출처와 권위별로 분리해서 보여준다.

## Current State

- `architect-saas/src/components/tasks/task-assistant-panel.tsx`는 질문, 검토지침, 기록, 파일근거, 외부근거, 로컬 Codex 상태를 한 패널에서 다룬다.
- 현재 패널은 사용자가 `instruction`을 직접 편집할 수 있고, 기본 검토지침과 사용자 질문의 역할이 섞여 있다.
- 현재 검토 생성 흐름은 답변 생성 후 `/api/assistant/records`에 바로 저장하는 구조에 가깝다. 이 동작은 "검토기록저장 버튼을 눌러야 최근검토기록에 남는다"는 목표와 맞지 않는다.
- 최근검토기록은 유용하지만, 저장된 답변에서 후속질의가 이어지는 세션 흐름이 약하다.
- 최근검토기록, 파일근거, 외부웹/스킬근거, 로컬 Codex 상태 등 보조 영역이 많이 보이면 질문/결론 중심 UX가 흐려진다.
- `verified-legal-evidence-api`에는 기존 법규 그래프 레이어가 있다.
  - `src/legal-graph/graph-types.ts`
  - `src/legal-graph/graph-builder.ts`
  - `src/legal-graph/graph-expansion.ts`
  - `data/staging/legal-graph/nodes.jsonl`
  - `data/staging/legal-graph/edges.jsonl`

## Non Goals

- 이 설계 단계에서 코드 구현은 하지 않는다.
- 대규모 법규 corpus 재수집, R2 publish, production deploy, env 변경은 별도 승인 없이는 하지 않는다.
- SaaS로 `LAW_OPEN_DATA_OC` 또는 법규 corpus ownership을 옮기지 않는다.
- 법률 자문처럼 최종 법적 판단을 단정하는 UX를 만들지 않는다. 답변은 건축 실무 검토 보조로 한정한다.

## Design Decisions

### 1. 기본 검토지침은 서비스 고정값

1차 구현은 서비스 전체 고정 기본 검토지침을 사용한다. 프로젝트별 override는 후속 확장 여지만 남긴다.

사용자 입력은 검토지침이 아니라 `질문` 또는 `추가질의`다. 사용자 질문은 기본 검토지침을 대체하지 않고 그 위에 얹히는 입력이다.

예시 기본 검토지침:

```text
건축 task 관점에서 공식 법규, 현재 task/파일 사실관계, 내부 WIKI, 과거 검토기록을 구분한다.
공식 법규 위반 가능성을 우선 판단하고, 내부 기준이나 건설사 요청사항은 실무 맥락으로 반영한다.
결론에는 가능/불가/조건부/추가확인필요/판단보류 중 하나의 판정값을 포함한다.
근거는 출처별로 분리하고, 부족정보와 후속확인사항을 명시한다.
```

### 2. 법규 연결은 키워드 + LLM + Graph RAG

관련법규 매칭은 단순 키워드 검색으로 처리하지 않는다.

- 키워드: 후보를 넓게 찾는다.
- LLM: task/question/file/history에서 건축 사실관계를 추출하고, 조문 적용조건을 해석한다.
- Graph RAG: 건축 개념과 조문 적용요건 사이의 설명 가능한 경로와 관련성 점수를 산정한다.

Graph RAG는 법령명 중심이 아니라 건축 개념 중심이다.

```text
Task 사실
-> 건축 개념
-> 적용요건
-> 법령/조문/항/호/목
```

예시:

```text
지하주차장 램프 경사
-> 주차 / 차량 동선 / 램프
-> 차로 또는 경사 기준
-> 주차장 관련 조문
```

### 3. Graph RAG 소유권은 verified-legal-evidence-api

법규 Graph RAG 데이터와 공식 검증 로직은 `verified-legal-evidence-api`가 소유한다. `architect-saas`는 API 응답만 소비한다.

SaaS가 받을 결과:

- 공식검증조문
- 관련 가능 후보
- 적용조건 판정
- 누락 사실관계
- graph path
- confidence/relevance score
- 후보가 결론을 바꿀 가능성

### 4. Graph RAG는 1차 기본 고도화 후 반복 개선

1차 구현의 목표는 완벽한 매칭이 아니라 안전한 구조와 보수적 판정 규칙이다. 이후 실제 task 검토 사례를 보면서 taxonomy, 적용조건 추출, 후보 승격 기준, fixture를 반복 개선한다.

1차 고위험 건축 개념:

```text
피난
방화
구조
주차
장애인편의
용적률
건폐율
일조
채광
대지/도로
인허가
```

### 5. 답변은 한층짜리 통합 결론을 목표로 한다

답변은 항상 `공식검증조문 기준 결론`과 `후보 포함 결론`을 기계적으로 나누지 않는다. 목표는 최대한 자연스러운 한층짜리 통합 결론이다.

다만 관련 가능 후보가 결론을 바꿀 수 있으면:

- 최종 판정은 `추가확인필요`로 둔다.
- 설명에 후보를 제외했을 때와 포함했을 때의 결론 차이를 명시한다.

예시:

```text
판정: 추가확인필요

결론:
현재 공식검증조문 기준으로는 즉시 위반 근거가 확인되지 않습니다. 다만 관련 가능 후보에 피난 동선 제한 조문이 포함되어 있어, 해당 조문의 적용조건이 충족되면 반영 불가로 결론이 바뀔 수 있습니다. 따라서 현 단계에서는 가능으로 단정하지 말고 피난 동선 해당 여부를 추가 확인해야 합니다.

결론 차이:
- 후보 제외 시: 법규상 즉시 문제 없음에 가까움
- 후보 포함 시: 피난 동선 조문 적용 여부에 따라 불가 가능성 있음
```

후보가 결론을 바꾸지 않으면 결론 차이 섹션을 표시하지 않는다.

### 6. 후보 위험 판정은 LLM + 규칙 기반 강제 조건

관련 가능 후보가 결론을 바꿀 수 있는지는 LLM 판단만 두지 않는다.

다음 조건이면 보수적으로 `추가확인필요`를 강제한다.

- 후보 조문이 고위험 건축 개념에 연결된다.
- 적용조건 일부가 누락되어 있다.
- 후보가 적용되면 가능/불가 결론이 바뀐다.

### 7. 근거 우선순위

우선순위는 다음과 같다.

1. 공식검증조문
2. 현재 task/파일 사실관계
3. 내부 WIKI
4. 과거 검토기록
5. 사용자가 명시적으로 포함한 외부웹/스킬근거

법규가 금지하면 내부 WIKI나 과거 검토기록이 있어도 불가로 답한다. 단, 건설사 요청이나 과거 관행이 있었다는 맥락은 함께 표시한다.

예시:

```text
해당 사항은 건설사 요청으로 확인되나, 건축법 제0조 제0항에 위배될 가능성이 높아 현재 조건으로는 반영이 어렵습니다.
```

반대로 법규상 문제는 없지만 과거 기록이나 건설사 요청 때문에 확인이 필요할 수 있다.

```text
공식검증조문 기준으로는 즉시 위반 근거가 확인되지 않습니다. 다만 이전 검토기록상 건설사 요청사항으로 반복 관리된 항목이므로 담당자 확인 후 반영하는 것이 안전합니다.
```

### 8. 충돌은 항상 명시

법규, 현재 task 사실관계, 내부 WIKI, 과거 검토기록이 서로 다른 방향을 가리키면 충돌을 숨기지 않는다.

```text
충돌:
- 건설사 요청/과거 기록: 반영 요청
- 공식검증조문: 제한 또는 금지 가능성
```

### 9. 판정값

검토 결과는 자연어 결론과 별도로 판정값을 가진다.

```text
가능
불가
조건부
추가확인필요
판단보류
```

이 값은 최근검토기록 목록, 세션 타임라인, 필터링, 저장 상태 표시에서 사용한다.

### 10. 검토 결과는 생성 직후 저장하지 않는다

질문 실행 후 결과는 `임시 검토 결과`로 표시한다. 사용자가 `검토기록저장`을 눌러야 최근검토기록에 남는다.

```text
질문 입력
-> 근거 조회 + 답변 생성
-> 임시 검토 결과 표시
-> 검토기록저장 클릭
-> 최근검토기록에 저장
```

저장하지 않고 task를 바꾸거나 패널을 닫으면 임시 결과는 버린다.

화면에는 저장 전 상태를 명확히 표시한다.

```text
저장되지 않은 검토 결과입니다. 기록으로 남기려면 검토기록저장을 누르세요.
```

### 11. 저장 단위는 검토 세션과 턴

최근검토기록은 세션 단위로 보여준다. 세션을 클릭하면 내부에서 질문/답변 턴 타임라인을 보여준다.

```text
검토 세션
- 최초 질문
- 최초 답변
- 저장 시점의 근거 스냅샷
- 후속질의 1
- 후속답변 1
- 후속질의 2
- 후속답변 2
```

후속질의도 최초 답변처럼 임시 후속답변으로 생성한 뒤, 사용자가 저장해야 세션 타임라인에 추가된다.

세션 제목은 자동 생성하고 사용자가 나중에 수정할 수 있게 한다.

예시:

```text
[조건부] 지하주차장 램프 경사 반영 검토
[불가] 피난 동선 변경 요청 검토
[추가확인필요] 건설사 요청사항 반영 가능성 확인
```

### 12. 후속질의는 세션 맥락과 최신 검증을 함께 사용

후속질의는 다음 맥락을 이어받는다.

1. 최초 질문과 답변
2. 저장 당시의 근거 스냅샷
3. 이후 후속질의/답변 히스토리
4. 현재 task의 최신 상태

법규 근거는 저장 당시 스냅샷을 보여주되, 새 후속질의 생성 시에는 최신 법규 검증을 다시 실행한다. 내부 WIKI/과거 검토기록도 저장 당시 근거와 최신 근거를 구분한다. 현재 task 내용이 바뀌었으면 저장 당시 task와 현재 task가 다르다는 경고를 표시한다.

### 13. 저장 시점에는 재현 가능한 스냅샷을 저장

검토기록저장 시 답변 텍스트만 저장하지 않는다.

최소 저장 항목:

```text
reviewSession
- taskId
- title
- initialQuestion
- defaultInstructionVersion
- savedAt
- latestVerdict

reviewTurn
- sessionId
- question
- answer
- verdict
- evidenceSnapshot
- legalMatches
- conflicts
- missingFacts
- createdAt
```

이 구조는 법규, WIKI, task가 나중에 바뀌어도 당시 결론의 근거를 추적하기 위한 것이다.

### 14. 외부웹/스킬근거는 명시적으로 포함할 때만 사용

외부웹/스킬근거는 기본 답변에 자동 포함하지 않는다. 사용자가 "이번 검토에 포함"으로 명시한 경우에만 답변 합성에 넣는다.

### 15. 로컬 Codex는 기본 UI를 막지 않는다

로컬 Codex 로그인/연결 상태는 기본 화면에서 배지로만 표시한다.

선택한 실행 모드가 `local-codex`일 때만 연결 실패가 생성 차단 조건이 된다. SaaS API 또는 mock 모드에서는 로컬 Codex 실패가 전체 패널 사용을 막지 않는다.

## Proposed Data Types

### Legal Graph RAG

```ts
type ArchitecturalConcept = {
  conceptId: string;
  label: string;
  aliases: string[];
  category:
    | "피난"
    | "방화"
    | "구조"
    | "주차"
    | "장애인편의"
    | "용적률"
    | "건폐율"
    | "일조"
    | "채광"
    | "대지/도로"
    | "인허가"
    | "기타";
};

type ApplicabilityRule = {
  ruleId: string;
  lawName: string;
  articleLabel: string;
  paragraphLabel?: string;
  itemLabel?: string;
  sourceId: string;
  sourceUrl?: string;
  checkedAt: string;
  concepts: string[];
  appliesWhen: Array<{
    field: "use" | "floor" | "area" | "facility" | "location" | "action" | "projectType" | "permitStage";
    operator: "equals" | "includes" | "greaterThan" | "lessThan" | "exists";
    value: string;
  }>;
  exceptions: string[];
  extractionMethod: "rule" | "llm" | "human_reviewed";
  confidence: number;
};

type TaskFact = {
  factId: string;
  label: string;
  value: string;
  source: "question" | "task" | "file" | "wiki" | "history";
  confidence: number;
};

type LegalApplicabilityMatch = {
  status: "official_verified" | "candidate" | "insufficient_facts" | "low_relevance" | "conflict";
  lawName: string;
  articleLabel: string;
  paragraphLabel?: string;
  itemLabel?: string;
  graphPath: string[];
  matchedConcepts: string[];
  matchedFacts: TaskFact[];
  missingFacts: string[];
  relevanceScore: number;
  canChangeConclusion: boolean;
  highRiskConcepts: string[];
  reason: string;
};
```

### Review Session

```ts
type ReviewVerdict = "가능" | "불가" | "조건부" | "추가확인필요" | "판단보류";

type ReviewSession = {
  id: string;
  taskId: string;
  title: string;
  initialQuestion: string;
  defaultInstructionVersion: string;
  latestVerdict: ReviewVerdict;
  createdAt: string;
  updatedAt: string;
};

type ReviewEvidenceSnapshot = {
  officialLegal: LegalApplicabilityMatch[];
  candidateLegal: LegalApplicabilityMatch[];
  taskFacts: TaskFact[];
  fileEvidence: Array<{ id: string; title: string; excerpt: string; sourceUrl?: string }>;
  wikiEvidence: Array<{ id: string; title: string; excerpt: string }>;
  historyEvidence: Array<{ id: string; title: string; excerpt: string; createdAt: string }>;
  externalEvidence: Array<{ id: string; title: string; excerpt: string; sourceUrl?: string }>;
  capturedAt: string;
};

type ReviewTurn = {
  id: string;
  sessionId: string;
  question: string;
  answer: string;
  verdict: ReviewVerdict;
  evidenceSnapshot: ReviewEvidenceSnapshot;
  legalMatches: LegalApplicabilityMatch[];
  conflicts: Array<{ summary: string; evidenceIds: string[] }>;
  missingFacts: string[];
  createdAt: string;
};
```

## Proposed Folder Structure

```text
verified-legal-evidence-api/
  src/
    legal-graph/
      graph-types.ts
      graph-builder.ts
      graph-expansion.ts
      concept-taxonomy.ts
      applicability-types.ts
      applicability-extractor.ts
      task-fact-extractor.ts
      applicability-matcher.ts
      graph-rag-ranker.ts

  data/
    staging/
      legal-graph/
        nodes.jsonl
        edges.jsonl
        applicability-rules.jsonl
        concept-links.jsonl
        match-eval-fixtures.jsonl

architect-saas/
  src/
    domains/
      assistant/
        review-answer-contract.ts
        task-review.ts
        review-session.ts
      legal/
        legal-verification-intent.ts

    use-cases/
      verified-legal-search-service.ts
      task-review-service.ts
      assistant-service.ts
      assistant-review-session-service.ts
```

## UX Structure

기본 펼침 영역은 두 개만 둔다.

1. 질문 입력
2. 현재 임시/저장 검토 결과

다음 영역은 기본 접힘 상태다.

- 최근검토기록
- 관련법규
- 파일근거
- 내부 WIKI
- 과거 검토기록
- 외부웹/스킬근거
- 로컬 Codex 로그인/연결 상태

상단에는 요약 배지를 둔다.

```text
[최근검토 3] [공식조문 2] [법규후보 5] [파일근거 1] [외부근거 0] [Codex 준비됨]
```

## Implementation Outline

1. 현재 Task Assistant 상태 모델 정리
   - `instruction` 입력을 사용자 편집 UI에서 제거하거나 접힌 고급 설정으로 격리한다.
   - 사용자 입력 라벨을 `질문` 또는 `추가질의`로 바꾼다.

2. 기본 검토지침 고정
   - 서비스 기본값과 version을 정의한다.
   - 저장된 review turn에 `defaultInstructionVersion`을 남긴다.

3. 법규 Graph RAG API 응답 확장
   - `verified-legal-evidence-api`에서 concept/applicability/match result를 만든다.
   - SaaS는 확장된 legal match 결과를 task review evidence로 소비한다.

4. 답변 contract 확장
   - 판정값, 충돌, 부족정보, 후보 영향 설명을 포함한다.
   - 후보가 결론을 바꿀 수 있으면 최종 판정을 `추가확인필요`로 강제한다.

5. 저장 흐름 분리
   - generation result는 먼저 임시 상태로 둔다.
   - `검토기록저장` 버튼이 review session/turn을 생성한다.
   - 저장하지 않은 결과는 task 변경/패널 종료 시 폐기한다.

6. 검토 세션/후속질의
   - 최근검토기록은 session list로 표시한다.
   - session detail은 turn timeline으로 표시한다.
   - 후속질의도 임시 생성 후 저장해야 timeline에 추가한다.

7. 접힘 UX
   - 보조 패널은 기본 접힘으로 둔다.
   - 상단 배지로 상태와 count를 보여준다.

## Validation

- `legal-graph` artifact validator
  - concept link가 없는 official article을 경고한다.
  - 조문번호가 없는 official match를 실패 처리한다.
  - high risk concept 후보가 적용조건 누락 상태인데 `가능`으로 판정되면 실패 처리한다.
- match fixture validator
  - 지하주차장 램프 경사, 피난 동선, 방화구획, 채광, 주차대수, 대지/도로, 인허가 fixture를 둔다.
- Task Assistant answer contract validator
  - 판정값이 존재하는지 확인한다.
  - 근거 섹션이 출처별로 분리되는지 확인한다.
  - 후보가 결론을 바꿀 수 있을 때 `추가확인필요`와 결론 차이 설명이 있는지 확인한다.
- review session validator
  - 저장 전 결과가 최근검토기록에 나타나지 않는지 확인한다.
  - 저장 후 세션 목록과 turn timeline에 나타나는지 확인한다.
  - 후속질의가 저장 전에는 임시 상태이고 저장 후 timeline에 추가되는지 확인한다.
- UI contract validator
  - 보조 패널이 기본 접힘 상태인지 확인한다.
  - 질문 입력과 현재 검토 결과가 기본 펼침인지 확인한다.
- SaaS boundary validator
  - SaaS에 법규 corpus와 official credential이 들어오지 않는지 확인한다.

## Open Follow Up

Graph RAG 품질은 1차 구현 후 실제 task 사례로 반복 개선한다. 특히 concept taxonomy, 적용조건 추출 품질, 관련 가능 후보의 결론 영향 판정은 운영 데이터를 보고 조정한다.
