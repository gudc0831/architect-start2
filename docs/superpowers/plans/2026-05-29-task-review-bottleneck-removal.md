# Task Review Bottleneck Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. This plan is explicitly selected for Subagent-Driven execution, not inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining blockers that prevent the official-law task review flow from being usable end-to-end in the SaaS app.

**Architecture:** Keep official law verification server-side, using `LAW_OPEN_DATA_OC` only from the SaaS server environment. Route legal/regulation SaaS generation through `/api/assistant/task-review`, where retrieval, official-law verification, provider generation, and record persistence all use the same server-owned verified evidence bundle. `mode: "generate"` requires project editor permission, WIKI approval remains exclusively under Knowledge admin routes, and task-review generated records are saved as `candidateState: "not_candidate"` unless a later admin review explicitly promotes them.

**Tech Stack:** Next.js App Router, TypeScript, existing assistant repositories, National Law Information Center Open API, existing SaaS assistant provider policy, PowerShell/API smoke checks.

---

## 2026-06-10 OLD/SUPERSEDED Notice

- [x] This plan is historical and is no longer the active task-review/legal architecture plan.
- [x] The old SaaS-owned `LAW_OPEN_DATA_OC` direction is superseded by `2026-06-09-verified-legal-centralization-plan.md`.
- [x] Current task-review ownership and cross-project boundaries are tracked in `2026-06-09-cross-project-boundary-and-integration-plan.md`.
- [x] Current deployed Preview proof is tracked in `2026-06-09-ai-review-full-pass-plan.md`.
- [ ] Do not use unchecked items in this historical plan as a current release checklist unless the plan is explicitly reopened and rewritten around the centralized verified API boundary.

## Selected Execution Mode

Execution mode is fixed as **Subagent-Driven Development**.

Controller responsibilities:
- Read this plan once and extract each task with full text before dispatch.
- Dispatch a fresh implementer subagent for one task at a time.
- Provide each implementer with the exact task text, relevant file paths, current constraints, current `TASK_BASE_SHA`, and the warning that other workspace changes may exist and must not be reverted.
- After each implementer returns, capture `TASK_HEAD_SHA`, touched files, and verification output.
- Dispatch a fresh spec-compliance reviewer subagent with the task text, `TASK_BASE_SHA..TASK_HEAD_SHA`, touched files, verification output, and common invariant checklist.
- Only after spec review passes, dispatch a fresh code-quality reviewer subagent with the same diff range and verification output.
- If either reviewer finds issues, dispatch a fresh fix subagent for the same task ownership with the reviewer findings, then re-run the failed reviewer. Do not reuse a subagent that already accumulated stale implementation context.
- Mark the task complete only after implementation, tests, spec review, and code-quality review all pass.
- Do not dispatch multiple implementation subagents in parallel.
- Do not pause between tasks unless a subagent returns `BLOCKED`, the plan is proven wrong, or external credentials/user approval are required.

Common invariant checklist for every implementer and reviewer:
- `LAW_OPEN_DATA_OC` is read only server-side and is never sent to the browser.
- Official-law API URLs stored in responses, records, logs, or audits never include `OC`.
- `/api/assistant/task-review` never imports Knowledge admin route handlers and never calls `reviewKnowledgeCandidate`.
- `mode: "preview"` requires project access; `mode: "generate"` requires project editor permission.
- Legal/regulation SaaS generation cannot bypass task-review through `/api/assistant/generate`.
- Generated task-review records are persisted server-side from the verified evidence bundle, not from browser-posted evidence.
- Task-review generated records use `candidateState: "not_candidate"`.
- The SaaS UI calls `/api/assistant/task-review` before any `/api/assistant/retrieve` call and does not POST SaaS task-review records to `/api/assistant/records`.
- Runtime verification covers blocked UI state, network calls, and absence of hook-order errors.

Task dispatch order:
- Task 0 -> controller-only setup, no implementer.
- Task 1 -> backend configuration implementer, then spec reviewer, then code-quality reviewer.
- Task 2 -> backend contract implementer, then spec reviewer, then code-quality reviewer.
- Task 3 -> backend generation implementer, then spec reviewer, then code-quality reviewer.
- Task 4 -> backend orchestrator implementer, then spec reviewer, then code-quality reviewer.
- Task 5 -> frontend implementer, then spec reviewer, then code-quality reviewer.
- Task 6 -> backend compatibility implementer, then spec reviewer, then code-quality reviewer.
- Task 7 -> performance implementer, then spec reviewer, then code-quality reviewer.
- Task 8 -> verification implementer, then spec reviewer, then code-quality reviewer.
- Task 9 -> runtime verification implementer, then spec reviewer, then code-quality reviewer only when source changes are made.
- Task 10 -> integrator implementer, then final whole-branch reviewer.

Reviewer prompt inputs required for every task:
- Full task text copied from this plan.
- `TASK_BASE_SHA`, `TASK_HEAD_SHA`, and `git diff --stat TASK_BASE_SHA..TASK_HEAD_SHA`.
- Full command output for every verification command listed in the task.
- Touched file list from `git diff --name-only TASK_BASE_SHA..TASK_HEAD_SHA`.
- The common invariant checklist above.

Rollback protocol:
- If a task commit fails spec review and the fix subagent cannot repair it in one bounded pass, stop that task and revert only the task commit range with `git revert TASK_BASE_SHA..TASK_HEAD_SHA`.
- Never use `git reset --hard`.
- Never revert pre-existing dirty files listed in Task 0.

---

## File Structure

- Modify `D:\architect-workspace\architect-saas\.env.example`
  - Document `LAW_OPEN_DATA_OC` as a server-only official-law credential.
- Modify `D:\architect-workspace\architect-saas\src\domains\assistant\types.ts`
  - Add task-review metadata to assistant records.
- Create `D:\architect-workspace\architect-saas\src\domains\assistant\task-review.ts`
  - Shared request/response/result contracts for route, service, validation script, and UI.
- Modify `D:\architect-workspace\architect-saas\src\domains\legal\official-law-api.ts`
  - Parallelize locator verification and preserve OC redaction.
- Modify `D:\architect-workspace\architect-saas\src\use-cases\assistant-saas-mode-service.ts`
  - Extract generation from a server-provided evidence bundle and block legacy legal/regulation generation.
- Modify `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts`
  - Add preview/generate modes, official-law digesting, evidence readiness, server-side record persistence, and WIKI non-approval guarantees.
