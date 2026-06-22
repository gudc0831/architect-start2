# Task Assistant Unified Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Task Assistant so it answers architectural task questions with one integrated practical conclusion, uses `keyword + LLM + Graph RAG` legal matching, separates evidence by authority, saves review history only when the user clicks `검토기록저장`, supports follow-up questions inside saved review sessions, and keeps secondary evidence/status panels collapsed by default.

**Architecture:** `verified-legal-evidence-api` owns legal corpus, official verification, architectural concept Graph RAG, applicability matching, and candidate-impact judgment. `architect-saas` sends task/question context to that API, consumes enriched legal matches, applies a fixed service default review instruction, generates temporary review results, persists only user-saved review sessions/turns, and presents a collapsed evidence-first UX. Existing `AssistantTaskRecord`, `AssistantThread`, and `AssistantThreadMessage` remain the persistence backbone; rich review metadata is stored in record metadata and thread messages link to saved records.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/Postgres, Supabase project guards, existing assistant repositories, Node/TypeScript `verified-legal-evidence-api`, JSONL legal graph artifacts, existing `tsx` validators, existing legal hybrid search and graph expansion modules.

---

## Source Design

- Base design: `D:\architect-workspace\architect-saas\docs\superpowers\specs\2026-06-22-task-assistant-unified-upgrade-design.md`
- Absorbed legal Graph RAG draft: `D:\architect-workspace\architect-saas\docs\superpowers\specs\2026-06-22-task-assistant-legal-graph-rag-design.md`

The unified design document is the implementation standard. The legal Graph RAG draft is supporting context only when it does not conflict with the unified design.

## Harness Roles

- `choi`: coordinator and integration owner; ensures the plan stays inside the approved unified design and asks for approval before migrations, deploys, env changes, or production data changes.
- `hy`: legal Graph RAG owner inside `verified-legal-evidence-api`; implements concept taxonomy, applicability rules, match ranking, API contract, and legal validators.
- `ung`: SaaS Task Assistant owner inside `architect-saas`; implements fixed instruction, temporary generation, manual save, review sessions, follow-up turns, and UI collapse behavior.
- `ch`: UX/design reviewer; checks that the first screen is question/result focused and secondary areas start collapsed.
- `ul`: correctness/security reviewer; checks official-law credential boundary, source priority, candidate-impact conservatism, and no automatic history persistence.
- `Cicero`: deviation supervisor; reviews each completed slice against the base design and requests rework if the plan drifts from the approved scope.

## Non-Negotiable Requirements

- No source implementation starts until the user approves this plan.
- Do not move `LAW_OPEN_DATA_OC`, legal corpus ownership, or official legal verification into `architect-saas`.
- `verified-legal-evidence-api` must return law name plus article label and article number when a match is official verified; paragraph/item labels must be preserved when available.
- The LLM step is part of the real legal matching path. Deterministic extraction is a validator/local fallback, not the primary implementation.
- The answer should be one integrated conclusion whenever possible, not a permanent two-layer answer. Show a candidate-exclusion difference only when related candidates can change the conclusion.
- If a related candidate can change the conclusion and its applicability facts are missing or high risk, the final verdict must be `추가확인필요`.
- Evidence priority is official verified law, current task/file facts, internal WIKI, past review history, then explicitly included external web/skill evidence.
- Generated answers are temporary until `검토기록저장` is clicked.
- Unsaved results must not appear in recent review history.
- Follow-up answers are also temporary until saved into the same review session timeline.
- Recent review history is a session list; clicking a session opens the saved question/answer timeline.
- Recent history, file evidence, legal evidence detail, internal WIKI/history detail, external web/skill evidence, and local Codex status start collapsed.
- External web/skill evidence is opt-in for each review.
- Local Codex status is a badge unless the selected execution mode requires local Codex.

## File Structure

