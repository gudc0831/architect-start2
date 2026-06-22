# Task Assistant Legal Graph RAG Design

Date: 2026-06-22
Scope: 기본 고도화 설계. 코드 구현 전 설계 기준을 고정한다.

## Goal

Task Assistant가 건축 task 질문에 대해 공식 법규, 내부 WIKI, 과거 검토기록, 현재 task/파일 근거를 하나의 결론으로 합성한다. 다만 근거는 출처와 권위를 분리해서 보여준다.

핵심 목표는 관련법규 매칭을 단순 키워드 검색에서 `키워드 + LLM + Graph RAG` 3단 조합으로 고도화하는 것이다. Graph RAG는 법령명 중심이 아니라 건축 개념 중심으로 구성하고, 각 개념을 조문 단위 근거와 연결한다.

## Current State

- `verified-legal-evidence-api`에 기존 법규 그래프 레이어가 있다.
  - `src/legal-graph/graph-types.ts`
  - `src/legal-graph/graph-builder.ts`
  - `src/legal-graph/graph-expansion.ts`
  - `data/staging/legal-graph/nodes.jsonl`
  - `data/staging/legal-graph/edges.jsonl`
- 현재 그래프는 `law -> article -> paragraph` 및 `cites`, `delegates_to`, `interprets`, `same_topic` 같은 법규 간 연결에 가깝다.
- Task Assistant는 `architect-saas`에서 법규 API 결과, 내부 WIKI, 과거 검토기록, task/파일 근거를 합성하지만, 조문 적용조건과 근거 우선순위가 명확히 분리되어 있지 않다.

## Selected Approach

### Option A: Keyword-first only

키워드로 법규 후보를 찾고 LLM이 답변한다.

- 장점: 구현이 빠르다.
- 단점: 조문 적용조건과 실무 맥락을 설명하기 어렵고 오인용 위험이 높다.

### Option B: Law article graph first

법령/조문 그래프를 중심으로 주변 조문을 확장한다.

- 장점: 공식 조문 근거를 잘 추적할 수 있다.
- 단점: 사용자의 질문은 보통 조문명이 아니라 `램프 경사`, `피난 동선`, `건설사 요청`처럼 건축 개념으로 들어오기 때문에 매칭 품질이 제한된다.

### Option C: Architectural concept graph plus article links

건축 개념을 중심으로 task 사실관계와 조문 적용요건을 연결한다.

- 장점: 실무 질문과 법규 조문 사이의 설명 가능한 경로를 만들 수 있다.
- 단점: concept taxonomy와 적용조건 추출 로직을 따로 관리해야 한다.

Decision: Option C를 기본 방향으로 한다. 키워드는 후보 검색, LLM은 사실관계와 적용조건 추출, Graph RAG는 관련성 경로와 점수 산정에 사용한다.

## Ownership

Graph RAG 데이터와 법규 검증 로직은 `verified-legal-evidence-api`가 소유한다.

`architect-saas`는 법규 그래프 데이터를 직접 들고 있지 않고, API 응답으로 다음 결과만 소비한다.

- 공식검증조문
- 관련 가능 후보
- 적용조건 판정
- 누락 사실관계
- graph path
- confidence/relevance score

이 경계는 `LAW_OPEN_DATA_OC`와 법규 corpus ownership을 SaaS로 옮기지 않기 위한 원칙이다.

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
      legal/
        legal-verification-intent.ts

    use-cases/
      verified-legal-search-service.ts
      task-review-service.ts
      assistant-service.ts