- Modify `D:\architect-workspace\architect-saas\src\app\api\assistant\task-review\route.ts`
  - Parse mode before project guard; require editor for generate; return 409 for blocked and 201 for generated records.
- Modify `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-panel.tsx`
  - Use task-review for SaaS legal reviews; handle 409 data; avoid duplicate retrieve; display blockers; use server-saved record.
- Modify `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`
  - Add env documentation, route guard, server-save, legacy generate guard, no-approve, and deterministic parallel locator checks.
- Create `D:\architect-workspace\architect-saas\scripts\task-review-service-smoke.ps1`
  - Local smoke script for auth, retrieve, task-review, record, and optional admin candidate count checks.
- Modify `D:\architect-workspace\architect-saas\package.json`
  - Add `task-review:smoke`.
- Add worklog `D:\architect-workspace\architect-saas\docs\worklogs\2026-05-29-task-review-bottleneck-removal.md`
  - Record implementation, verification commands, browser results, and production-only requirements.

---

### Task 0: Execution Safety Preflight

**Files:**
- No source files.

- [ ] **Step 1: Confirm branch/worktree isolation**

Run:

```powershell
git branch --show-current
git worktree list
git status --short
git rev-parse HEAD
```

Expected:
- Current branch name contains `task-review` or the controller creates a dedicated branch before Task 1.
- `git status --short` output is recorded in controller notes as `PROTECTED_DIRTY_FILES`.
- `git rev-parse HEAD` output is recorded as `PLAN_BASE_SHA`.

- [ ] **Step 2: Create an isolated branch when needed**

If the current branch is not a dedicated task-review branch, run:

```powershell
git switch -c task-review-bottleneck-removal
```

Expected: `git branch --show-current` prints `task-review-bottleneck-removal`.

- [ ] **Step 3: Set task commit discipline**

For every task after this one, the controller records:

```text
TASK_BASE_SHA=<git rev-parse HEAD before dispatch>
TASK_HEAD_SHA=<git rev-parse HEAD after task commit>
```

Expected:
- Implementers use only the exact `git add` pathspec listed in their task.
- No task uses a broad multi-root `git add` pathspec.
- Reviewers receive `TASK_BASE_SHA..TASK_HEAD_SHA`.

---

### Task 1: Document Official-Law Server Credential

**Files:**
- Modify: `D:\architect-workspace\architect-saas\.env.example`
- Modify: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`
- Test: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`

- [ ] **Step 1: Write failing validation for env documentation**

Add this check near the existing static source checks in `scripts/task-review-orchestrator-validate.ts`:

```ts
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
assert.match(envExample, /^LAW_OPEN_DATA_OC=/m);
assert.match(envExample, /National Law Information Center|국가법령정보센터|LAW OPEN DATA/);
```

- [ ] **Step 2: Run validation to verify it fails**

Run:

```powershell
npm run task-review:validate
```

Expected: failure text includes `LAW_OPEN_DATA_OC`.

- [ ] **Step 3: Add env documentation**

Insert this block in `.env.example` after `HOLIDAY_API_SERVICE_KEY=`:

```env
# National Law Information Center LAW OPEN DATA OC for server-side official-law verification.
# Required for /api/assistant/task-review legal generation. Keep this server-side only.
LAW_OPEN_DATA_OC=
```

- [ ] **Step 4: Run validation to verify it passes**

Run:

```powershell
npm run task-review:validate
```

Expected: JSON output has `"status":"passed"`.

- [ ] **Step 5: Commit**

```powershell
git add .env.example scripts/task-review-orchestrator-validate.ts
git commit -m "chore: document official law api server credential"
```

---

### Task 2: Extract Task Review Contracts And Metadata

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\domains\assistant\types.ts`
- Create: `D:\architect-workspace\architect-saas\src\domains\assistant\task-review.ts`
- Modify: `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts`
- Modify: `D:\architect-workspace\architect-saas\src\app\api\assistant\task-review\route.ts`
- Test: `D:\architect-workspace\architect-saas\npm run typecheck`

- [ ] **Step 1: Extend assistant record metadata**

In `src/domains/assistant/types.ts`, replace `AssistantRecordMetadata` with:

```ts
export type AssistantRecordMetadata = {
  knowledgeReview?: KnowledgeReviewMetadata;
  approvedKnowledgeItem?: ApprovedKnowledgeItem;
  externalEvidence?: ExternalEvidenceRecord;
  taskReview?: {
    source: "assistant-task-review";
    officialLawStatus: "not_required" | "verified" | "failed";
    evidenceDigest: string;
    officialLawDigest: string;
    providerCallMode: "mock" | "live";
    savedByOrchestrator: true;
  };
};
```

- [ ] **Step 2: Create shared task-review types**

Create `src/domains/assistant/task-review.ts`:

```ts
import type { AssistantDraftSummary, AssistantEvidence, AssistantRecord, AssistantTaskContext } from "@/domains/assistant/types";
import type { AssistantGenerateResult } from "@/domains/assistant/saas-api-mode";
import type { OfficialLawVerificationReport } from "@/domains/legal/official-law-api";

export type TaskReviewMode = "preview" | "generate";

export type TaskReviewRequest = {
  taskId: string;
  question: string;
  instruction?: string;
  mode?: TaskReviewMode;
};

export type EvidenceReadinessItem = {
  kind: "central_knowledge" | "project_document" | "web_or_skill";
  status: "available" | "missing";
  action: string;
};

export type TaskReviewSavedRecord = Pick<
  AssistantRecord,
  "id" | "taskId" | "confidenceScore" | "confidenceReason" | "executionMode" | "runtimeMode" | "candidateState" | "createdAt" | "updatedAt"
> & {
  candidateState: "not_candidate";
  draftSummary: AssistantDraftSummary | null;
};

export type TaskReviewChecklistItem = {
  label: string;
  evidenceIds: string[];
  status: "todo" | "needs_review" | "blocked";
};

export type TaskReviewWarning = {
  message: string;
  severity: "info" | "warning" | "blocker";
  evidenceIds: string[];
};

export type StructuredTaskReviewSchema = {
  answerMarkdown: string;
  lawCitations: Array<{
    lawName: string;
    articleLabel?: string;
    articleNumber?: string;
    apiUrl: string;
    checkedAt: string;
    evidenceId?: string;
  }>;
  checklistItems: TaskReviewChecklistItem[];
  warnings: TaskReviewWarning[];
  evidenceConflicts: Array<{
    summary: string;
    evidenceIds: string[];
  }>;
  confidence: {
    score: number;
    reason: string;
  };
  wikiCandidateDraft: {
    allowed: boolean;
    title: string;
    summary: string;
    tags: string[];
    sourceEvidenceIds: string[];
  } | null;
};