```text
D:\architect-workspace\
  verified-legal-evidence-api\
    src\
      legal-graph\
        graph-types.ts
        graph-builder.ts
        graph-expansion.ts
        concept-taxonomy.ts
        applicability-types.ts
        llm-extraction-provider.ts
        applicability-extractor.ts
        task-fact-extractor.ts
        applicability-matcher.ts
        graph-rag-ranker.ts
      retrieval\
        legal-hybrid-search.ts
        legal-query-parser.ts
      api\
        server.ts
    data\
      staging\
        legal-graph\
          nodes.jsonl
          edges.jsonl
          applicability-rules.jsonl
          concept-links.jsonl
          match-eval-fixtures.jsonl
    scripts\
      legal-graph-validate.ts
      legal-applicability-validate.ts
      legal-search-api-validate.ts
      legal-hybrid-search-validate.ts

  architect-saas\
    src\
      app\
        api\
          assistant\
            records\
              route.ts
            review-sessions\
              route.ts
              [sessionId]\
                route.ts
                turns\
                  route.ts
            retrieve\
              route.ts
            task-review\
              route.ts
      components\
        tasks\
          task-assistant-panel.tsx
          task-assistant-evidence-sections.tsx
          task-assistant-history.tsx
          task-assistant-review-result.tsx
      domains\
        assistant\
          review-answer-contract.ts
          review-instruction.ts
          review-session.ts
          task-review.ts
          types.ts
        legal\
          legal-verification-intent.ts
      repositories\
        assistant\
          contracts.ts
          local-store.ts
          postgres-store.ts
      use-cases\
        assistant-review-session-service.ts
        assistant-saas-mode-service.ts
        assistant-service.ts
        task-review-service.ts
        verified-legal-search-service.ts
    scripts\
      assistant-thread-memory-validate.ts
      legal-search-adapter-validate.ts
      task-assistant-unified-contract-validate.ts
      task-review-orchestrator-validate.ts
```

## Implementation Tasks

### 1. Baseline and Contract Guardrails

- [ ] Run the current repo-level read-only checks before editing.

```powershell
cd D:\architect-workspace\architect-saas
npm run task-review:validate
npm run assistant-thread-memory:validate
npm run legal-search:validate
cd D:\architect-workspace\verified-legal-evidence-api
npm run test:legal-graph
npm run test:legal-search-api
```

- [ ] Create `D:\architect-workspace\architect-saas\scripts\task-assistant-unified-contract-validate.ts`.
- [ ] Add `task-assistant:unified:validate` to `D:\architect-workspace\architect-saas\package.json`.

```json
{
  "scripts": {
    "task-assistant:unified:validate": "tsx scripts/task-assistant-unified-contract-validate.ts"
  }
}
```

- [ ] Make the validator fail unless all required implementation anchors exist:
  - service default instruction version in `src/domains/assistant/review-instruction.ts`
  - LLM extraction provider and actual legal Graph RAG invocation in `verified-legal-evidence-api`
  - unified review verdict type and candidate-impact fields in `src/domains/assistant/review-session.ts`
  - no automatic `POST /api/assistant/records` inside normal generate click flow in `task-assistant-panel.tsx`
  - no server-side auto-save inside `task-review-service.ts` generate path
  - review session routes under `src/app/api/assistant/review-sessions`
  - collapsed defaults for secondary panels in `task-assistant-panel.tsx`
  - answer contract contains `가능`, `불가`, `조건부`, `추가확인필요`, `판단보류`
  - candidate-impact rule forces `추가확인필요` when high-risk candidate facts are missing and conclusion may change
  - official verified legal matches require law name, article label, and normalized article number
  - review session title rename route and UI action exist
  - follow-up generation separates saved WIKI/history evidence from latest WIKI/history evidence

- [ ] Run the validator and confirm it fails before implementation.

```powershell
cd D:\architect-workspace\architect-saas
npm run task-assistant:unified:validate
```