```

## Data Model

### Architectural Concept

```ts
type ArchitecturalConcept = {
  conceptId: string;
  label: string;
  aliases: string[];
  category:
    | "피난"
    | "방화"
    | "주차"
    | "채광"
    | "일조"
    | "용적률"
    | "건폐율"
    | "인동거리"
    | "장애인편의"
    | "구조"
    | "설비"
    | "인허가"
    | "기타";
};
```

### Applicability Rule

```ts
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
```

### Task Fact

```ts
type TaskFact = {
  factId: string;
  label: string;
  value: string;
  source: "question" | "task" | "file" | "wiki" | "history";
  confidence: number;
};
```

### Match Result

```ts
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
  legalAuthorityRank?: string;
  reason: string;
};
```

## Pipeline

1. Keyword candidate retrieval
   - 질문, task 제목/설명, 파일 요약, 과거 기록에서 키워드를 추출한다.
   - 기존 legal search/hybrid search로 넓은 후보를 가져온다.

2. LLM fact extraction
   - task와 질문에서 건축 사실관계를 추출한다.
   - 예: 용도, 층수, 위치, 시설, 행위, 규모, 인허가 단계, 건설사 요청 여부.
   - LLM 결과는 final authority가 아니라 match input이다.

3. Applicability extraction
   - 조문/chunk에서 적용조건을 추출한다.
   - 최초 구현은 LLM 추출 + deterministic validator를 사용한다.
   - 사람이 검토한 rule은 `human_reviewed`로 승격할 수 있다.

4. Graph RAG ranking
   - 건축 개념 node를 중심으로 task facts와 article/rule을 연결한다.
   - `task fact -> concept -> applicability rule -> law article` 경로를 만든다.
   - 관련성 점수, 누락 조건, 충돌 조건을 계산한다.

5. Official verification split
   - 조문번호, 항/호/목, 공식 URL/API URL, checkedAt, 적용조건 판정이 충분하면 `official_verified`.
   - 조문 또는 적용조건이 부족하면 `candidate` 또는 `insufficient_facts`.

6. Task Assistant answer synthesis
   - 하나의 결론 문장을 생성하되 근거는 분리한다.
   - 공식검증조문이 내부 WIKI와 과거 기록보다 우선한다.

## Evidence Priority

우선순위는 다음과 같다.

1. 공식검증조문
2. 현재 task/파일 사실관계
3. 내부 WIKI
4. 과거 검토기록

법규가 금지하면 내부 WIKI나 과거 검토기록이 있어도 불가로 답한다. 단, 건설사 요청이나 과거 관행이 있었다는 맥락은 결론에 함께 표시한다.

## Answer Contract

Task Assistant 답변은 통합 결론과 분리 근거를 모두 포함해야 한다.

```text
결론:
해당 사항은 건설사 요청으로 확인되나, 건축법 제0조 제0항 적용 가능성이 높아 현재 조건으로는 불가 또는 추가 확인이 필요합니다.

공식검증조문:
- 건축법 제0조 제0항: ...

현재 task/파일 근거:
- ...

내부 WIKI:
- ...

과거 검토기록:
- ...

부족정보:
- 층수, 면적, 용도 등 적용조건 판단에 필요한 정보
```

## UI Impact

초기 UI는 답변 흐름을 복잡하게 만들지 않는다.

- 기본 화면에는 질문 입력과 통합 결론을 중심으로 둔다.
- 관련법규, 내부 WIKI, 과거 검토기록, 파일근거, 외부웹/스킬근거, 로컬 Codex 상태는 접힌 패널로 둔다.
- 관련법규 패널 안에서 `공식검증조문`과 `관련 가능 후보`를 분리한다.
- 사용자는 후보 조문을 선택해 후속 질의에 포함할 수 있다.

## Validation

초기 구현 후 최소 검증은 다음을 포함한다.

- `legal-graph` artifact validator
  - concept link가 없는 official article을 경고한다.
  - 조문번호가 없는 official match를 실패 처리한다.
- match fixture validator
  - 대표 task 질문과 기대 조문을 fixture로 둔다.
  - 예: 지하주차장 램프 경사, 피난 동선, 방화구획, 채광, 주차대수.
- Task Assistant contract validator
  - 답변에 공식검증조문과 내부/과거 근거가 섞여 있지 않고, 근거 섹션이 분리되는지 확인한다.
- SaaS boundary validator
  - SaaS에 법규 corpus와 official credential이 들어오지 않는지 확인한다.

## Out Of Scope

- Graph RAG 전체 품질 최적화는 후속 반복 작업으로 둔다.
- 대규모 법규 corpus 재수집, R2 publish, production deploy, env 변경은 별도 승인 없이는 하지 않는다.
- 법률 자문처럼 최종 법적 판단을 단정하는 UX는 만들지 않는다. 답변은 건축 실무 검토 보조로 한정한다.