export type TaskReviewBaseResponse = {
  taskContext: AssistantTaskContext;
  retrievedEvidence: {
    count: number;
    regulationCount: number;
    unavailableEvidenceKinds: string[];
  };
  officialLawVerification: OfficialLawVerificationReport;
  evidence: AssistantEvidence[];
  evidenceReadiness: EvidenceReadinessItem[];
  savedRecord: TaskReviewSavedRecord | null;
  wiki: {
    candidateCreated: false;
    approvalAttempted: false;
    approvedKnowledgeItemId: null;
    reason?: string;
  };
};

export type TaskReviewBlockedResponse = TaskReviewBaseResponse & {
  status: "blocked";
  reason: string;
  savedRecord: null;
  generation: {
    status: "blocked";
    reason: string;
  };
};

export type TaskReviewReadyResponse = TaskReviewBaseResponse & {
  status: "ready_for_generation";
  reason: string;
  savedRecord: null;
  structuredReviewSchema: StructuredTaskReviewSchema;
  generation: {
    status: "blocked";
    reason: string;
  };
};

export type TaskReviewGeneratedResponse = TaskReviewBaseResponse & {
  status: "generated";
  reason: string;
  savedRecord: TaskReviewSavedRecord;
  structuredReviewSchema: StructuredTaskReviewSchema;
  generation: {
    status: "generated";
  };
  generated: AssistantGenerateResult;
};

export type TaskReviewResponse =
  | TaskReviewBlockedResponse
  | TaskReviewReadyResponse
  | TaskReviewGeneratedResponse;