### 2. Legal Graph RAG Data Model in verified-legal-evidence-api

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\applicability-types.ts` with these exported types:
  - `ArchitecturalConceptCategory`
  - `ArchitecturalConcept`
  - `ApplicabilityRule`
  - `TaskFact`
  - `LegalApplicabilityMatch`
  - `LegalCandidateImpact`
  - `LegalApplicabilityBundle`

- [ ] The high-risk concept enum must include exactly these first-version categories:

```ts
export const highRiskArchitecturalConceptCategories = [
  "피난",
  "방화",
  "구조",
  "주차",
  "장애인편의",
  "용적률",
  "건폐율",
  "일조",
  "채광",
  "대지/도로",
  "인허가",
] as const;
```

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\concept-taxonomy.ts`.
- [ ] Seed the first-version taxonomy with concept IDs, labels, aliases, and category for the high-risk categories. Include aliases such as `피난동선`, `방화구획`, `지하주차장 램프`, `주차대수`, `장애인 주차`, `대지안의 공지`, `도로 접도`, `일조권`, `채광창`, `건축허가`.
- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\data\staging\legal-graph\concept-links.jsonl`.
- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\data\staging\legal-graph\applicability-rules.jsonl`.
- [ ] Do not overwrite existing `nodes.jsonl` or `edges.jsonl` when the new artifacts cannot be built; follow the existing legal graph snapshot protection behavior.

### 3. LLM Task Fact and Applicability Extraction

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\task-fact-extractor.ts`.
- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\llm-extraction-provider.ts`.
- [ ] Implement the LLM extraction provider as the primary path for legal Graph RAG input extraction.
- [ ] The provider must receive question, task title, task description, file summaries, approved WIKI summaries, and past review summaries when available.
- [ ] The provider must return structured JSON only:
  - `taskFacts`
  - `conceptHints`
  - `applicabilityInterpretations`
  - `missingFacts`
  - `sourceAttribution`
  - `confidence`

- [ ] The LLM extraction prompt must state that the model extracts facts and applicability signals only; it must not make the final legal verdict.
- [ ] The generated schema must preserve fact source as one of `question`, `task`, `file`, `wiki`, or `history`.
- [ ] Implement deterministic extraction as fallback and validator fixture support from query/context text:
  - use/facility: 공동주택, 지하주차장, 근린생활시설, 오피스텔, 아파트
  - location: 지하, 지상, 대지, 도로, 피난계단, 주차장, 램프
  - action: 변경, 삭제, 추가, 완화, 반영, 인허가, 착공, 준공
  - permitStage: 계획, 심의, 허가, 착공, 준공, 사용승인
  - requester/history facts: 건설사 요청, 시행사 요청, 과거 검토, 담당자 확인

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\applicability-extractor.ts`.
- [ ] Build first-version applicability rules from chunk locators, text, and LLM applicability interpretations:
  - law name
  - article label
  - article number
  - paragraph label when detected
  - item label when detected
  - concept aliases matched from taxonomy
  - `appliesWhen` conditions inferred from stable keyword patterns
  - `missingFacts` when the question lacks required fields

- [ ] Export the provider contract:

```ts
export type ApplicabilityExtractionProvider = {
  extractApplicabilityRules(input: {
    query: string;
    taskContext?: LegalSearchTaskContext;
    excerpt: string;
    locatorText: string;
  }): Promise<ApplicabilityRule[]>;
};
```

- [ ] The actual `/api/legal/search` Graph RAG path must call the LLM provider when it is configured.
- [ ] If the LLM provider is unavailable, the response must set `llmExtractionStatus: "fallback"` and must not promote high-risk insufficient-fact candidates to a final `가능` conclusion.
- [ ] Keep deterministic extraction available for validators, local no-provider runs, and failure fallback.

### 4. Graph RAG Matching and Ranking

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\applicability-matcher.ts`.
- [ ] Match in this order:
  1. keyword/legal hybrid search hit
  2. extracted task facts
  3. taxonomy concept aliases
  4. applicability rule conditions
  5. legal graph path from concept/rule to law article

- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\src\legal-graph\graph-rag-ranker.ts`.
- [ ] Ranking must output:
  - `officialVerified`: answer-ready official matches with law name and article locator
  - `candidates`: related possible matches
  - `insufficientFacts`: matches blocked by missing applicability facts
  - `candidateImpact`: whether candidate inclusion can change the conclusion
  - `missingFacts`: consolidated missing conditions
  - `graphPaths`: explainable paths such as `task fact -> concept -> applicability rule -> article`

- [ ] Official match classification must require:
  - `answerReady === true`
  - law name
  - article label
  - normalized article number
  - official source URL or sanitized source locator
  - checked/effective metadata
  - no official credential leakage
- [ ] If paragraph, item, or subitem labels are detected, preserve them in the official match display locator.
- [ ] If law name, article label, or normalized article number is missing, downgrade the hit to `candidate` or `insufficient_facts`.

- [ ] Candidate impact must force `canChangeConclusion = true` when:
  - candidate is linked to a high-risk concept
  - required applicability facts are missing
  - candidate status would imply a stricter answer than the official verified-only answer

### 5. Extend Legal Search API Contract

- [ ] Update `D:\architect-workspace\verified-legal-evidence-api\src\retrieval\legal-hybrid-search.ts`.
- [ ] Extend `LegalSearchInput` with optional task context:

```ts
type LegalSearchTaskContext = {
  taskTitle?: string;
  taskDescription?: string;
  fileSummaries?: string[];
  wikiSummaries?: string[];
  historySummaries?: string[];
};
```

- [ ] Extend `LegalSearchResult` with:
  - `applicability: LegalApplicabilityBundle`

- [ ] Keep current `hits` behavior backward-compatible so existing SaaS mapping does not break before adapter changes.
- [ ] Update `D:\architect-workspace\verified-legal-evidence-api\src\api\server.ts` so `/api/legal/search` accepts:
  - `query`
  - `jurisdiction`
  - `effectiveDate`
  - `limit`
  - `taskContext`
  - `graphRagMode: "answer" | "research"`

- [ ] Default `graphRagMode` to `"answer"`.
- [ ] `/api/legal/search` must run keyword/hybrid retrieval first, then LLM fact/applicability extraction, then Graph RAG ranking.
- [ ] In `"answer"` mode, graph expansion must remain max depth 1 unless an exact official locator requires a direct legal relation. Keep depth 2 for diagnostic/research paths only.
- [ ] Update `D:\architect-workspace\verified-legal-evidence-api\scripts\legal-search-api-validate.ts` to assert the response includes `applicability` and does not leak credentials.
- [ ] Add `D:\architect-workspace\verified-legal-evidence-api\scripts\legal-applicability-validate.ts`.
- [ ] Add scripts to `D:\architect-workspace\verified-legal-evidence-api\package.json`.

```json
{
  "scripts": {
    "test:legal-applicability": "tsx scripts/legal-applicability-validate.ts"
  }
}
```

### 6. SaaS Legal Adapter Mapping

- [ ] Update `D:\architect-workspace\architect-saas\src\use-cases\verified-legal-search-service.ts`.
- [ ] Extend `FetchVerifiedLegalSearchEvidenceInput` with optional task context fields gathered from retrieved task context, project document summaries, approved WIKI, and recent review history.
- [ ] Extend local payload types with `LegalApplicabilityBundle`, `LegalApplicabilityMatch`, and `LegalCandidateImpact`.
- [ ] Map official verified matches to `AssistantEvidence` with these fields preserved:
  - `lawName`
  - `articleLabel`
  - `articleNumber`
  - `sourceUrl`
  - `apiSourceUrl`
  - `checkedAt`
  - `verificationStatus`
  - `legal.locator`
  - `legal.applicability`

- [ ] Preserve candidate matches in a separate metadata object; do not promote candidates into official evidence.
- [ ] Update `D:\architect-workspace\architect-saas\scripts\legal-search-adapter-validate.ts` to assert:
  - official matches include law name, article label, and normalized article number
  - candidate matches are available to answer synthesis
  - candidates are not marked as `verificationStatus: "verified"`
  - `OC` credentials are never present in mapped evidence

### 7. Fixed Service Review Instruction

- [ ] Add `D:\architect-workspace\architect-saas\src\domains\assistant\review-instruction.ts`.
- [ ] Export a single first-version default instruction:

```ts
export const TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION = "task-assistant-default-v1";