```

- [ ] **Step 3: Replace local duplicated service types**

In `src/use-cases/task-review-service.ts`, remove the file-local `StructuredTaskReviewSchema` type and import:

```ts
import type {
  EvidenceReadinessItem,
  StructuredTaskReviewSchema,
  TaskReviewMode,
  TaskReviewResponse,
  TaskReviewSavedRecord,
} from "@/domains/assistant/task-review";
```

Update `ReviewTaskInput`:

```ts
export type ReviewTaskInput = {
  taskId: string;
  question: string;
  instruction?: string;
  mode?: TaskReviewMode;
  fetchImpl?: typeof fetch;
};
```

Annotate the service return:

```ts
export async function reviewTaskWithServerOrchestrator(
  input: ReviewTaskInput,
  user: AuthUser,
): Promise<TaskReviewResponse> {
```

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/domains/assistant/types.ts src/domains/assistant/task-review.ts src/use-cases/task-review-service.ts src/app/api/assistant/task-review/route.ts
git commit -m "refactor: share task review contracts"
```

---

### Task 3: Generate From Verified Evidence With Stable Digests

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\use-cases\assistant-saas-mode-service.ts`
- Test: `D:\architect-workspace\architect-saas\npm run typecheck`

- [ ] **Step 1: Add verified generation input**

In `src/use-cases/assistant-saas-mode-service.ts`, add this type next to `GenerateAssistantInput`:

```ts
type GenerateAssistantWithEvidenceInput = {
  taskContext: {
    taskId: string;
    projectId: string;
    title: string;
    issueId: string;
  };
  question: string;
  instruction?: string;
  evidence: AssistantEvidence[];
  evidenceDigest: string;
  officialLawDigest: string;
  officialLawStatus: "not_required" | "verified" | "failed";
};
```

- [ ] **Step 2: Widen request hash input**

Replace `createRequestHash` with:

```ts
function createRequestHash(input: {
  taskId: string;
  question: string;
  instruction: string;
  evidenceIds: string[];
  evidenceDigest?: string;
  officialLawDigest?: string;
  officialLawStatus?: "not_required" | "verified" | "failed";
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
```

- [ ] **Step 3: Extract provider generation from supplied evidence**

Add this function above `generateAssistantWithSaasApi`:

```ts
export async function generateAssistantWithVerifiedEvidence(
  input: GenerateAssistantWithEvidenceInput,
  user: AuthUser,
): Promise<AssistantGenerateResult> {
  const question = normalizeRequiredText(input.question, "question");
  const instruction =
    normalizeOptionalText(input.instruction) ||
    "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변하세요.";
  const policy = await getStoredOrDefaultPolicy(input.taskContext.projectId);
  const promptText = buildPromptText({
    taskTitle: input.taskContext.title,
    question,
    instruction,
    evidence: input.evidence,
  });
  const inputTokens = estimateTokens(promptText);
  const requestHash = createRequestHash({
    taskId: input.taskContext.taskId,
    question,
    instruction,
    evidenceIds: input.evidence.map((item) => item.id),
    evidenceDigest: input.evidenceDigest,
    officialLawDigest: input.officialLawDigest,
    officialLawStatus: input.officialLawStatus,
  });

  await enforcePolicy({
    policy,
    taskId: input.taskContext.taskId,
    profileId: user.id,
    evidence: input.evidence,
    inputTokens,
    requestHash,
  });

  const taskLabel = input.taskContext.issueId || input.taskContext.taskId;
  const providerResult = await runProviderOrRecordFailure({
    policy,
    taskId: input.taskContext.taskId,
    taskLabel,
    profileId: user.id,
    question,
    instruction,
    promptText,
    evidence: input.evidence,
    inputTokens,
    requestHash,
  });

  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: input.taskContext.taskId,
    profileId: user.id,
    executionMode: "saas-api",
    runtimeMode: providerResult.callMode === "live" ? "saas-api-live-provider" : "saas-api-mock-provider",
    provider: policy.provider,
    model: policy.model,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    estimatedCostCents: providerResult.estimatedCostCents,
    status: "success",
    policyDecision: "allowed",
    requestHash,
    metadata: {
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
      evidenceDigest: input.evidenceDigest,
      officialLawDigest: input.officialLawDigest,
      officialLawStatus: input.officialLawStatus,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      ...providerResult.metadata,
    },
  });

  await assistantRepository.createAuditEvent({
    projectId: policy.projectId,
    profileId: user.id,
    eventType: "assistant.generate.success",
    targetType: "task",
    targetId: input.taskContext.taskId,
    metadata: {
      executionMode: "saas-api",
      requestHash,
      evidenceCount: input.evidence.length,
      evidenceDigest: input.evidenceDigest,
      officialLawDigest: input.officialLawDigest,
      officialLawStatus: input.officialLawStatus,
      provider: policy.provider,
      model: policy.model,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
  });

  return {
    answer: providerResult.answer,
    suggestedDraftSummary: providerResult.suggestedDraftSummary,
    citations: input.evidence.slice(0, 8).map((item) => ({
      sourceType: item.kind,
      sourceId: item.id,
      title: item.title,
    })),
    usage: {
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
    executionMode: "saas-api",
    policyDecision: "allowed",
    policy: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
    },
    provider: {
      provider: policy.provider,
      model: policy.model,
      callMode: providerResult.callMode,
      requestId: providerResult.providerRequestId,
    },
  };
}
```

- [ ] **Step 4: Keep legacy generation compiling until Task 6**

In `generateAssistantWithSaasApi`, keep the existing retrieve call and then call the helper with legacy digests:

```ts
return generateAssistantWithVerifiedEvidence(
  {
    taskContext: retrieved.taskContext,
    question,
    instruction,
    evidence: retrieved.evidence,
    evidenceDigest: createRequestHash({
      taskId: retrieved.taskContext.taskId,
      question,
      instruction,
      evidenceIds: retrieved.evidence.map((item) => item.id),
    }),
    officialLawDigest: "legacy-unverified",
    officialLawStatus: "not_required",
  },
  user,
);
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/use-cases/assistant-saas-mode-service.ts
git commit -m "refactor: generate assistant from supplied evidence"
```

---

### Task 4: Add Generate Mode, Editor Guard, And Server-Side Record Save

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\use-cases\task-review-service.ts`
- Modify: `D:\architect-workspace\architect-saas\src\app\api\assistant\task-review\route.ts`
- Modify: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`
- Test: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`

- [ ] **Step 1: Add route guard validation**

In `scripts/task-review-orchestrator-validate.ts`, add:

```ts
const taskReviewRouteSource = await readFile(
  new URL("../src/app/api/assistant/task-review/route.ts", import.meta.url),
  "utf8",
);
assert.match(taskReviewRouteSource, /requireCurrentProjectEditor/);
assert.match(taskReviewRouteSource, /mode === "generate"/);
assert.match(taskReviewRouteSource, /requireCurrentProjectAccess/);
```

- [ ] **Step 2: Add server-save validation**

Add these source checks:

```ts
const taskReviewSource = await readFile(
  new URL("../src/use-cases/task-review-service.ts", import.meta.url),
  "utf8",
);
assert.match(taskReviewSource, /candidateState:\s*"not_candidate"/);
assert.match(taskReviewSource, /assistantRepository\.createRecord/);
assert.doesNotMatch(taskReviewSource, /reviewKnowledgeCandidate/);
assert.doesNotMatch(taskReviewRouteSource, /reviewKnowledgeCandidate/);
assert.doesNotMatch(taskReviewRouteSource, /\/approve/);
```

- [ ] **Step 3: Run validation to verify it fails**

Run:

```powershell
npm run task-review:validate
```

Expected: failure mentioning `requireCurrentProjectEditor` or `candidateState`.

- [ ] **Step 4: Parse mode before project guard**

In `src/app/api/assistant/task-review/route.ts`, replace the route body with this shape:

```ts
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = await request.json();
    const mode = body.mode === "generate" ? "generate" : "preview";

    if (mode === "generate") {
      await requireCurrentProjectEditor(user);
    } else {
      await requireCurrentProjectAccess(user);
    }

    const data = await reviewTaskWithServerOrchestrator(
      {
        taskId: String(body.taskId ?? ""),
        question: String(body.question ?? ""),
        instruction: typeof body.instruction === "string" ? body.instruction : undefined,
        mode,
      },
      user,
    );

    const status = data.status === "blocked" ? 409 : data.status === "generated" ? 201 : 200;
    return NextResponse.json({ data }, { status });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 5: Add digest and readiness helpers**

In `src/use-cases/task-review-service.ts`, add imports:

```ts
import { createHash } from "node:crypto";
import type { AssistantEvidence } from "@/domains/assistant/types";
import type { AssistantGenerateResult } from "@/domains/assistant/saas-api-mode";
import { assistantRepository } from "@/repositories/assistant";
import { generateAssistantWithVerifiedEvidence } from "@/use-cases/assistant-saas-mode-service";
```

Add helpers:

```ts
function digestJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildEvidenceDigest(evidence: AssistantEvidence[]) {
  return digestJson(
    evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      excerpt: item.excerpt,
      sourceUrl: item.sourceUrl,
      recordId: item.recordId,
      confidenceWeight: item.confidenceWeight,
    })),
  );
}

function buildOfficialLawDigest(report: OfficialLawVerificationReport) {
  return digestJson({
    status: report.status,
    checkedAt: report.checkedAt,
    failures: report.failures,
    sources: report.sources.map((source) => ({
      lawName: source.lawName,
      articleLabel: source.articleLabel,
      apiUrl: source.apiUrl,
      searchApiUrl: source.searchApiUrl,
    })),
  });
}