export const TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION = [
  "건축 task 관점에서 공식 법규, 현재 task/파일 사실관계, 내부 WIKI, 과거 검토기록을 구분한다.",
  "공식 법규 위반 가능성을 우선 판단하고, 내부 기준이나 건설사 요청사항은 실무 맥락으로 반영한다.",
  "결론에는 가능/불가/조건부/추가확인필요/판단보류 중 하나의 판정값을 포함한다.",
  "근거는 출처별로 분리하고, 부족정보와 후속확인사항을 명시한다.",
].join("\n");
```

- [ ] Update `D:\architect-workspace\architect-saas\src\app\api\assistant\task-review\route.ts`.
- [ ] Treat `instruction` as server-owned; reject client attempts to override it unless the user has an explicitly named future admin setting.
- [ ] Keep the user-controlled input named `question` for first review and `followUpQuestion` for session turns.
- [ ] Update `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts` so generation receives the fixed instruction version and text from the service, not from the panel textarea.

### 8. Unified Answer Contract

- [ ] Update `D:\architect-workspace\architect-saas\src\domains\assistant\review-answer-contract.ts`.
- [ ] Replace the AI-review-only headings with a Task Assistant unified contract that requires:
  - verdict enum: `가능 | 불가 | 조건부 | 추가확인필요 | 판단보류`
  - one integrated conclusion
  - source-separated evidence blocks
  - official law citations with law name and article locator
  - candidate-impact explanation only when candidate inclusion can change the conclusion
  - conflict list when sources point in different directions
  - missing facts
  - concrete follow-up checks

- [ ] Add `D:\architect-workspace\architect-saas\src\domains\assistant\review-session.ts`.
- [ ] Define:

```ts
export type ReviewVerdict = "가능" | "불가" | "조건부" | "추가확인필요" | "판단보류";