function buildEvidenceReadiness(input: { unavailableEvidenceKinds: string[] }): EvidenceReadinessItem[] {
  const missing = new Set(input.unavailableEvidenceKinds);
  return [
    {
      kind: "central_knowledge",
      status: missing.has("central_knowledge") ? "missing" : "available",
      action: "Knowledge admin이 WIKI 후보를 승인해야 central_knowledge evidence로 재사용됩니다.",
    },
    {
      kind: "project_document",
      status: missing.has("project_document") ? "missing" : "available",
      action: "파일 업로드 후 추출 텍스트 또는 사용자 확인 요약을 저장하세요.",
    },
    {
      kind: "web_or_skill",
      status: missing.has("web_or_skill") ? "missing" : "available",
      action: "사용자 승인 외부 근거를 저장해야 web_or_skill evidence로 포함됩니다.",
    },
  ];
}
```

- [ ] **Step 6: Save generated record server-side**

Add this helper in `src/use-cases/task-review-service.ts`:

```ts
async function saveGeneratedTaskReviewRecord(input: {
  taskContext: { taskId: string; projectId: string };
  user: AuthUser;
  question: string;
  evidence: AssistantEvidence[];
  generated: AssistantGenerateResult;
  lawReport: OfficialLawVerificationReport;
  evidenceDigest: string;
  officialLawDigest: string;
}): Promise<TaskReviewSavedRecord> {
  const regulationCount = input.evidence.filter((item) => item.kind === "regulation").length;
  const confidenceScore = Math.min(95, Math.max(60, 80 + regulationCount));
  const confidenceReason =
    input.lawReport.status === "verified"
      ? "공식 법령 API 검증과 서버 task-review evidence bundle을 기준으로 생성했습니다."
      : "공식 법령 검증이 필요하지 않은 서버 task-review evidence bundle을 기준으로 생성했습니다.";
  const runtimeMode = input.generated.provider.callMode === "live" ? "task-review-live-provider" : "task-review-mock-provider";

  const record = await assistantRepository.createRecord({
    projectId: input.taskContext.projectId,
    taskId: input.taskContext.taskId,
    profileId: input.user.id,
    question: input.question,
    answer: input.generated.answer,
    evidence: input.evidence,
    confidenceScore,
    confidenceReason,
    executionMode: "saas-api",
    runtimeMode,
    draftSummary: input.generated.suggestedDraftSummary,
    candidateState: "not_candidate",
    metadata: {
      taskReview: {
        source: "assistant-task-review",
        officialLawStatus: input.lawReport.status,
        evidenceDigest: input.evidenceDigest,
        officialLawDigest: input.officialLawDigest,
        providerCallMode: input.generated.provider.callMode,
        savedByOrchestrator: true,
      },
    },
  });

  return {
    id: record.id,
    taskId: record.taskId,
    confidenceScore: record.confidenceScore,
    confidenceReason: record.confidenceReason,
    executionMode: record.executionMode,
    runtimeMode: record.runtimeMode,
    candidateState: "not_candidate",
    draftSummary: record.draftSummary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
```

- [ ] **Step 7: Add generate branch in orchestrator**

In `reviewTaskWithServerOrchestrator`, after official-law verification succeeds, build common values:

```ts
const evidenceDigest = buildEvidenceDigest(evidence);
const officialLawDigest = buildOfficialLawDigest(lawReport);
const evidenceReadiness = buildEvidenceReadiness({ unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds });
const structuredReviewSchema = buildStructuredReviewPreview(input.question, evidence, lawReport);
```

Then add the generate branch:

```ts
if ((input.mode ?? "preview") === "generate") {
  const generated = await generateAssistantWithVerifiedEvidence(
    {
      taskContext: retrieved.taskContext,
      question: input.question,
      instruction: input.instruction,
      evidence,
      evidenceDigest,
      officialLawDigest,
      officialLawStatus: lawReport.status,
    },
    user,
  );
  const savedRecord = await saveGeneratedTaskReviewRecord({
    taskContext: retrieved.taskContext,
    user,
    question: input.question,
    evidence,
    generated,
    lawReport,
    evidenceDigest,
    officialLawDigest,
  });

  return {
    status: "generated" as const,
    reason: "Official law verification succeeded; generation and record save used the server verified evidence bundle.",
    taskContext: retrieved.taskContext,
    retrievedEvidence: {
      count: retrieved.evidence.length,
      regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
      unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
    },
    officialLawVerification: lawReport,
    evidence,
    evidenceReadiness,
    structuredReviewSchema,
    generation: { status: "generated" as const },
    generated,
    savedRecord,
    wiki: {
      candidateCreated: false,
      approvalAttempted: false,
      approvedKnowledgeItemId: null,
      reason: "Task-review saved the record as not_candidate. WIKI approval remains a separate Knowledge admin action.",
    },
  };
}
```

Add `evidenceReadiness` to existing blocked and ready responses. Keep `savedRecord: null` in blocked and ready responses.

- [ ] **Step 8: Run validation and typecheck**

Run:

```powershell
npm run task-review:validate
npm run typecheck
```

Expected: both pass.

- [ ] **Step 9: Commit**

```powershell
git add src/use-cases/task-review-service.ts src/app/api/assistant/task-review/route.ts scripts/task-review-orchestrator-validate.ts
git commit -m "feat: generate and save task reviews server-side"
```

---

### Task 5: Wire SaaS UI To Task Review Without Duplicate Retrieve

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-panel.tsx`
- Test: `D:\architect-workspace\architect-saas\npm run typecheck`

- [ ] **Step 1: Extend client types**

In `src/components/tasks/task-assistant-panel.tsx`, extend `SavedAssistantRecord`:

```ts
type SavedAssistantRecord = {
  id: string;
  taskId?: string;
  confidenceScore: number;
  confidenceReason?: string;
  executionMode?: "local-chatgpt-codex" | "mock" | "unavailable" | "saas-api";
  runtimeMode?: string;
  candidateState?: "candidate" | "not_candidate" | "pending_review" | "approved" | "rejected";
  draftSummary?: DraftSummary | null;
  createdAt?: string;
  updatedAt?: string;
};
```

Add `TaskReviewResponse` near `AssistantGenerateResponse`:

```ts
type TaskReviewResponse = {
  status: "blocked" | "ready_for_generation" | "generated";
  reason: string;
  taskContext: AssistantTaskContext;
  retrievedEvidence: {
    count: number;
    regulationCount: number;
    unavailableEvidenceKinds: string[];
  };
  officialLawVerification: {
    status: "not_required" | "verified" | "failed";
    checkedAt: string;
    failures: string[];
    retry: string[];
  };
  evidence: AssistantEvidence[];
  evidenceReadiness: Array<{
    kind: "central_knowledge" | "project_document" | "web_or_skill";
    status: "available" | "missing";
    action: string;
  }>;
  generated?: AssistantGenerateResponse;
  savedRecord: SavedAssistantRecord | null;
  wiki: {
    candidateCreated: false;
    approvalAttempted: false;
    approvedKnowledgeItemId: null;
    reason?: string;
  };
};
```

- [ ] **Step 2: Add task-review POST helper that preserves 409 data**

Add this helper below `postJson`:

```ts
async function postTaskReviewJson(body: { taskId: string; question: string; instruction: string; mode: "generate" }): Promise<TaskReviewResponse> {
  const response = await fetch("/api/assistant/task-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { data?: TaskReviewResponse; error?: { message?: string } };
  if (!response.ok && response.status !== 409) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }
  if (!parsed.data) {
    throw new Error(parsed.error?.message ?? "task-review 응답이 비어 있습니다.");
  }

  return parsed.data;
}
```

- [ ] **Step 3: Replace SaaS branch before retrieve**

In `runAssistantReview`, insert this branch before the existing `/api/assistant/retrieve` call:

```ts
if (executionMode === "saas-api") {
  const review = await postTaskReviewJson({
    taskId: selectedTask.id,
    question,
    instruction,
    mode: "generate",
  });

  setRetrieveResult({
    taskContext: review.taskContext,
    evidence: review.evidence,
    unavailableEvidenceKinds: review.retrievedEvidence.unavailableEvidenceKinds,
  });

  if (review.status !== "generated" || !review.generated || !review.savedRecord) {
    const failures = review.officialLawVerification.failures.join(" / ");
    const readiness = review.evidenceReadiness
      .filter((item) => item.status === "missing")
      .map((item) => `${item.kind}: ${item.action}`)
      .join(" / ");
    throw new Error([failures || review.reason, readiness].filter(Boolean).join(" / "));
  }

  const generatedOutput: AssistantOutput = {
    answer: [
      review.generated.answer,
      "",
      `SaaS API mode: ${review.generated.provider.callMode} ${review.generated.provider.provider}/${review.generated.provider.model}`,
      `Usage: input ${review.generated.usage.inputTokens}, output ${review.generated.usage.outputTokens}, estimated ${review.generated.usage.estimatedCostCents} cents.`,
    ].join("\n"),
    draftSummary: review.generated.suggestedDraftSummary,
  };

  setOutput(generatedOutput);
  setSummaryDraft(generatedOutput.draftSummary);
  setSummaryTagsInput(generatedOutput.draftSummary.tags.join(", "));
  setClosureAcknowledged(false);
  setRecord(review.savedRecord);
  await refreshAssistantRecords(review.taskContext.taskId);
  setStatus(`공식 법규 검증 경유 SaaS API 검토 의견을 저장했습니다. 신뢰도 ${review.savedRecord.confidenceScore}%.`);
  return;
}
```

Keep the existing `/api/assistant/retrieve` path only for `local-codex` and `mock`.

- [ ] **Step 4: Remove old SaaS generate helper use**

Delete `generateSaasApiReview`. The `runAssistantReview` path must not call `/api/assistant/generate` for `executionMode === "saas-api"`.

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/tasks/task-assistant-panel.tsx
git commit -m "feat: route saas task reviews through orchestrator"
```

---

### Task 6: Block Legacy Legal Generation Bypass

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\use-cases\assistant-saas-mode-service.ts`
- Modify: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`
- Test: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`

- [ ] **Step 1: Add legacy bypass validation**

In `scripts/task-review-orchestrator-validate.ts`, add:

```ts
const saasServiceSource = await readFile(
  new URL("../src/use-cases/assistant-saas-mode-service.ts", import.meta.url),
  "utf8",
);
assert.match(saasServiceSource, /ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW/);
assert.match(saasServiceSource, /item\.kind === "regulation"/);
```

- [ ] **Step 2: Run validation to verify it fails**

Run:

```powershell
npm run task-review:validate
```

Expected: failure mentioning `ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW`.

- [ ] **Step 3: Block regulation evidence in legacy generate**

In `src/use-cases/assistant-saas-mode-service.ts`, add `conflict` to the existing error import:

```ts
import { badRequest, conflict, forbidden, notFound, serviceUnavailable } from "@/lib/api/errors";
```

In `generateAssistantWithSaasApi`, immediately after `const retrieved = await retrieveAssistantEvidence({ taskId, question });`, add:

```ts
if (retrieved.evidence.some((item) => item.kind === "regulation")) {
  throw conflict(
    "Legal/regulation SaaS generation must use /api/assistant/task-review so official-law verification runs server-side.",
    "ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW",
  );
}
```

- [ ] **Step 4: Run validation and typecheck**

Run:

```powershell
npm run task-review:validate
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/use-cases/assistant-saas-mode-service.ts scripts/task-review-orchestrator-validate.ts
git commit -m "fix: block legacy legal assistant generation"
```

---

### Task 7: Reduce Official-Law API Latency Deterministically

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\domains\legal\official-law-api.ts`
- Modify: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`
- Test: `D:\architect-workspace\architect-saas\scripts\task-review-orchestrator-validate.ts`

- [ ] **Step 1: Add deterministic parallel validation**

In `scripts/task-review-orchestrator-validate.ts`, add a second regulation evidence item and a concurrency-counting fetch wrapper:

```ts
const multiLocatorEvidence: AssistantEvidence[] = [
  ...regulationEvidence,
  {
    id: "regulation:parking",
    kind: "regulation",
    priority: 2,
    title: "주차장법 시행규칙 제6조",
    excerpt: "주차장법 시행규칙 제6조 설치 기준 검토 seed",
    confidenceWeight: 0.7,
  },
];

let inFlight = 0;
let maxConcurrent = 0;
const concurrentFetch: typeof fetch = async (input, init) => {
  inFlight += 1;
  maxConcurrent = Math.max(maxConcurrent, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 20));
  try {
    return await fetchImpl(input, init);
  } finally {
    inFlight -= 1;
  }
};

await verifyOfficialLawEvidence({
  question: "건축법 제49조와 주차장법 시행규칙 제6조 검토",
  evidence: multiLocatorEvidence,
  oc: "server-secret-oc",
  fetchImpl: concurrentFetch,
  now: () => new Date("2026-05-29T00:00:00.000Z"),
});
assert.ok(maxConcurrent >= 2, "official law locators should be verified concurrently");
```

Adjust the existing mocked `fetchImpl` so it returns valid search/service responses for both `건축법` and `주차장법 시행규칙`.

- [ ] **Step 2: Run validation to verify it fails**

Run:

```powershell
npm run task-review:validate
```

Expected: failure on `official law locators should be verified concurrently`.

- [ ] **Step 3: Parallelize locator calls**

In `src/domains/legal/official-law-api.ts`, replace:

```ts
const sources: OfficialLawApiSource[] = [];
for (const locator of locators) {
  sources.push(await fetchOfficialLawArticle(locator, config, checkedAt));
}
```

with:

```ts
const sources = await Promise.all(
  locators.map((locator) => fetchOfficialLawArticle(locator, config, checkedAt)),
);
```

- [ ] **Step 4: Run validation and typecheck**

Run:

```powershell
npm run task-review:validate
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/domains/legal/official-law-api.ts scripts/task-review-orchestrator-validate.ts
git commit -m "perf: verify official law locators concurrently"
```

---

### Task 8: Add Direct Service Smoke Script

**Files:**
- Create: `D:\architect-workspace\architect-saas\scripts\task-review-service-smoke.ps1`
- Modify: `D:\architect-workspace\architect-saas\package.json`
- Test: `D:\architect-workspace\architect-saas\npm run task-review:smoke`

- [ ] **Step 1: Create smoke script with optional admin check**

Create `scripts/task-review-service-smoke.ps1` with:

```powershell
param(
  [string]$Origin = "http://localhost:3000",
  [string]$TaskId = "task_3bogoi8b",
  [string]$Question = "공동주택 단지내 도로 경사도 검토: 주택건설기준 등에 관한 규칙 제6조의2 기준으로 확인"
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param([string]$Path, [string]$Method = "GET", [object]$Body = $null)
  $headers = @{ Accept = "application/json" }
  if ($Method -ne "GET") {
    $headers["Origin"] = $Origin
    $headers["Content-Type"] = "application/json"
  }
  $bodyJson = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 20 } else { $null }
  $response = Invoke-WebRequest -Uri "$Origin$Path" -Method $Method -Headers $headers -Body $bodyJson -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30
  $content = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
  return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Json = $content }
}

function Get-CandidateCount {
  $response = Invoke-Json -Path "/api/admin/knowledge/candidates"
  if ($response.StatusCode -eq 200) { return @($response.Json.data).Count }
  return $null
}

$auth = Invoke-Json -Path "/api/auth/me"
if ($auth.StatusCode -ne 200) { throw "auth expected 200, got $($auth.StatusCode)" }
$candidateCountBefore = Get-CandidateCount

$retrieve = Invoke-Json -Path "/api/assistant/retrieve" -Method "POST" -Body @{ taskId = $TaskId; question = $Question }
if ($retrieve.StatusCode -ne 200) { throw "retrieve expected 200, got $($retrieve.StatusCode)" }

$recordsBefore = Invoke-Json -Path "/api/assistant/records?taskId=$TaskId"
if ($recordsBefore.StatusCode -ne 200) { throw "records before expected 200, got $($recordsBefore.StatusCode)" }
$recordCountBefore = @($recordsBefore.Json.data).Count

$review = Invoke-Json -Path "/api/assistant/task-review" -Method "POST" -Body @{ taskId = $TaskId; question = $Question; mode = "preview" }
if ($review.StatusCode -notin @(200, 409)) { throw "task-review expected 200 or 409, got $($review.StatusCode)" }
if ($review.Json.data.wiki.approvalAttempted -ne $false) { throw "task-review must not attempt WIKI approval" }
if ($review.Json.data.wiki.candidateCreated -ne $false) { throw "task-review must not create a WIKI candidate during preview" }

$recordsAfter = Invoke-Json -Path "/api/assistant/records?taskId=$TaskId"
if ($recordsAfter.StatusCode -ne 200) { throw "records after expected 200, got $($recordsAfter.StatusCode)" }
$recordCountAfter = @($recordsAfter.Json.data).Count
if ($recordCountBefore -ne $recordCountAfter) {
  throw "record count changed from $recordCountBefore to $recordCountAfter during preview"
}

$candidateCountAfter = Get-CandidateCount
if ($null -ne $candidateCountBefore -and $null -ne $candidateCountAfter -and $candidateCountBefore -ne $candidateCountAfter) {
  throw "knowledge candidate count changed from $candidateCountBefore to $candidateCountAfter"
}

[pscustomobject]@{
  status = "passed"
  auth = $auth.StatusCode
  retrieveEvidenceCount = @($retrieve.Json.data.evidence).Count
  taskReviewStatusCode = $review.StatusCode
  taskReviewStatus = $review.Json.data.status
  taskReviewLawStatus = $review.Json.data.officialLawVerification.status
  approvalAttempted = $review.Json.data.wiki.approvalAttempted
  candidateCreated = $review.Json.data.wiki.candidateCreated
  recordCountBefore = $recordCountBefore
  recordCountAfter = $recordCountAfter
  candidateCountBefore = $candidateCountBefore
  candidateCountAfter = $candidateCountAfter
  adminCandidateCheck = if ($null -eq $candidateCountBefore -or $null -eq $candidateCountAfter) { "skipped" } else { "checked" }
} | ConvertTo-Json -Depth 8
```

- [ ] **Step 2: Add npm script**

In `package.json`, add:

```json
"task-review:smoke": "powershell -ExecutionPolicy Bypass -File scripts/task-review-service-smoke.ps1"
```

- [ ] **Step 3: Run smoke against local dev server**

Run with `npm run dev` already serving `http://localhost:3000`:

```powershell
npm run task-review:smoke
```

Expected:
- Output has `"status":"passed"`.
- `taskReviewStatusCode` is `409` when `LAW_OPEN_DATA_OC` is absent.
- `approvalAttempted` is `false`.
- `candidateCreated` is `false`.
- `recordCountBefore` equals `recordCountAfter`.
- `adminCandidateCheck` is either `checked` with unchanged counts or `skipped`.

- [ ] **Step 4: Commit**

```powershell
git add scripts/task-review-service-smoke.ps1 package.json
git commit -m "test: add task review service smoke check"
```

---

### Task 9: Runtime UI And Network Verification Gate

**Files:**
- No source edits unless Browser console reproduces a component-specific runtime error.
- Verify: Browser app against `http://localhost:3000/board`.

- [ ] **Step 1: Clear stale dev logs**

Run:

```powershell
Set-Content .\.codex-dev-server-restart.err.log ""
Set-Content .\.codex-dev-server-restart.out.log ""
```

Expected: both files become empty.

- [ ] **Step 2: Open the service with Browser**

Use the Browser plugin to open:

```text
http://localhost:3000/board
```

Expected:
- Board page loads.
- Assistant panel opens.
- No new `Rendered more hooks than during the previous render` appears in `.codex-dev-server-restart.err.log`.

- [ ] **Step 3: Verify SaaS task-review blocked path**

In Browser:
- Select SaaS API mode.
- Select `task_3bogoi8b`.
- Run `근거 조회 + 의견 생성` with no `LAW_OPEN_DATA_OC` configured.

Expected:
- Network shows one `POST /api/assistant/task-review`.
- Network shows zero `POST /api/assistant/retrieve`.
- Network shows zero `POST /api/assistant/generate`.
- Network shows zero `POST /api/assistant/records`.
- UI shows the `LAW_OPEN_DATA_OC` blocker.
- Evidence panel contains the retrieved evidence from task-review response.

- [ ] **Step 4: If a hook error reproduces, identify the component**

Use Browser console details and search the named component:

```powershell
rg "function TaskAssistantPanel|const TaskAssistantPanel|export default function TaskAssistantPanel|function BoardPage|export default function BoardPage" .\src -n
```

Expected: the stack points to one exact component file.

- [ ] **Step 5: Fix hook order only when a stack names a component**

Move all React hooks above conditional returns in the identified component. For a `TaskAssistantPanel`-style component, the corrected shape is:

```tsx
function TaskAssistantPanel(props: TaskAssistantPanelProps) {
  const first = useMemo(() => computeFirst(props), [props]);
  const [state, setState] = useState("");
  useEffect(() => {
    setState(first);
  }, [first]);

  if (!props.visible) {
    return null;
  }

  return <section>{state}</section>;
}
```

The forbidden shape is:

```tsx
function TaskAssistantPanel(props: TaskAssistantPanelProps) {
  if (!props.visible) {
    return null;
  }

  const [state] = useState("");
  return <section>{state}</section>;
}
```

- [ ] **Step 6: Run verification**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
npm run task-review:smoke
```

Expected: all pass.

- [ ] **Step 7: Commit only when source changed**

When a source fix was made:

```powershell
git add src/components/tasks/task-assistant-panel.tsx src/app/board/page.tsx
git commit -m "fix: clear task review runtime ui blocker"
```

When no source fix was made, do not create a Task 9 commit. Record the Browser result in Task 10 worklog.

---

### Task 10: Final Worklog And Release Gate

**Files:**
- Create: `D:\architect-workspace\architect-saas\docs\worklogs\2026-05-29-task-review-bottleneck-removal.md`

- [ ] **Step 1: Create worklog**

Create the worklog with this content:

```md
Req: Remove task-review unimplemented gaps and bottlenecks after direct service verification.
Diff: Documented LAW_OPEN_DATA_OC, routed legal/regulation SaaS generation through server-side task-review, generated from verified official-law evidence, saved generated records server-side as not_candidate, blocked the legacy legal generate bypass, parallelized official-law locator checks, surfaced evidence readiness, and added validation/smoke gates.
Why: The service previously stopped correctly on missing official-law credentials, but generation was not wired end-to-end through the server verifier, the UI could duplicate retrieval, record persistence could trust browser evidence, and verification had latency/runtime gaps.
Verify/Time: 2026-05-29 KST. `npm run typecheck`, `npm run lint`, `npm run task-review:validate`, `npm run task-review:smoke`, and `npm run build` passed. Browser smoke on `/board` confirmed one task-review POST, zero retrieve/generate/records POSTs for the blocked SaaS path, visible LAW_OPEN_DATA_OC blocker, and no new hook-order runtime error.
```

- [ ] **Step 2: Run full release gate**

Run:

```powershell
npm run typecheck
npm run lint
npm run task-review:validate
npm run task-review:smoke
npm run build
```

Expected: all pass.

- [ ] **Step 3: Confirm route behavior without `LAW_OPEN_DATA_OC`**

Run:

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/assistant/task-review -Method POST -Headers @{Origin='http://localhost:3000'; 'Content-Type'='application/json'} -Body '{"taskId":"task_3bogoi8b","question":"공동주택 단지내 도로 경사도 검토","mode":"preview"}' -UseBasicParsing -SkipHttpErrorCheck | Select-Object StatusCode,Content
```

Expected:
- Status code `409`.
- Body contains `LAW_OPEN_DATA_OC`.
- Body contains `"approvalAttempted":false`.
- Body contains `"candidateCreated":false`.

- [ ] **Step 4: Confirm no accidental WIKI approval references**

Run:

```powershell
rg "reviewKnowledgeCandidate|/approve|requireKnowledgeAdmin" .\src\app\api\assistant\task-review .\src\use-cases\task-review-service.ts -n
```

Expected: no matches.

- [ ] **Step 5: Confirm task-review uses server persistence**

Run:

```powershell
rg "candidateState:\s*\"not_candidate\"|assistantRepository\.createRecord|savedByOrchestrator" .\src\use-cases\task-review-service.ts -n
```

Expected:
- Match for `candidateState: "not_candidate"`.
- Match for `assistantRepository.createRecord`.
- Match for `savedByOrchestrator`.

- [ ] **Step 6: Commit**

```powershell
git add docs/worklogs/2026-05-29-task-review-bottleneck-removal.md
git commit -m "docs: record guarded task review release gate"
```

- [ ] **Step 7: Final whole-branch review**

Dispatch a fresh final reviewer with:

```text
Review TASK 0 through TASK 10 as one branch.
Check auth parity, official-law secret handling, OC redaction, server-side record persistence, no legacy legal generation bypass, no WIKI approval calls, UI network behavior, and release gate output.
Return only blocking or important findings with file/line references.
```

Expected: final reviewer reports no blocking findings.

---

## Self-Review

Spec coverage:
- Official-law credential blocker: Task 1.
- Server-side verified generation and digesting: Tasks 3 and 4.
- Generate editor guard: Task 4.
- Server-side verified record persistence: Task 4.
- UI blocked response handling and duplicate retrieve removal: Task 5.
- Legacy legal generation bypass removal: Task 6.
- Official-law latency bottleneck: Task 7.
- Direct service verification with optional admin count check: Task 8.
- Runtime UI hook/log/network risk: Task 9.
- Release gate, worklog, and final review: Task 10.

Placeholder scan:
- No banned placeholder tokens, broad multi-root `git add` pathspec, or unspecified test steps remain.

Type consistency:
- `TaskReviewResponse`, `TaskReviewSavedRecord`, `EvidenceReadinessItem`, `StructuredTaskReviewSchema`, `TaskReviewMode`, and `AssistantGenerateResult` are introduced once and reused by service, route, and UI.
- `approvalAttempted` remains boolean `false` in every task-review response.
- `candidateCreated` remains boolean `false` in every task-review response.
- `savedRecord` is `null` for blocked/ready responses and non-null only for generated responses.
- Generated records use `candidateState: "not_candidate"` and include `metadata.taskReview.savedByOrchestrator: true`.

Execution mode:
- Selected: `superpowers:subagent-driven-development`.
- Execution is sequential by task with fresh implementer/fix/reviewer subagents.
- Reviewers receive real diffs, touched file lists, command output, and common invariants.
- Task 9 creates no commit when Browser verification finds no source defect.