export type CandidateConclusionDelta = {
  shouldShow: boolean;
  officialOnlyConclusion: string;
  withCandidatesConclusion: string;
  reason: string;
};
```

- [ ] Implement `normalizeReviewVerdict()` and `enforceCandidateImpactVerdict()`.
- [ ] `enforceCandidateImpactVerdict()` must return `추가확인필요` when any candidate has `canChangeConclusion === true` and either high-risk concepts or missing facts are present.
- [ ] Update `D:\architect-workspace\architect-saas\src\domains\assistant\task-review.ts` so `StructuredTaskReviewSchema` includes verdict, candidateConclusionDelta, conflicts, missingFacts, legalMatches, defaultInstructionVersion, and evidenceSnapshotSummary.

### 9. Split Generation from Persistence

- [ ] Update `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts`.
- [ ] Remove server-side automatic record creation from the normal `mode: "generate"` path.
- [ ] Replace the current save behavior with an unsaved generated payload:
  - `status: "generated"`
  - `savedRecord: null`
  - `generation.saved: false`
  - `generated`
  - `structuredReviewSchema`
  - `reviewDraft`

- [ ] Preserve blocking behavior when verified legal evidence is required and absent.
- [ ] Add a separate exported save function:

```ts
export async function saveTaskAssistantReviewTurn(input: SaveTaskAssistantReviewTurnInput, user: AuthUser): Promise<SavedReviewTurnResult>
```

- [ ] The save function must:
  - create one `AssistantTaskRecord`
  - create or reuse one `AssistantThread` review session for the chosen session ID
  - append the user question message
  - append the assistant answer message linked to the new record
  - store rich metadata under `AssistantTaskRecord.metadata.unifiedReview`
  - store flat evidence array in `AssistantThreadMessage.evidenceSnapshot` for existing memory compatibility

- [ ] Metadata must include:
  - `defaultInstructionVersion`
  - `verdict`
  - `candidateConclusionDelta`
  - `officialLegalMatches`
  - `candidateLegalMatches`
  - `conflicts`
  - `missingFacts`
  - `evidenceDigests`
  - `savedWikiEvidenceSnapshot`
  - `savedHistoryEvidenceSnapshot`
  - `capturedAt`
  - `taskSnapshotHash`

### 10. Review Session Repository and Routes

- [ ] Update `D:\architect-workspace\architect-saas\src\repositories\assistant\contracts.ts`.
- [ ] Add repository methods:

```ts
listThreadsByTask(input: { taskId: string; limit: number }): Promise<AssistantThread[]>;
findThreadById(threadId: string): Promise<AssistantThread | null>;
listThreadMessagesWithRecords(input: { threadId: string; limit: number }): Promise<AssistantThreadMessage[]>;
updateThreadTitle(input: { threadId: string; title: string }): Promise<AssistantThread>;
```

- [ ] Implement the methods in:
  - `D:\architect-workspace\architect-saas\src\repositories\assistant\postgres-store.ts`
  - `D:\architect-workspace\architect-saas\src\repositories\assistant\local-store.ts`

- [ ] Add `D:\architect-workspace\architect-saas\src\use-cases\assistant-review-session-service.ts`.
- [ ] Implement:
  - `listReviewSessions(taskId, user)`
  - `getReviewSession(sessionId, user)`
  - `saveInitialReviewTurn(input, user)`
  - `saveFollowUpReviewTurn(input, user)`
  - `generateSessionTitle(input)`
  - `renameReviewSession(sessionId, title, user)`

- [ ] Add route `D:\architect-workspace\architect-saas\src\app\api\assistant\review-sessions\route.ts`.
  - `GET ?taskId=` lists saved sessions only.
  - `POST` saves an initial generated review result.

- [ ] Add route `D:\architect-workspace\architect-saas\src\app\api\assistant\review-sessions\[sessionId]\route.ts`.
  - `GET` returns session header and saved timeline.
  - `PATCH` updates the session title after validating editor access.

- [ ] Add route `D:\architect-workspace\architect-saas\src\app\api\assistant\review-sessions\[sessionId]\turns\route.ts`.
  - `POST` saves a generated follow-up answer into the existing session.

- [ ] All write routes must call `assertRequestIntegrity(request)` and `requireCurrentProjectEditor(user)`.
- [ ] All read routes must call `requireCurrentProjectAccess(user)`.
- [ ] Title updates must trim whitespace, reject empty titles, cap titles at 80 Korean-visible characters, and preserve the previous title on validation failure.

### 11. Panel State and Manual Save UX

- [ ] Update `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-panel.tsx`.
- [ ] Replace editable `instruction` state with imported service instruction display metadata:
  - no default visible textarea
  - optional collapsed read-only "기본 검토지침" disclosure
  - user input remains `question`

- [ ] Add state:

```ts
type PendingReviewResult = {
  taskId: string;
  sessionId?: string;
  question: string;
  answerMarkdown: string;
  verdict: ReviewVerdict;
  structuredReviewSchema: StructuredTaskReviewSchema;
  evidence: AssistantEvidence[];
  createdAt: string;
  saved: false;
};
```

- [ ] `runAssistantReview()` must set `pendingReviewResult` and must not call `/api/assistant/records`.
- [ ] The SaaS API path must call `/api/assistant/task-review` for generation and keep the result temporary.
- [ ] The local Codex path must also produce a temporary result before save.
- [ ] Add a `검토기록저장` button that is enabled only when `pendingReviewResult.saved === false`.
- [ ] On save, call `POST /api/assistant/review-sessions` for an initial review or `POST /api/assistant/review-sessions/{sessionId}/turns` for a follow-up.
- [ ] After successful save:
  - clear unsaved warning
  - refresh session list
  - select the saved session
  - show the saved turn in timeline
  - mark the current result as saved

- [ ] On task change or panel close, discard `pendingReviewResult` after showing no modal; the design intentionally treats unsaved output as disposable.
- [ ] Display this Korean status while unsaved:

```text
저장되지 않은 검토 결과입니다. 기록으로 남기려면 검토기록저장을 누르세요.
```

### 12. Follow-Up Question Flow

- [ ] In `task-assistant-panel.tsx`, when a saved session is selected, show a compact follow-up input below the timeline.
- [ ] Follow-up generation must include:
  - selected session ID
  - saved timeline summary
  - latest task context
  - saved evidence snapshot references
  - saved WIKI evidence snapshot
  - saved past-review evidence snapshot
  - latest WIKI evidence snapshot
  - latest past-review evidence snapshot
  - fresh verified legal search request

- [ ] Add follow-up input handling to `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts`.
- [ ] Reuse existing `conversationMemory` and `buildThreadMemory` behavior from `retrieveAssistantEvidence()`.
- [ ] The follow-up answer is temporary until saved.
- [ ] On save, append the new user turn and assistant turn to the selected thread.
- [ ] The follow-up prompt must separate evidence explicitly:
  - `저장 당시 WIKI 근거`
  - `최신 WIKI 근거`
  - `저장 당시 과거검토 근거`
  - `최신 과거검토 근거`
- [ ] If saved and latest WIKI/history evidence differ, render a compact warning and include the delta in the evidence snapshot metadata.
- [ ] If current task context differs from the saved task snapshot hash, show a warning:

```text
저장 당시 task 상태와 현재 task 상태가 다릅니다. 새 답변은 현재 task 기준으로 다시 검증되었습니다.
```

### 13. Recent Review History Design

- [ ] Add `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-history.tsx`.
- [ ] Render recent review history as session rows, not individual unsaved generations.
- [ ] Session row fields:
  - verdict badge
  - title
  - first question preview
  - last updated date
  - turn count
  - saved state
  - title edit action

- [ ] Clicking a session loads the timeline.
- [ ] Session title edit uses inline edit or a small dialog and calls `PATCH /api/assistant/review-sessions/{sessionId}`.
- [ ] After title edit success, refresh the selected session header and the collapsed recent-history list.
- [ ] Timeline displays:
  - user question
  - assistant answer
  - verdict badge
  - saved evidence snapshot count
  - "저장 당시 근거" collapsed detail
  - follow-up input

- [ ] Keep the session list collapsed by default. Show only the top summary badge in the main header:

```text
[최근검토 3] [공식조문 2] [법규후보 5] [파일근거 1] [외부근거 0] [Codex 준비됨]
```

### 14. Evidence Sections and Collapsed Defaults

- [ ] Add `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-evidence-sections.tsx`.
- [ ] Move these secondary sections out of the primary panel body:
  - related legal evidence
  - official verified articles
  - related candidates
  - file evidence
  - internal WIKI
  - past review history
  - external web/skill evidence
  - local Codex status

- [ ] Set initial expanded state to false for every secondary section.
- [ ] Keep only question input and current review result expanded by default.
- [ ] In the legal evidence section, show official verified and candidate groups separately.
- [ ] Candidate rows must show whether they can change the conclusion and what fact is missing.
- [ ] External web/skill evidence must have an explicit "이번 검토에 포함" control; unchecked evidence cannot be passed to answer synthesis.
- [ ] Local Codex must render as a badge unless execution mode is `local-codex`.

### 15. Review Result Component

- [ ] Add `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-review-result.tsx`.
- [ ] Render:
  - verdict badge
  - integrated conclusion
  - save state
  - `검토기록저장` button
  - candidate conclusion delta only when `candidateConclusionDelta.shouldShow === true`
  - conflicts if present
  - missing facts
  - source-separated evidence summary

- [ ] Do not render a permanent official-only answer and candidate-included answer side by side.
- [ ] When the final verdict is `추가확인필요` because of candidates, render a short explanation:

```text
공식검증조문만 보면 즉시 위반 근거는 확인되지 않지만, 관련 가능 후보가 적용되면 결론이 바뀔 수 있어 추가확인이 필요합니다.
```

### 16. Preserve Existing Compatibility

- [ ] Keep `/api/assistant/records` working for legacy saved records and existing recent-record consumers.
- [ ] Do not remove existing `AssistantTaskRecord`; saved review turns still create records.
- [ ] Ensure `assistant-thread-memory-validate.ts` still passes by preserving flat `AssistantEvidence[]` snapshots for thread messages.
- [ ] Ensure `task-review-orchestrator-validate.ts` still passes by keeping centralized legal verification and WIKI approval boundaries.
- [ ] Update existing validators only when the expected behavior intentionally changes from auto-save to manual save.

### 17. Validation Fixtures

- [ ] In `verified-legal-evidence-api`, add legal applicability fixtures for:
  - 지하주차장 램프 경사
  - 피난 동선 변경
  - 방화구획 변경
  - 주차대수 산정
  - 대지와 도로 접도
  - 채광창/일조 관련 검토
  - 장애인 편의시설
  - 건축허가 단계 변경 요청

- [ ] Each fixture must assert:
  - extracted concepts
  - LLM extraction result shape or deterministic fallback status
  - official/candidate split
  - law name, article label, and normalized article number presence when official
  - missing facts
  - candidate impact
  - graph path

- [ ] In `architect-saas`, add assistant unified fixtures for:
  - legal official match says no immediate issue, but past review says contractor request
  - contractor request exists, but official law likely blocks
  - candidate can change conclusion, final verdict becomes `추가확인필요`
  - candidate cannot change conclusion, no delta section is shown
  - unsaved generated result does not appear in recent sessions
  - saved follow-up appears in session timeline
  - review session title can be renamed
  - follow-up separates saved WIKI/history evidence from latest WIKI/history evidence

### 18. Final Validation Commands

- [ ] Run focused SaaS validators.

```powershell
cd D:\architect-workspace\architect-saas
npm run task-assistant:unified:validate
npm run task-review:validate
npm run assistant-thread-memory:validate
npm run legal-search:validate
npm run typecheck
```

- [ ] Run focused legal API validators.

```powershell
cd D:\architect-workspace\verified-legal-evidence-api
npm run test:legal-applicability
npm run test:legal-graph
npm run test:legal-hybrid-search
npm run test:legal-search-api
npm run typecheck
```

- [ ] Run browser smoke only after unit/script validators pass.

```powershell
cd D:\architect-workspace\architect-saas
npm run dev
```

- [ ] Verify in browser:
  - question/result are the only default expanded areas
  - secondary panels start collapsed
  - generating an answer does not change recent review count
  - clicking `검토기록저장` adds one recent review session
  - clicking that session opens the saved question/answer timeline
  - follow-up answer is temporary until saved
  - related candidate that can change conclusion produces `추가확인필요`

## Supervisor Review Gate

- [ ] Before implementation starts, send this plan to the deviation supervisor.
- [ ] The supervisor must explicitly check these questions:
  - Does the plan keep legal Graph RAG ownership inside `verified-legal-evidence-api`?
  - Does the plan include the LLM extraction step in the actual search/generation path?
  - Does the plan avoid moving official credentials/corpus into `architect-saas`?
  - Does the plan require law name, article label, and normalized article number for official verified matches?
  - Does the plan preserve one integrated conclusion as the target answer format?
  - Does the plan force `추가확인필요` when candidates can change the conclusion?
  - Does the plan prevent unsaved generations from appearing in recent history?
  - Does the plan model saved review history as session plus timeline turns?
  - Does the plan include user-editable review session titles?
  - Does the plan distinguish saved WIKI/history evidence from latest WIKI/history evidence in follow-up?
  - Does the plan keep secondary panels collapsed by default?
  - Does the plan avoid production deploy, env mutation, and DB migration without separate approval?

- [ ] If the supervisor finds a deviation, revise this plan before any implementation begins.

## Approval Boundary

This plan authorizes planning only. Implementation, database migration, production deploy, environment variable changes, legal corpus refresh, R2 publish, or official-law credential changes require a separate explicit approval.
