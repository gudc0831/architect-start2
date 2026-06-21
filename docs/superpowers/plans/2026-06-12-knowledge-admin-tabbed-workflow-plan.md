# Knowledge WIKI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/admin/knowledge` so admins can clearly separate `자동 발굴 요청`, `AI 검토 WIKI 후보`, `로컬 WIKI 가져오기`, and `승인 WIKI`, with URL-restorable navigation and server-verified candidate/import/approval state transitions.

**Architecture:** Phase 1 is a UI/navigation refactor only and must not change DB/API/schema/auth guards. Phase 2 adds the data/API/RBAC/audit foundation required by discovery and local import. Phase 3 connects discovery and local import to real candidate creation, and Phase 4 closes with authenticated Preview browser proof plus operational validators.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS Modules, Prisma/PostgreSQL, existing assistant repository and audit event patterns, PowerShell-friendly npm/tsx validation scripts.

**Current Closeout Status (2026-06-12 KST):** Phase 1-4 are complete. Guarded cloud backup `cloud-2026-06-12T13-52-39-014Z-a21d39a3` was created, Preview DB migration `20260612170000_knowledge_wiki_simplification` was applied with `npm run db:migrate:safe`, Preview deployment `dpl_DzWXCU7e6mv38D23LJvdqtxjbWh5` reached READY at `https://architect-start2-lysxnfu2u-chois-projects-7b2948cf.vercel.app`, and `npm run knowledge-wiki:preview-smoke` passed against that canonical Preview URL.

---

## Canonical IA Decision

The canonical top-level tabs are:

1. `후보 관리`
2. `승인 WIKI`
3. `로컬 WIKI 가져오기`
4. `운영 점검`

`내보내기/동기화` is not a top-level tab. It is an auxiliary surface inside `승인 WIKI`.

After approving a candidate, the closeout actions remain on the same candidate screen:

- `승인 WIKI에서 보기`: navigates to `?work=approved&approvedId=<approved-id>`.
- `내보내기`: navigates to `?work=approved&approvedId=<approved-id>&approvedFocus=export_sync` and focuses the `승인 WIKI` export/sync auxiliary surface.
- `복사`: copies the approved Markdown or approval handoff package, never a draft candidate package.

The canonical candidate detail flow is three steps:

1. `근거 확인`
2. `초안 다듬기`
3. `승인 결정`

`개요` is not a tab. It is a fixed summary band above the three candidate steps. It shows title, source badge, project/task, candidate state, confidence, warning count, and recommended next action.

`품질 점검` is not a tab. It is a warning/blocker panel inside `승인 결정`, ordered with unresolved and warning items before passing items.

## Phase Boundary

This plan intentionally separates UI refactor from data-contract work.

### Phase 1: UI And URL Navigation Only

Phase 1 may change only the tab structure, URL query parsing/serialization, client layout, user guide, and characterization validators.

Phase 1 constraint:

- Do not change database schema.
- Do not add new server APIs.
- Do not change auth guard semantics.
- Do not change provider execution semantics.
- Do not create real discovery requests, import previews, or rubrics.

This constraint applies only to Phase 1. It is not a goal-wide constraint.

### Phase 2: Data, API, RBAC, And Audit Foundation

Phase 2 adds the persisted data and server contracts needed by the full WIKI simplification design.

Phase 2 must add:

- `knowledge_discovery_requests`
- `knowledge_import_previews`
- `knowledge_import_rubrics`
- migration
- discovery promotion API
- import preview confirm/import API
- rubric CRUD/activate/rollback API
- RBAC capabilities
- append-only audit events
- central knowledge exclusion tests

### Phase 3: Product Flow Integration

Phase 3 connects scheduled discovery and local WIKI import to real `AI 검토 WIKI 후보` creation.

Discovery/import confirmation can create candidates only in `pending_review`. They must never create `approved` records or reusable `central_knowledge` directly.

### Phase 4: Preview And Operational Closeout

Phase 4 proves the full flow on the real authenticated Preview surface and records verification evidence in the worklog.

## Execution Order And Gate Rules

Implementation must follow this order:

| Order | Phase | Rule | Gate |
| --- | --- | --- | --- |
| 1 | Phase 1 | Implement IA, query sync, dirty-draft guard, placeholder, guide, and worklog only. | `knowledge-admin:tabs:validate`, `typecheck`, local browser smoke. |
| 2 | Phase 2 | Add schema, migration, RBAC, workflow constants, services, APIs, audit, and data validators. | data contract, secret fixtures, central exclusion, Prisma, migration, Vercel build gates. |
| 3 | Phase 3 | Connect discovery scan/promotion and local import UI to Phase 2 APIs. | discovery scan validator, central exclusion, local import validation. |
| 4 | Phase 4 | Run full local gates and authenticated Preview smoke, then update worklog. | all validators plus `knowledge-wiki:preview-smoke`. |

Validator registration rule:

- Register a package script in the same task that creates the validator file.
- Do not add a green-gate command for a script before that script exists and is registered.
- If a placeholder validator is ever used, it must fail with a clear `Phase N not implemented` message and must not be part of a passing gate.

Security gate rule:

- Every new mutation route must call `assertRequestIntegrity`, `requireKnowledgeAdmin`, and exact `assertKnowledgeCapability`.
- Discovery and import-preview routes are project-scoped and must also call `requireCurrentProjectAccess(user)` before returning or mutating project/task data.
- Rubric routes are organization-level admin routes and must not expose preview item bodies or raw local source data.
- Every mutation service must re-check existence, project/task ownership, current state, and allowed transition.
- URL query values are never trusted for mutation authority.

## API Target And Capability Matrix

| API | Method | Capability | Mutation Result |
| --- | --- | --- | --- |
| `/api/admin/knowledge/discovery-requests` | `GET` | admin access + current project access | List visible discovery requests only. |
| `/api/admin/knowledge/discovery-requests` | `POST` | `knowledge.discovery.scan` + current project access | Create/update discovery request records only. |
| `/api/admin/knowledge/discovery-requests/scan` | `POST` | `knowledge.discovery.scan` + current project access | Create/refresh discovery requests only. |
| `/api/admin/knowledge/discovery-requests/[requestId]/promote` | `POST` | `knowledge.discovery.promote` + current project access | Create one `pending_review` candidate and mark request promoted. |
| `/api/admin/knowledge/discovery-requests/[requestId]/dismiss` | `POST` | `knowledge.discovery.dismiss` + current project access | Mark request dismissed only. |
| `/api/admin/knowledge/import-previews` | `GET` | admin access + current project access | List visible import previews only. |
| `/api/admin/knowledge/import-previews` | `POST` | `knowledge.import.preview` + current project access | Create preview only; no candidates. |
| `/api/admin/knowledge/import-previews/[previewId]/confirm` | `POST` | `knowledge.import.confirm` + current project access | Confirm preview only; no candidates. |
| `/api/admin/knowledge/import-previews/[previewId]/import` | `POST` | `knowledge.import.confirm` + current project access | Create only `pending_review` candidates and mark preview imported. |
| `/api/admin/knowledge/rubrics` | `GET` | admin access | List active and archived rubric metadata. |
| `/api/admin/knowledge/rubrics` | `POST` | `knowledge.rubric.manage` | Create/update draft rubric. |
| `/api/admin/knowledge/rubrics/[rubricId]/activate` | `POST` | `knowledge.rubric.activate` | Activate draft and archive prior active rubric. |
| `/api/admin/knowledge/rubrics/[rubricId]/rollback` | `POST` | `knowledge.rubric.activate` | Restore archived rubric as active and append rollback audit. |

## Terminology Contract

Use these labels consistently in UI, docs, validators, and tests:

| Concept | Label | Meaning |
| --- | --- | --- |
| Top-level tab | `후보 관리` | Holds existing AI review candidates and future discovery request review. |
| Top-level tab | `승인 WIKI` | Readback, search, copy, and export/sync for approved knowledge. |
| Top-level tab | `로컬 WIKI 가져오기` | Local WIKI scan, balanced selection preview, rubric display/edit entry. |
| Top-level tab | `운영 점검` | Provider, legal monitor, file chunk/debug, governance, worker health. |
| Candidate source | `사용자 AI 검토` | Candidate originated from user-triggered AI task review. |
| Candidate source | `자동 발굴 승격` | Candidate originated from a promoted discovery request. |
| Candidate source | `로컬 가져오기` | Candidate originated from confirmed local import preview. |
| Candidate source | `법규 가져오기` | Candidate originated from verified legal evidence import. |
| Candidate state | `SaaS 검토 대기` | `pending_review`; reviewable but not approved. |
| Destination | `승인 WIKI` | The only surface reusable as `central_knowledge`. |

Do not store `candidateState` in metadata. `AssistantTaskRecord.candidateState` remains the state column. Provenance belongs in typed metadata:

```ts
export type KnowledgeCandidateSource =
  | { type: "user_ai_review"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "discovery_request"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "local_wiki_import"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "verified_legal_import"; refId: string; sourceDigest: string; importedAt: string };

export type KnowledgeCandidateMetadata = {
  knowledgeCandidateSource?: KnowledgeCandidateSource;
};
```

## URL Query Contract

Canonical URL query keys:

```ts
type KnowledgeWorkTab = "candidates" | "approved" | "local_import" | "operations";
type KnowledgeCandidateTab = "evidence" | "draft" | "decision";
type KnowledgeApprovedFocus = "readback" | "export_sync";
type KnowledgeApprovedSyncTarget = "portable_archive" | "obsidian" | "notion" | "assistant_retrieval";

type KnowledgeAdminNavigation = {
  work: KnowledgeWorkTab;
  candidateTab: KnowledgeCandidateTab;
  candidateId: string;
  approvedId: string;
  approvedFocus: KnowledgeApprovedFocus;
  approvedSyncTarget: KnowledgeApprovedSyncTarget;
  discoveryId: string;
  importPreviewId: string;
  rubricId: string;
};
```

Accepted examples:

```text
/admin/knowledge
/admin/knowledge?work=candidates&candidateTab=evidence&candidateId=<candidate-id>
/admin/knowledge?work=candidates&discoveryId=<discovery-request-id>
/admin/knowledge?work=approved&approvedId=<approved-id>
/admin/knowledge?work=approved&approvedId=<approved-id>&approvedFocus=export_sync&approvedSyncTarget=obsidian
/admin/knowledge?work=local_import&importPreviewId=<preview-id>&rubricId=<rubric-id>
/admin/knowledge?work=operations
```

Rules:

- Invalid `work` falls back to `candidates`.
- Invalid `candidateTab` falls back to `evidence`.
- Invalid `approvedFocus` falls back to `readback`.
- Invalid `approvedSyncTarget` falls back to `portable_archive`.
- Invalid or missing IDs are removed from the URL after the relevant list/fetch proves they do not exist.
- URL IDs are navigation hints only.
- URL values must never authorize discovery promotion, import confirmation, rubric activation, rollback, rejection, or approval.
- Every mutation must re-check auth, existence, ownership/project boundary, current state, and allowed transition on the server.
- User-initiated tab, candidate, approved item, and approved export focus navigation uses `router.push` so browser Back/Forward works.
- Invalid-id cleanup and user-cancelled dirty-draft restoration uses `router.replace` so broken URLs do not pollute history.
- Draft body, rejection text, confirmation phrases, search terms, credentials, secret refs, and raw local file paths are never serialized into the URL.

## File Structure

### Phase 1 Files

- Modify: `src/components/admin/knowledge-admin-tabs.ts`
  - Owns canonical tab ids, labels, query parsing, query serialization, and DOM id helpers.
- Modify: `src/app/admin/knowledge/page.tsx`
  - Parses `searchParams` and passes `initialNavigation` into `KnowledgeAdminShell`.
- Create: `src/components/admin/use-knowledge-admin-navigation.ts`
  - Owns URL sync, `router.push`/`router.replace` policy, Back/Forward reconciliation, approved export focus, and dirty-draft candidate-change guard.
- Create: `src/components/admin/knowledge-local-import-placeholder-panel.tsx`
  - Renders the Phase 1 non-mutating `로컬 WIKI 가져오기` panel with no scanning, no raw paths, and a clear Phase 2 boundary.
- Create: `src/components/admin/knowledge-approved-export-sync-panel.tsx`
  - Moves approved WIKI export/sync controls out of the top-level tab model while keeping existing APIs.
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
  - Renders canonical top-level tabs, delegates navigation to `useKnowledgeAdminNavigation`, renders three candidate steps, fixed candidate summary, approved WIKI readback plus export/sync auxiliary surface, local import placeholder, and operations panel.
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
  - Styles canonical tabs, summary band, warning-first decision panel, approved auxiliary surface, mobile horizontal tab scrolling, and focus-visible states.
- Modify: `scripts/knowledge-admin-tabs-validate.ts`
  - Updates static checks to canonical labels/query keys and three-step candidate flow.
- Modify: `사용자 가이드.md`
  - Documents canonical IA, URL query behavior, and Phase 1/Phase 2 boundary.
- Create or update: `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md`
  - Records implementation, validation, and residual Phase 2/3/4 items in the compact repo format.

### Phase 2 Files

- Modify: `prisma/schema.prisma`
  - Adds `KnowledgeDiscoveryRequest`, `KnowledgeImportPreview`, and `KnowledgeImportRubric`.
- Create: `prisma/migrations/20260612170000_knowledge_wiki_simplification/migration.sql`
  - Adds tables, indexes, constraints, and state-check constraints.
- Modify: `src/lib/auth/knowledge-guards.ts`
  - Adds explicit capabilities for discovery, import, and rubric actions.
- Create: `src/domains/admin/knowledge-workflow.ts`
  - Owns typed states, transition guards, provenance types, and audit event names.
- Modify: `src/domains/assistant/types.ts`
  - Adds typed `metadata.knowledgeCandidateSource` provenance.
- Create: `src/use-cases/admin/knowledge-discovery-service.ts`
  - Lists, dismisses, marks stale, and promotes discovery requests.
- Create: `src/use-cases/admin/knowledge-import-preview-service.ts`
  - Creates import previews, applies secret blockers, confirms previews, and imports candidates.
- Create: `src/use-cases/admin/knowledge-rubric-service.ts`
  - Manages rubric drafts, activation, archive, rollback, and active-rubric lookup.
- Modify: `src/use-cases/admin/knowledge-service.ts`
  - Validates provenance on approval and keeps approved WIKI/export behavior scoped to approved records.
- Modify: `src/repositories/assistant/contracts.ts`, `src/repositories/assistant/postgres-store.ts`, and `src/repositories/assistant/local-store.ts`
  - Keep existing assistant record/audit contracts for approval/rejection and central knowledge exclusion.
  - Discovery/import/rubric services may use direct Prisma transactions where the assistant repository has no transaction boundary, but state mutation, candidate creation, and audit append must still be atomic.
- Create: `src/app/api/admin/knowledge/discovery-requests/route.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/[requestId]/promote/route.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/[requestId]/dismiss/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/[previewId]/confirm/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/[previewId]/import/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/[rubricId]/activate/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/[rubricId]/rollback/route.ts`
- Create: `scripts/knowledge-wiki-data-contract-validate.ts`
- Create: `scripts/knowledge-local-import-secret-fixtures-validate.ts`
- Create: `scripts/knowledge-central-exclusion-validate.ts`
- Create: `scripts/knowledge-wiki-security-validate.ts`
- Modify: `package.json`
  - Registers Phase 2 validators only after their files exist.

### Phase 3 Files

- Modify: `src/components/admin/knowledge-admin-shell.tsx`
  - Connects discovery and import preview panels to Phase 2 APIs.
- Create: `src/use-cases/admin/knowledge-discovery-scan-service.ts`
  - Runs idempotent scheduled scan logic and creates discovery requests only.
- Create: `src/app/api/admin/knowledge/discovery-requests/scan/route.ts`
  - Admin-triggered scan endpoint for manual verification.
- Create: `scripts/knowledge-discovery-scan-validate.ts`
  - Proves scan output is discovery-only and does not create approved knowledge.
- Modify: `package.json`
  - Registers the Phase 3 discovery scan validator only after its file exists.

### Phase 4 Files

- Create: `scripts/knowledge-wiki-simplification-preview-smoke.ts`
  - Authenticated Preview smoke for canonical IA, query sync, candidate/import/approval/export paths.
- Modify: `package.json`
  - Registers authenticated Preview smoke only after its script exists.
- Update: `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md`
  - Adds local, data-contract, and authenticated Preview verification evidence.

## Phase 1 Tasks: UI And URL Navigation Only

### Task 1: Canonical Tab And Query Contract

**Files:**
- Modify: `src/components/admin/knowledge-admin-tabs.ts`
- Modify: `src/app/admin/knowledge/page.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `scripts/knowledge-admin-tabs-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Replace the tab contract**

Replace `src/components/admin/knowledge-admin-tabs.ts` with the canonical types and labels. Keep description maps and approved sync target types so `KnowledgeAdminShell` can migrate without a typecheck break:

```ts
export type KnowledgeWorkTab = "candidates" | "approved" | "local_import" | "operations";
export type KnowledgeCandidateTab = "evidence" | "draft" | "decision";
export type KnowledgeApprovedFocus = "readback" | "export_sync";
export type KnowledgeApprovedSyncTarget = "portable_archive" | "obsidian" | "notion" | "assistant_retrieval";

export type KnowledgeAdminNavigation = {
  work: KnowledgeWorkTab;
  candidateTab: KnowledgeCandidateTab;
  candidateId: string;
  approvedId: string;
  approvedFocus: KnowledgeApprovedFocus;
  approvedSyncTarget: KnowledgeApprovedSyncTarget;
  discoveryId: string;
  importPreviewId: string;
  rubricId: string;
};

export const knowledgeWorkTabLabels: Record<KnowledgeWorkTab, string> = {
  candidates: "후보 관리",
  approved: "승인 WIKI",
  local_import: "로컬 WIKI 가져오기",
  operations: "운영 점검",
};

export const knowledgeWorkTabDescriptions: Record<KnowledgeWorkTab, string> = {
  candidates: "자동 발굴 요청과 AI 검토 WIKI 후보를 구분해서 검토합니다.",
  approved: "승인 WIKI를 검색, 확인, 복사하고 보조 내보내기/동기화를 처리합니다.",
  local_import: "로컬 WIKI 작업장 가져오기 준비 상태와 기준을 확인합니다.",
  operations: "운영 검증, provider, 법규 출처, 파일 청크 상태를 점검합니다.",
};

export const knowledgeCandidateTabLabels: Record<KnowledgeCandidateTab, string> = {
  evidence: "근거 확인",
  draft: "초안 다듬기",
  decision: "승인 결정",
};

export const knowledgeCandidateTabDescriptions: Record<KnowledgeCandidateTab, string> = {
  evidence: "질문/답변, confidence reason, 근거 목록, 출처 URL, 우선순위를 확인합니다.",
  draft: "제목, 요약, 태그, 범위, Markdown 본문, 미리보기를 다듬습니다.",
  decision: "경고/차단 항목, 반려 사유, 승인 패키지, 최종 승인/반려를 처리합니다.",
};

export const knowledgeWorkTabs = Object.keys(knowledgeWorkTabLabels) as KnowledgeWorkTab[];
export const knowledgeCandidateTabs = Object.keys(knowledgeCandidateTabLabels) as KnowledgeCandidateTab[];
export const knowledgeApprovedFocusValues: KnowledgeApprovedFocus[] = ["readback", "export_sync"];
export const knowledgeApprovedSyncTargets: KnowledgeApprovedSyncTarget[] = [
  "portable_archive",
  "obsidian",
  "notion",
  "assistant_retrieval",
];

export const defaultKnowledgeAdminNavigation: KnowledgeAdminNavigation = {
  work: "candidates",
  candidateTab: "evidence",
  candidateId: "",
  approvedId: "",
  approvedFocus: "readback",
  approvedSyncTarget: "portable_archive",
  discoveryId: "",
  importPreviewId: "",
  rubricId: "",
};

export function parseKnowledgeAdminNavigation(searchParams: URLSearchParams): KnowledgeAdminNavigation {
  return {
    work: parseEnum(searchParams.get("work"), knowledgeWorkTabs, defaultKnowledgeAdminNavigation.work),
    candidateTab: parseEnum(searchParams.get("candidateTab"), knowledgeCandidateTabs, defaultKnowledgeAdminNavigation.candidateTab),
    candidateId: searchParams.get("candidateId")?.trim() ?? "",
    approvedId: searchParams.get("approvedId")?.trim() ?? "",
    approvedFocus: parseEnum(searchParams.get("approvedFocus"), knowledgeApprovedFocusValues, defaultKnowledgeAdminNavigation.approvedFocus),
    approvedSyncTarget: parseEnum(searchParams.get("approvedSyncTarget"), knowledgeApprovedSyncTargets, defaultKnowledgeAdminNavigation.approvedSyncTarget),
    discoveryId: searchParams.get("discoveryId")?.trim() ?? "",
    importPreviewId: searchParams.get("importPreviewId")?.trim() ?? "",
    rubricId: searchParams.get("rubricId")?.trim() ?? "",
  };
}

export function serializeKnowledgeAdminNavigation(
  current: URLSearchParams,
  next: Partial<KnowledgeAdminNavigation>,
) {
  const params = new URLSearchParams(current);
  const merged = { ...parseKnowledgeAdminNavigation(params), ...next };

  writeParam(params, "work", merged.work, defaultKnowledgeAdminNavigation.work);
  writeParam(params, "candidateTab", merged.candidateTab, defaultKnowledgeAdminNavigation.candidateTab);
  writeParam(params, "candidateId", merged.candidateId, "");
  writeParam(params, "approvedId", merged.approvedId, "");
  writeParam(params, "approvedFocus", merged.approvedFocus, defaultKnowledgeAdminNavigation.approvedFocus);
  writeParam(params, "approvedSyncTarget", merged.approvedSyncTarget, defaultKnowledgeAdminNavigation.approvedSyncTarget);
  writeParam(params, "discoveryId", merged.discoveryId, "");
  writeParam(params, "importPreviewId", merged.importPreviewId, "");
  writeParam(params, "rubricId", merged.rubricId, "");

  return params.toString();
}

export function knowledgeWorkTabDomId(tab: KnowledgeWorkTab) {
  return `knowledge-work-tab-${tab}`;
}

export function knowledgeWorkPanelDomId(tab: KnowledgeWorkTab) {
  return `knowledge-work-panel-${tab}`;
}

export function knowledgeCandidateTabDomId(tab: KnowledgeCandidateTab) {
  return `knowledge-candidate-tab-${tab}`;
}

export function knowledgeCandidatePanelDomId(tab: KnowledgeCandidateTab) {
  return `knowledge-candidate-panel-${tab}`;
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T) {
  return value && allowed.includes(value as T) ? value as T : fallback;
}

function writeParam(params: URLSearchParams, key: string, value: string, fallback: string) {
  if (!value || value === fallback) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
```

- [x] **Step 2: Parse query state in the server page**

Modify `src/app/admin/knowledge/page.tsx` so it parses `searchParams` and passes `initialNavigation` into `KnowledgeAdminShell`:

```tsx
import { parseKnowledgeAdminNavigation } from "@/components/admin/knowledge-admin-tabs";

type AdminKnowledgePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminKnowledgePage({ searchParams }: AdminKnowledgePageProps) {
  const user = await requirePageUser("/admin/knowledge");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (!canManageKnowledge(user)) {
    redirect("/auth/no-access" as Route);
  }

  const rawSearchParams = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const candidates = await listKnowledgeCandidates();
  return (
    <KnowledgeAdminShell
      initialCandidates={candidates}
      initialNavigation={parseKnowledgeAdminNavigation(params)}
    />
  );
}
```

- [x] **Step 3: Update shell imports and old work ids**

Modify `src/components/admin/knowledge-admin-shell.tsx` in the same task before running typecheck:

```text
Replace old work ids:
- "review" -> "candidates"
- "sync" -> "approved" plus approvedFocus="export_sync"

Replace old candidate tab ids:
- "overview" and "quality" must not be serialized.
- "evidence", "draft", and "decision" remain valid.

Replace old sync target state:
- keep approved sync target as local approved panel state or use `approvedSyncTarget` from `KnowledgeAdminNavigation`.
- remove `initialNavigation.syncTarget`.
```

Hardcoded navigation helpers must use:

```ts
updateNavigationQuery({ work: "candidates", candidateTab: "evidence" });
updateNavigationQuery({ work: "approved", approvedId: item.id, approvedFocus: "readback" });
updateNavigationQuery({ work: "approved", approvedId: item.id, approvedFocus: "export_sync", approvedSyncTarget });
updateNavigationQuery({ work: "local_import", importPreviewId: preview.id, rubricId: preview.rubricId });
```

- [x] **Step 4: Update the Phase 1 validator expectations**

Update `scripts/knowledge-admin-tabs-validate.ts` so Task 1 checks only the contract and known Phase 1 shell imports. Do not check dirty-draft, Back/Forward, or guide strings until those steps exist:

```ts
assertIncludes(tabs, 'candidates: "후보 관리"', "canonical work tab labels");
assertIncludes(tabs, 'approved: "승인 WIKI"', "canonical work tab labels");
assertIncludes(tabs, 'local_import: "로컬 WIKI 가져오기"', "canonical work tab labels");
assertIncludes(tabs, 'operations: "운영 점검"', "canonical work tab labels");
assertIncludes(tabs, 'evidence: "근거 확인"', "canonical candidate steps");
assertIncludes(tabs, 'draft: "초안 다듬기"', "canonical candidate steps");
assertIncludes(tabs, 'decision: "승인 결정"', "canonical candidate steps");
assertIncludes(tabs, "approvedFocus", "approved focus URL hint");
assertIncludes(tabs, "approvedSyncTarget", "approved sync target URL hint");
assertIncludes(tabs, "discoveryId", "discovery URL hint");
assertIncludes(tabs, "importPreviewId", "import preview URL hint");
assertIncludes(tabs, "rubricId", "rubric URL hint");
assertIncludes(page, "parseKnowledgeAdminNavigation", "server page query parsing");
assertIncludes(shell, "initialNavigation", "shell receives parsed navigation");
```

- [x] **Step 5: Register only the Phase 1 validator**

Add or keep this package script only in Phase 1:

```json
"knowledge-admin:tabs:validate": "tsx scripts/knowledge-admin-tabs-validate.ts"
```

Register Phase 2, Phase 3, and Phase 4 validators in the same tasks that create their files. Do not register scripts that do not exist unless they are explicit placeholder scripts that fail with a clear `Phase N not implemented` message and are excluded from green gates.

- [x] **Step 6: Verify Phase 1 contract**

Run:

```powershell
npm run knowledge-admin:tabs:validate
npm run typecheck
```

Expected:

```text
knowledge-admin-tabs-validate: ok
TypeScript exits 0
```

### Task 2: Rework Candidate Review To Three Steps

**Files:**
- Create: `src/components/admin/use-knowledge-admin-navigation.ts`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`

- [x] **Step 1: Keep `개요` as fixed summary band**

Move title, source badge, project/task, state, confidence, warning count, and next action above the candidate step tablist. This band must not be hidden when switching `근거 확인`, `초안 다듬기`, and `승인 결정`.

- [x] **Step 2: Render exactly three candidate steps**

Render the candidate step labels from `knowledgeCandidateTabLabels`. The tab row must show only:

```text
근거 확인
초안 다듬기
승인 결정
```

- [x] **Step 3: Move evidence-only content to `근거 확인`**

`근거 확인` owns question/answer, confidence reason, evidence list, source URL presence, source filters, and evidence priority. It must not show draft edit controls.

- [x] **Step 4: Move draft-only content to `초안 다듬기`**

`초안 다듬기` owns title, summary, tags, scope, Markdown body, Markdown preview, draft copy, and reset controls. It must show at most one high-priority chip strip above the edit controls.

- [x] **Step 5: Move quality and final actions to `승인 결정`**

`승인 결정` owns:

- warning/blocker summary
- readiness failures
- guardrail warnings
- Markdown structure warnings
- WIKI link warnings
- source missing warnings
- low confidence warnings
- rejection reason
- approval package copy
- reject action
- approve action

Passing checks are collapsed below unresolved checks.

- [x] **Step 6: Add dirty draft protection for URL-driven navigation**

All candidate changes must pass through one guarded function. This includes row click, browser Back/Forward, manual query edit, and query replacement.

Implement `useKnowledgeAdminNavigation` with this policy:

```ts
type CandidateNavigationIntent = {
  nextCandidateId: string;
  source: "row_click" | "query_sync" | "browser_history" | "manual_query";
};

function requestCandidateNavigation(intent: CandidateNavigationIntent) {
  if (isDraftDirty && !window.confirm("저장되지 않은 WIKI 초안 변경이 있습니다. 다른 후보로 이동하면 현재 초안이 새 후보 초안으로 바뀝니다. 계속 이동할까요?")) {
    replaceNavigationQuery({ candidateId: selectedId });
    return false;
  }
  setSelectedId(intent.nextCandidateId);
  return true;
}
```

`syncNavigationFromSearchParams` must parse `work`, `candidateTab`, `candidateId`, `approvedId`, `approvedFocus`, `approvedSyncTarget`, `discoveryId`, `importPreviewId`, and `rubricId` on every `searchParams` change.

User-initiated navigation calls `router.push`. Invalid URL cleanup and cancelled dirty-draft restoration call `router.replace`.

Add a `beforeunload` listener when `isDraftDirty` is true.

- [x] **Step 7: Extend the validator after dirty-draft and URL sync exist**

After Step 6 is implemented, add these checks to `scripts/knowledge-admin-tabs-validate.ts`:

```ts
assertIncludes(shell, "beforeunload", "dirty draft unload guard");
assertIncludes(shell, "syncNavigationFromSearchParams", "back/forward URL reconciliation");
assertIncludes(shell, "router.push", "user navigation creates browser history");
assertIncludes(shell, "router.replace", "invalid URL cleanup avoids extra history entries");
```

- [x] **Step 8: Verify candidate simplification**

Run:

```powershell
npm run knowledge-admin:tabs:validate
npm run typecheck
```

Expected:

```text
canonical three-step candidate flow is present
TypeScript exits 0
```

### Task 3: Approved WIKI With Export/Sync Auxiliary Surface

**Files:**
- Create: `src/components/admin/knowledge-approved-export-sync-panel.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`

- [x] **Step 1: Remove top-level sync tab**

There must be no `work=sync` top-level tab. Existing export/sync controls move under `승인 WIKI`.

Remove or rewrite every old navigation call that creates:

```text
?work=sync
?syncTarget=<target>
```

Use:

```text
?work=approved&approvedFocus=export_sync&approvedSyncTarget=<target>
```

- [x] **Step 2: Add approved readback and export/sync sections**

Inside `승인 WIKI`, keep:

- approved search/filter/list
- selected approved detail
- Markdown preview
- source/reference inspection
- copy actions
- export/sync auxiliary surface
- provider preview/execution package controls already supported by existing APIs

- [x] **Step 3: Make export selection explicit**

If export scope is `selected`, the UI must show the selected approved item title and disable selected export when no approved item is explicitly selected.

The approved export/sync surface must have a stable DOM id:

```tsx
<section id="approved-wiki-export-sync" tabIndex={-1}>
  ...
</section>
```

- [x] **Step 4: Implement approval closeout navigation**

After approval:

- `승인 WIKI에서 보기` sets `work=approved&approvedId=<approved-id>`.
- `내보내기` sets `work=approved&approvedId=<approved-id>&approvedFocus=export_sync`.
- `복사` copies the approved WIKI body or approval package.

When `approvedFocus === "export_sync"`, scroll and focus `#approved-wiki-export-sync` after the approved panel renders:

```ts
document.getElementById("approved-wiki-export-sync")?.focus();
document.getElementById("approved-wiki-export-sync")?.scrollIntoView({ block: "start" });
```

- [x] **Step 5: Verify approved/export behavior**

Run:

```powershell
npm run typecheck
npm run knowledge-admin:tabs:validate
```

Expected:

```text
No top-level sync tab remains
Approved WIKI contains export/sync auxiliary controls
```

### Task 4: Local Import Placeholder, Guide, And Worklog Boundary

**Files:**
- Create: `src/components/admin/knowledge-local-import-placeholder-panel.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `scripts/knowledge-admin-tabs-validate.ts`
- Modify: `사용자 가이드.md`
- Create or update: `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md`

- [x] **Step 1: Add a non-mutating local import placeholder panel**

Create `src/components/admin/knowledge-local-import-placeholder-panel.tsx`:

```tsx
type KnowledgeLocalImportPlaceholderPanelProps = {
  activeRubricLabel: string;
};

export function KnowledgeLocalImportPlaceholderPanel({
  activeRubricLabel,
}: KnowledgeLocalImportPlaceholderPanelProps) {
  return (
    <section aria-label="로컬 WIKI 가져오기 준비" id="knowledge-local-import-placeholder">
      <div>
        <p>로컬 WIKI 가져오기</p>
        <h2>Phase 2 데이터/API 준비 후 가져오기를 활성화합니다</h2>
      </div>
      <p>
        Phase 1에서는 로컬 파일을 스캔하지 않고, raw 경로와 파일 본문을 표시하지 않으며,
        후보를 생성하지 않습니다.
      </p>
      <dl>
        <div>
          <dt>현재 기준</dt>
          <dd>{activeRubricLabel}</dd>
        </div>
        <div>
          <dt>후보 생성</dt>
          <dd>비활성화됨</dd>
        </div>
      </dl>
    </section>
  );
}
```

The Phase 1 panel must not read local files, display local absolute paths, call import-preview APIs, or create candidates.

- [x] **Step 2: Mount the placeholder as the `local_import` work panel**

In `KnowledgeAdminShell`, render `KnowledgeLocalImportPlaceholderPanel` inside the `work="local_import"` tabpanel. It must have valid `role="tabpanel"`, `aria-labelledby`, and `hidden` handling like the other work panels.

- [x] **Step 3: Update the user guide**

Update `사용자 가이드.md` with these exact claims:

```md
- `/admin/knowledge`의 상위 업무 탭은 `후보 관리`, `승인 WIKI`, `로컬 WIKI 가져오기`, `운영 점검`입니다.
- `내보내기/동기화`는 상위 탭이 아니라 `승인 WIKI` 안의 보조 화면입니다.
- Phase 1에서는 DB/API/schema/auth guard를 변경하지 않습니다.
- 전체 WIKI 단순화 완료는 Phase 2 이후 데이터/API/RBAC/audit까지 완료되어야 인정합니다.
- `로컬 WIKI 가져오기`는 Phase 1에서 로컬 파일을 스캔하거나 후보를 생성하지 않습니다.
```

- [x] **Step 4: Extend the Phase 1 validator after guide and placeholder exist**

Add these checks to `scripts/knowledge-admin-tabs-validate.ts`:

```ts
assertIncludes(shell, "KnowledgeLocalImportPlaceholderPanel", "local import placeholder panel");
assertIncludes(shell, "approved-wiki-export-sync", "approved export sync focus target");
assertIncludes(guide, "Phase 1에서는 DB/API/schema/auth guard를 변경하지 않습니다", "phase boundary");
assertIncludes(guide, "전체 WIKI 단순화 완료는 Phase 2 이후 데이터/API/RBAC/audit까지 완료되어야 인정합니다", "full completion boundary");
assertIncludes(guide, "`내보내기/동기화`는 상위 탭이 아니라 `승인 WIKI` 안의 보조 화면입니다.", "export sync IA boundary");
```

- [x] **Step 5: Write compact worklog entry**

Update `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md` using the repo compact format:

```md
# 2026-06-12 - Knowledge Admin WIKI Simplification

Req: Rework `/admin/knowledge` IA into 후보 관리 / 승인 WIKI / 로컬 WIKI 가져오기 / 운영 점검 with Phase 1 UI-only boundary.
Diff: Canonical URL contract, 3-step candidate flow, approved export/sync auxiliary surface, local import placeholder, and guide updates.
Why: Prevent WIKI candidate, discovery, local import, and approved WIKI concepts from sharing one overloaded scroll surface before Phase 2 data/API work.
Verify/Time: `npm run knowledge-admin:tabs:validate`; `npm run typecheck`; `git diff --check`; residual Phase 2/3/4 data/API/Preview gates remain open.
```

- [x] **Step 6: Verify Phase 1 closeout**

Run:

```powershell
npm run knowledge-admin:tabs:validate
npm run typecheck
npm run worklog:check
git diff --check
```

Expected:

```text
Phase 1 checks pass
```

## Phase 2 Tasks: Data, API, RBAC, And Audit Foundation

### Task 5: Add Prisma Data Model And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260612170000_knowledge_wiki_simplification/migration.sql`

- [x] **Step 1: Add Prisma models and backrefs**

Add project-scoped relation models for discovery/import previews and an organization-level rubric model. Also add the matching backrefs to `Project`, `Task`, `Profile`, and `AssistantTaskRecord`.

```prisma
model KnowledgeDiscoveryRequest {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId            String   @map("project_id") @db.Uuid
  taskId               String   @map("task_id") @db.Uuid
  scanId               String   @map("scan_id") @db.Uuid
  state                String   @default("new")
  recommendationScore  Int      @default(0) @map("recommendation_score")
  recommendationReason String   @default("") @map("recommendation_reason")
  evidenceSummary      Json     @default("{}") @map("evidence_summary")
  promotedCandidateId  String?  @map("promoted_candidate_id") @db.Uuid
  reviewedBy           String?  @map("reviewed_by") @db.Uuid
  reviewedAt            DateTime? @map("reviewed_at") @db.Timestamptz(6)
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task                 Task     @relation("KnowledgeDiscoveryTask", fields: [projectId, taskId], references: [projectId, id], onDelete: Cascade)
  reviewer             Profile? @relation("KnowledgeDiscoveryReviewedBy", fields: [reviewedBy], references: [id], onDelete: SetNull)
  promotedCandidate    AssistantTaskRecord? @relation("KnowledgeDiscoveryPromotedCandidate", fields: [promotedCandidateId], references: [id], onDelete: SetNull)

  @@unique([scanId, taskId])
  @@index([projectId, state, createdAt])
  @@index([taskId, createdAt])
  @@map("knowledge_discovery_requests")
}

model KnowledgeImportPreview {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId             String   @map("project_id") @db.Uuid
  defaultTaskId         String?  @map("default_task_id") @db.Uuid
  rubricId              String   @map("rubric_id") @db.Uuid
  rubricVersion         Int      @map("rubric_version")
  state                 String   @default("draft")
  workspaceFingerprint  String   @map("workspace_fingerprint")
  includedItems         Json     @default("[]") @map("included_items")
  excludedItems         Json     @default("[]") @map("excluded_items")
  createdBy             String   @map("created_by") @db.Uuid
  confirmedBy           String?  @map("confirmed_by") @db.Uuid
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  confirmedAt           DateTime? @map("confirmed_at") @db.Timestamptz(6)
  project               Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  defaultTask           Task?    @relation("KnowledgeImportPreviewDefaultTask", fields: [projectId, defaultTaskId], references: [projectId, id], onDelete: NoAction)
  rubric                KnowledgeImportRubric @relation(fields: [rubricId], references: [id], onDelete: Restrict)
  creator               Profile @relation("KnowledgeImportPreviewCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  confirmer             Profile? @relation("KnowledgeImportPreviewConfirmedBy", fields: [confirmedBy], references: [id], onDelete: SetNull)

  @@index([projectId, state, createdAt])
  @@index([rubricId, state, createdAt])
  @@index([createdBy, createdAt])
  @@map("knowledge_import_previews")
}

model KnowledgeImportRubric {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name            String
  version         Int
  state           String   @default("draft")
  hardBlockers    Json     @default("[]") @map("hard_blockers")
  scoringCriteria Json     @default("[]") @map("scoring_criteria")
  weights         Json     @default("{}")
  createdBy       String   @map("created_by") @db.Uuid
  updatedBy       String   @map("updated_by") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  archivedAt      DateTime? @map("archived_at") @db.Timestamptz(6)
  creator         Profile @relation("KnowledgeImportRubricCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  updater         Profile @relation("KnowledgeImportRubricUpdatedBy", fields: [updatedBy], references: [id], onDelete: Restrict)
  previews        KnowledgeImportPreview[]

  @@unique([name, version])
  @@index([state, updatedAt])
  @@map("knowledge_import_rubrics")
}
```

Add these backrefs to existing models:

```prisma
model Project {
  knowledgeDiscoveryRequests KnowledgeDiscoveryRequest[]
  knowledgeImportPreviews    KnowledgeImportPreview[]
}

model Task {
  knowledgeDiscoveryRequests KnowledgeDiscoveryRequest[] @relation("KnowledgeDiscoveryTask")
  defaultKnowledgeImportPreviews KnowledgeImportPreview[] @relation("KnowledgeImportPreviewDefaultTask")
}

model Profile {
  reviewedKnowledgeDiscoveryRequests KnowledgeDiscoveryRequest[] @relation("KnowledgeDiscoveryReviewedBy")
  createdKnowledgeImportPreviews     KnowledgeImportPreview[] @relation("KnowledgeImportPreviewCreatedBy")
  confirmedKnowledgeImportPreviews   KnowledgeImportPreview[] @relation("KnowledgeImportPreviewConfirmedBy")
  createdKnowledgeImportRubrics      KnowledgeImportRubric[] @relation("KnowledgeImportRubricCreatedBy")
  updatedKnowledgeImportRubrics      KnowledgeImportRubric[] @relation("KnowledgeImportRubricUpdatedBy")
}

model AssistantTaskRecord {
  promotedFromKnowledgeDiscoveryRequests KnowledgeDiscoveryRequest[] @relation("KnowledgeDiscoveryPromotedCandidate")
}
```

Every `KnowledgeImportPreview.includedItems` entry must include either a `targetTaskId` that belongs to `projectId`, or the preview must have a valid `defaultTaskId`. Import must reject items that cannot resolve a target task.

- [x] **Step 2: Add migration constraints**

The migration must enforce allowed states:

```sql
alter table "knowledge_discovery_requests"
  add constraint "knowledge_discovery_requests_state_check"
  check ("state" in ('new', 'reviewed', 'promoted', 'dismissed', 'stale'));

alter table "knowledge_import_previews"
  add constraint "knowledge_import_previews_state_check"
  check ("state" in ('draft', 'ready', 'confirmed', 'imported', 'expired'));

alter table "knowledge_import_rubrics"
  add constraint "knowledge_import_rubrics_state_check"
  check ("state" in ('draft', 'active', 'archived'));

create unique index "knowledge_import_rubrics_one_active"
  on "knowledge_import_rubrics" ("state")
  where "state" = 'active';
```

The migration must also create the foreign keys generated by Prisma relations and must fail for orphan project/task/profile/candidate IDs.

- [x] **Step 3: Verify Prisma**

Run:

```powershell
npm run db:generate
npx prisma validate
npm run deploy:migration-gate
npm run vercel-build
```

Expected:

```text
Prisma schema is valid
Prisma Client generated
Migration gate passes
Vercel build gate passes
```

### Task 6: Add RBAC Capabilities And Audit Event Names

**Files:**
- Modify: `src/lib/auth/knowledge-guards.ts`
- Create: `src/domains/admin/knowledge-workflow.ts`

- [x] **Step 1: Add capabilities**

Extend the existing `KnowledgeAdminCapability` union. Do not replace the current capability strings, because Phase 1 and existing admin routes still depend on them.

```ts
export type KnowledgeAdminCapability =
  | "knowledge.candidates.review"
  | "knowledge.approved_wiki.export"
  | "knowledge.legal_sources.review"
  | "knowledge.sync.preflight"
  | "knowledge.operations.debug"
  | "knowledge.discovery.promote"
  | "knowledge.discovery.dismiss"
  | "knowledge.discovery.scan"
  | "knowledge.import.preview"
  | "knowledge.import.confirm"
  | "knowledge.rubric.manage"
  | "knowledge.rubric.activate";
```

Update `allKnowledgeAdminCapabilities` in the same file so global-admin backfill receives the complete extended list during the migration window.

Every new mutation route must use this order:

```ts
assertRequestIntegrity(request);
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "<exact required capability>");
```

Do not rely on global admin role checks inside route handlers after `requireKnowledgeAdmin`. Capability checks must be route-local and exact.

- [x] **Step 2: Add workflow constants**

Create `src/domains/admin/knowledge-workflow.ts`:

```ts
export const knowledgeCandidateStateTransitions = {
  candidate: ["approved", "rejected"],
  pending_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
  not_candidate: [],
} as const;

export function assertKnowledgeCandidateReviewTransition(
  currentState: keyof typeof knowledgeCandidateStateTransitions,
  nextState: "approved" | "rejected",
) {
  if (!knowledgeCandidateStateTransitions[currentState].includes(nextState)) {
    throw new Error(`Invalid knowledge candidate transition: ${currentState} -> ${nextState}`);
  }
}

export const knowledgeAuditEventTypes = {
  discoveryPromoted: "knowledge.discovery.promoted",
  discoveryDismissed: "knowledge.discovery.dismissed",
  importPreviewCreated: "knowledge.import.preview_created",
  importPreviewConfirmed: "knowledge.import.preview_confirmed",
  importCandidateImported: "knowledge.import.candidate_imported",
  rubricCreated: "knowledge.rubric.created",
  rubricUpdated: "knowledge.rubric.updated",
  rubricActivated: "knowledge.rubric.activated",
  rubricArchived: "knowledge.rubric.archived",
  rubricRolledBack: "knowledge.rubric.rolled_back",
} as const;

export type KnowledgeWorkflowAuditEventType =
  typeof knowledgeAuditEventTypes[keyof typeof knowledgeAuditEventTypes];

export const nonDeletableWorkflowAuditTargetTypes = [
  "knowledge_discovery_request",
  "knowledge_import_preview",
  "knowledge_import_rubric",
  "knowledge_candidate_transition",
] as const;
```

- [x] **Step 3: Extend assistant metadata types**

Modify `src/domains/assistant/types.ts` so `AssistantRecordMetadata` includes:

```ts
knowledgeCandidateSource?: KnowledgeCandidateSource;
```

Use this typed field for `user_ai_review`, `discovery_request`, `local_wiki_import`, and `verified_legal_import` provenance. Do not place provenance only inside untyped `metadata` blobs in services.

- [x] **Step 4: Enforce append-only audit**

All Phase 2 mutation services must append audit events in the same transaction as the state mutation when the underlying storage supports transactions. Use `assistantRepository.createAuditEvent` for non-transactional existing flows and direct `tx.assistantAuditEvent.create` inside Prisma transactions for discovery/import/rubric flows. They must not delete or mutate prior audit events. Rollback creates a new `knowledge.rubric.rolled_back` event with actor, reason, previous active rubric id/version, restored rubric id/version, and affected preview ids.

Repository implementations must reject delete/update operations for audit rows whose `targetType` is in `nonDeletableWorkflowAuditTargetTypes`.

### Task 7: Add Discovery, Import Preview, And Rubric APIs

**Files:**
- Modify: `src/domains/assistant/types.ts`
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Create: `src/use-cases/admin/knowledge-discovery-service.ts`
- Create: `src/use-cases/admin/knowledge-import-preview-service.ts`
- Create: `src/use-cases/admin/knowledge-rubric-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Modify: `src/repositories/assistant/index.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/route.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/[requestId]/promote/route.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/[requestId]/dismiss/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/[previewId]/confirm/route.ts`
- Create: `src/app/api/admin/knowledge/import-previews/[previewId]/import/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/[rubricId]/activate/route.ts`
- Create: `src/app/api/admin/knowledge/rubrics/[rubricId]/rollback/route.ts`

- [x] **Step 0: Apply route security baseline**

Every `POST` route created in this task must call, in order:

```ts
assertRequestIntegrity(request);
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "<route capability>");
```

Discovery and import-preview routes must then call:

```ts
const projectContext = await requireCurrentProjectAccess(user);
```

Every `GET` route created in this task must call `requireKnowledgeAdmin()` and must only return records visible inside the user's project/admin boundary. Discovery/import GET routes also call `requireCurrentProjectAccess(user)`. URL IDs and request body IDs are lookup hints only; service methods must re-check existence, project/task ownership, current state, and allowed transition.

- [x] **Step 1: Add discovery APIs**

Required routes:

```text
GET  /api/admin/knowledge/discovery-requests
POST /api/admin/knowledge/discovery-requests
POST /api/admin/knowledge/discovery-requests/[requestId]/promote
POST /api/admin/knowledge/discovery-requests/[requestId]/dismiss
```

Server rules:

- `promote` requires `knowledge.discovery.promote`.
- `dismiss` requires `knowledge.discovery.dismiss`.
- `new` and `reviewed` can be promoted.
- `promoted`, `dismissed`, and `stale` cannot be promoted again.
- Promotion runs in one transaction: lock/read discovery request, validate transition, create one `AssistantTaskRecord` with `candidateState = "pending_review"` and `metadata.knowledgeCandidateSource.type = "discovery_request"`, mark request `promoted`, and append audit event.
- Promotion never writes `approvedKnowledgeItem`.
- Promotion rejects requests whose `projectId`/`taskId` pair does not resolve to an accessible task.
- Duplicate promotion is idempotently rejected with a typed conflict error, not silently re-promoted.

- [x] **Step 2: Add import preview APIs**

Required routes:

```text
GET  /api/admin/knowledge/import-previews
POST /api/admin/knowledge/import-previews
POST /api/admin/knowledge/import-previews/[previewId]/confirm
POST /api/admin/knowledge/import-previews/[previewId]/import
```

Server rules:

- Preview creation requires `knowledge.import.preview`.
- Confirmation/import requires `knowledge.import.confirm`.
- Hard blockers run before LLM scoring.
- Items failing secret/credential/path blockers are excluded before LLM scoring and before storage of preview item bodies.
- Confirmed import creates only `pending_review` candidates.
- Imported candidates get `metadata.knowledgeCandidateSource.type = "local_wiki_import"`.
- Import preview rows never contain `approvedBy`, `approvedAt`, or `approvedKnowledgeItem`.
- Each preview stores `projectId`; each included item stores either a valid `targetTaskId` inside that project or relies on a preview-level `defaultTaskId` inside that project.
- Import rejects any item whose target task cannot be resolved inside `projectId`.
- Confirmation records a redacted summary, rubric id/version, actor id, and confirmation time; it does not create candidates.
- Import runs in one transaction: re-read confirmed preview, validate `state = "confirmed"`, validate target tasks, create `pending_review` candidates, set preview `state = "imported"`, and append audit events.
- Re-importing `imported`, `expired`, or `draft` previews is rejected with a typed conflict error.

- [x] **Step 3: Add rubric APIs**

Required routes:

```text
GET  /api/admin/knowledge/rubrics
POST /api/admin/knowledge/rubrics
POST /api/admin/knowledge/rubrics/[rubricId]/activate
POST /api/admin/knowledge/rubrics/[rubricId]/rollback
```

Server rules:

- Draft/edit requires `knowledge.rubric.manage`.
- Activation/rollback requires `knowledge.rubric.activate`.
- Only one rubric can be active.
- Activating a draft archives the previous active rubric.
- Rolling back archives the current active rubric, clears `archivedAt` on the selected archived rubric, and restores the selected rubric as active.
- Preview rows record the rubric id/version used at preview creation.
- If active rubric changes after preview creation, import requires reselection or explicit audited override.
- Activation and rollback run in transactions and append audit events with previous active id/version, next active id/version, actor, reason, and affected preview ids.

- [x] **Step 4: Harden approval/rejection state transitions**

Modify existing approval/rejection paths in `src/use-cases/admin/knowledge-service.ts` so they call `assertKnowledgeCandidateReviewTransition` before changing state.

Server rules:

- `candidate` and `pending_review` can become `approved` or `rejected`.
- `approved`, `rejected`, and `not_candidate` are terminal for the admin approval/rejection action.
- Approval/rejection writes the state change and audit event in a single repository transaction when supported.
- Race conditions must not allow two terminal transitions from the same source record. The Postgres implementation must use a conditional update or transaction lock; the local store must mirror the same guard.

### Task 8: Add Data Contract Validators

**Files:**
- Create: `scripts/knowledge-wiki-data-contract-validate.ts`
- Create: `scripts/knowledge-local-import-secret-fixtures-validate.ts`
- Create: `scripts/knowledge-central-exclusion-validate.ts`
- Create: `scripts/knowledge-wiki-security-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Validate data contract statically**

`knowledge-wiki-data-contract-validate.ts` must assert:

- Prisma models exist: `KnowledgeDiscoveryRequest`, `KnowledgeImportPreview`, `KnowledgeImportRubric`.
- Prisma relations/backrefs exist for `Project`, `Task`, `Profile`, and `AssistantTaskRecord`.
- `KnowledgeImportPreview` has `projectId` and `defaultTaskId`; included item validation requires per-item `targetTaskId` or valid preview default task.
- State check constraints exist in migration.
- API route files exist for discovery, import preview, and rubric.
- Every Phase 2 `POST` route contains `assertRequestIntegrity`, `requireKnowledgeAdmin`, and exact `assertKnowledgeCapability`.
- Existing `KnowledgeAdminCapability` values are preserved and the new capability values are appended.
- `allKnowledgeAdminCapabilities` contains every value in the union.
- `AssistantRecordMetadata` includes typed `knowledgeCandidateSource`.
- `knowledgeCandidateStateTransitions` and `assertKnowledgeCandidateReviewTransition` exist.
- Approval/rejection code calls `assertKnowledgeCandidateReviewTransition`.
- Audit event names and `nonDeletableWorkflowAuditTargetTypes` exist.
- Mutation services append audit events through `assistantRepository.createAuditEvent` or the same Prisma transaction that performs the state mutation.
- Discovery promotion/import confirmation/import/rollback use transaction or conditional-update guards.

- [x] **Step 2: Validate secret fixtures**

`knowledge-local-import-secret-fixtures-validate.ts` must include synthetic fixture strings for:

- OpenAI-style API key assignment
- bearer-token authorization header
- PostgreSQL-style database URL assignment
- private-key header marker
- absolute local path with user name

Expected result:

```text
knowledge-local-import-secret-fixtures-validate: ok
```

The validator must execute the import-preview service with an in-memory repository and a stub LLM scorer that throws if it receives blocked content. It must prove blocked fixture content is not sent to LLM scoring, not stored in included items, not exposed in copy/download output, not written to audit payloads, and not printed as raw exclusion reason.

The validator output must contain only redacted fixture labels. Add a follow-up raw secret scan inside the script:

```ts
assertNoRawSecretInOutput(capturedOutput, blockedFixtureValues);
assertNoRawSecretInAudit(capturedAuditPayloads, blockedFixtureValues);
```

- [x] **Step 3: Validate central knowledge exclusion**

`knowledge-central-exclusion-validate.ts` must prove:

- discovery requests are not returned by approved WIKI readback
- import previews are not returned by approved WIKI readback
- `pending_review` assistant records are not returned by central knowledge search
- only `candidateState = "approved"` plus valid `metadata.approvedKnowledgeItem` is reusable as `central_knowledge`
- `src/repositories/assistant/postgres-store.ts` filters approved WIKI search with `candidate_state = 'approved'` and `metadata ? 'approvedKnowledgeItem'`
- `src/repositories/assistant/local-store.ts` applies the same filter before mapping `metadata.approvedKnowledgeItem`
- `src/use-cases/task-review-service.ts` cannot ingest discovery requests, import previews, or `pending_review` records as `central_knowledge`

- [x] **Step 4: Validate route and service security**

`knowledge-wiki-security-validate.ts` must assert:

- every Phase 2/3 `POST` route imports and calls `assertRequestIntegrity`
- every Phase 2/3 `POST` route calls `requireKnowledgeAdmin`
- every Phase 2/3 `POST` route calls exact `assertKnowledgeCapability` for the capability in the API matrix
- every discovery/import-preview route imports and calls `requireCurrentProjectAccess`
- rubric routes do not call project-scoped import/preview body readers and do not return preview item bodies
- no Phase 2/3 mutation service trusts URL/query IDs without a repository re-read
- promotion/import/approval/rejection/rollback paths reject terminal or invalid state transitions
- missing capability and wrong project/task target test fixtures return typed forbidden/conflict errors
- audit events redact secret fixture values and local absolute paths

- [x] **Step 5: Register Phase 2 validators**

Add scripts in `package.json` after the validator files exist:

```json
{
  "scripts": {
    "knowledge-wiki:data-contract:validate": "tsx scripts/knowledge-wiki-data-contract-validate.ts",
    "knowledge-wiki:secret-fixtures:validate": "tsx scripts/knowledge-local-import-secret-fixtures-validate.ts",
    "knowledge-wiki:central-exclusion:validate": "tsx scripts/knowledge-central-exclusion-validate.ts",
    "knowledge-wiki:security:validate": "tsx scripts/knowledge-wiki-security-validate.ts"
  }
}
```

- [x] **Step 6: Verify Phase 2 gates**

Run:

```powershell
npm run knowledge-wiki:data-contract:validate
npm run knowledge-wiki:secret-fixtures:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
npm run db:generate
npx prisma validate
npm run deploy:migration-gate
npm run vercel-build
```

Expected:

```text
data contract ok
secret fixtures blocked and redacted
central knowledge exclusion ok
security route and transition guards ok
Prisma schema is valid
Migration gate passes
Vercel build gate passes
```

## Phase 3 Tasks: Connect Discovery And Local Import To Candidate Creation

### Task 9: Connect `후보 관리` To Discovery Requests

**Files:**
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Create: `src/use-cases/admin/knowledge-discovery-scan-service.ts`
- Create: `src/app/api/admin/knowledge/discovery-requests/scan/route.ts`
- Create: `scripts/knowledge-discovery-scan-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Show `자동 발굴 요청` separately inside `후보 관리`**

The page must display discovery requests separately from actual candidates. Discovery rows show task, recommendation score, recommendation reason, scan id, state, and actions.

- [x] **Step 2: Add manual scan endpoint**

The scan endpoint creates or refreshes discovery requests only. It must not create candidates, approvals, or central knowledge.

The scan endpoint is a mutation route and must call:

```ts
assertRequestIntegrity(request);
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "knowledge.discovery.scan");
```

The scan service must write only `knowledge_discovery_requests`. It must not call candidate approval/rejection APIs, must not write `metadata.approvedKnowledgeItem`, and must not return raw task bodies beyond the redacted recommendation summary needed for review.

- [x] **Step 3: Add promotion action**

`WIKI 후보로 만들기` calls the promotion API. Successful promotion moves the linked candidate into the `AI 검토 WIKI 후보` list as `SaaS 검토 대기`.

- [x] **Step 4: Register discovery validator**

Add the script in `package.json` after `scripts/knowledge-discovery-scan-validate.ts` exists:

```json
{
  "scripts": {
    "knowledge-discovery-scan:validate": "tsx scripts/knowledge-discovery-scan-validate.ts"
  }
}
```

- [x] **Step 5: Validate discovery flow**

Run:

```powershell
npm run knowledge-discovery-scan:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
```

Expected:

```text
scan output is discovery-only
promoted request creates pending_review candidate only
central knowledge exclusion passes
scan route security passes
```

### Task 10: Connect `로컬 WIKI 가져오기`

**Files:**
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `사용자 가이드.md`

- [x] **Step 1: Add local import status and `가져오기` action**

The tab shows local workspace status, last scan time, active rubric version, and `가져오기`.

`가져오기` creates an import preview through `POST /api/admin/knowledge/import-previews`. It must not create candidates directly. After preview creation, update the URL to:

```text
/admin/knowledge?work=local_import&importPreviewId=<preview-id>&rubricId=<rubric-id>
```

Never render raw local absolute paths, raw file bodies, or secret-like strings in the UI. Display redacted source labels and safe relative categories only.

- [x] **Step 2: Show balanced selection preview**

Preview groups:

- top recommendations
- reviewable items
- excluded items and safe redacted reasons

The page shows the compact LLM scoring explanation:

```text
LLM은 차단 규칙을 통과한 항목만 재사용 가치, 근거 강도, 업무 연결성, 최신성, WIKI 공백 보완성, 초안 작성 가능성, 위험도로 점수화합니다. 기준 버전: wiki-import-rubric v1.
```

- [x] **Step 3: Require preview confirmation before candidate creation**

No local item becomes a candidate until the admin confirms the preview and runs import.

The UI must keep `확정` and `후보로 가져오기` as separate actions:

- `확정`: calls `/api/admin/knowledge/import-previews/[previewId]/confirm` and records user intent.
- `후보로 가져오기`: calls `/api/admin/knowledge/import-previews/[previewId]/import` and creates only `pending_review` candidates.

Disable import when the preview is `draft`, `expired`, already `imported`, has no included items, references a task outside its project, or was created with an inactive rubric version without explicit audited override.

- [x] **Step 4: Add rubric management entry**

Knowledge admin can open active rubric, create draft, activate draft, view history, and rollback. Every activation/rollback produces append-only audit.

The rubric history panel must show active version, archived versions, rollback reason input, and the latest audit event summary without exposing blocked fixture values.

- [x] **Step 5: Validate local import**

Run:

```powershell
npm run knowledge-wiki:secret-fixtures:validate
npm run knowledge-wiki:data-contract:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
npm run typecheck
```

Expected:

```text
secret fixtures blocked
preview confirmation required
rubric rollback audit present
central knowledge exclusion passes
security route and transition guards pass
```

## Phase 4 Tasks: Verification And Closeout

### Task 11: Full Verification Gate

**Files:**
- Create: `scripts/knowledge-wiki-simplification-preview-smoke.ts`
- Modify: `package.json`
- Update: `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md`

- [x] **Step 0: Implement and register authenticated Preview smoke**

Create `scripts/knowledge-wiki-simplification-preview-smoke.ts` with Playwright-based authenticated Preview checks.

Required environment inputs:

```text
ARCHITECT_PREVIEW_URL
ARCHITECT_PREVIEW_CANONICAL_HOST
ARCHITECT_SMOKE_STORAGE_STATE or ARCHITECT_SMOKE_COOKIE
ARCHITECT_TEST_PROJECT_ID
ARCHITECT_ADMIN_EMAIL
VERCEL_BYPASS_TOKEN optional when the Preview deployment requires it
```

The script must fail if `ARCHITECT_PREVIEW_URL` is not the canonical target for `ARCHITECT_PREVIEW_CANONICAL_HOST`. It must not print cookies, bearer tokens, storage state content, secret fixture values, or raw local paths.

Add the script in `package.json` after the file exists:

```json
{
  "scripts": {
    "knowledge-wiki:preview-smoke": "tsx scripts/knowledge-wiki-simplification-preview-smoke.ts"
  }
}
```

- [x] **Step 1: Run static, type, schema, migration, and data gates**

Run:

```powershell
npm run knowledge-admin:tabs:validate
npm run knowledge-wiki:data-contract:validate
npm run knowledge-wiki:secret-fixtures:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
npm run knowledge-discovery-scan:validate
npm run db:generate
npx prisma validate
npm run deploy:migration-gate
npm run typecheck
npm run lint
npm run build
npm run vercel-build
npm run worklog:check
git diff --check
```

Expected:

```text
All commands exit 0
```

Non-green validators are release blockers unless explicitly waived with owner, date, reason, and follow-up path.

- [x] **Step 2: Run local browser smoke**

Verify on local `/admin/knowledge`:

- top-level tabs render `후보 관리`, `승인 WIKI`, `로컬 WIKI 가져오기`, `운영 점검`
- no top-level `내보내기/동기화` tab exists
- candidate steps render `근거 확인`, `초안 다듬기`, `승인 결정`
- fixed candidate summary remains visible while switching steps
- `품질 점검` is not a tab
- approval closeout actions appear after approval
- `내보내기` moves to approved WIKI export/sync auxiliary surface
- browser Back/Forward updates active tab and candidate step
- dirty draft blocks candidate changes from click, Back/Forward, and manual query edit
- invalid query IDs are cleared without page crash
- mobile width has no tab/text overlap

- [x] **Step 3: Run authenticated Preview smoke**

Run:

```powershell
npm run knowledge-wiki:preview-smoke
```

Preview smoke must prove:

- authenticated admin can open canonical Preview `/admin/knowledge`
- candidate list loads
- approved WIKI readback loads
- local import tab loads without leaking local paths or secrets
- export/sync auxiliary surface is reachable from approved WIKI
- operations tab loads degraded states safely
- approval/rejection/export/import network calls use expected API paths
- browser Back/Forward preserves query state on the real Preview surface
- dirty draft protection blocks click, Back/Forward, and manual query changes
- local import preview confirmation is required before candidate creation
- rubric rollback audit is visible after rollback test or fixture-backed audit read

- [x] **Step 4: Record closeout**

Update `docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md` using compact repo format:

```text
Req: simplify /admin/knowledge IA and WIKI candidate/import flow
Diff: <files changed and behavior changed>
Why: <risk or UX problem closed>
Verify: <commands and Preview URL/deployment/SHA>
Time: <Asia/Seoul timestamp>
```

Include:

- local validation results
- schema/migration results
- secret fixture result
- central knowledge exclusion result
- local import preview confirmation result
- rubric rollback audit result
- server-side state transition validation result
- Preview URL, deployment id, commit SHA, and smoke result
- remaining deferred risks, if any

## Commit Boundary

Before commit:

```powershell
git status --short --untracked-files=all
git diff --check
```

Review every planned file explicitly. Do not rely only on `git diff` because untracked files are part of this plan.

Stage only files that were implemented for the current phase. For the full implementation, the staged set must include the planned implementation files, not only this plan file:

```powershell
git add package.json
git add prisma/schema.prisma prisma/migrations/20260612170000_knowledge_wiki_simplification/migration.sql
git add src/app/admin/knowledge/page.tsx
git add src/components/admin/knowledge-admin-tabs.ts
git add src/components/admin/use-knowledge-admin-navigation.ts
git add src/components/admin/knowledge-local-import-placeholder-panel.tsx
git add src/components/admin/knowledge-approved-export-sync-panel.tsx
git add src/components/admin/knowledge-admin-shell.tsx
git add src/components/admin/knowledge-admin-shell.module.css
git add src/domains/admin/knowledge-workflow.ts src/domains/assistant/types.ts
git add src/lib/auth/knowledge-guards.ts
git add src/use-cases/admin/knowledge-service.ts
git add src/use-cases/admin/knowledge-discovery-service.ts src/use-cases/admin/knowledge-discovery-scan-service.ts
git add src/use-cases/admin/knowledge-import-preview-service.ts src/use-cases/admin/knowledge-rubric-service.ts
git add src/repositories/assistant/contracts.ts src/repositories/assistant/postgres-store.ts src/repositories/assistant/local-store.ts src/repositories/assistant/index.ts
git add src/app/api/admin/knowledge/discovery-requests
git add src/app/api/admin/knowledge/import-previews
git add src/app/api/admin/knowledge/rubrics
git add scripts/knowledge-admin-tabs-validate.ts scripts/knowledge-wiki-data-contract-validate.ts scripts/knowledge-local-import-secret-fixtures-validate.ts scripts/knowledge-central-exclusion-validate.ts scripts/knowledge-wiki-security-validate.ts scripts/knowledge-discovery-scan-validate.ts scripts/knowledge-wiki-simplification-preview-smoke.ts
git add "사용자 가이드.md"
git add docs/worklogs/2026-06-12-knowledge-admin-tabbed-workflow.md
git add docs/superpowers/plans/2026-06-12-knowledge-admin-tabbed-workflow-plan.md
git diff --cached --name-status
git commit -m "feat: simplify knowledge wiki admin workflow"
```

Commit only after the verification gate passes or a waiver is documented with owner, date, reason, and follow-up path.

Do not push unless the user explicitly asks for push.

## Completion Criteria

The full WIKI simplification is complete only when all of the following are true:

- Phase 1 canonical IA is implemented.
- `DB/API/schema/auth guard 변경 금지` is no longer treated as a goal-wide principle.
- Phase 2 data/API/RBAC/audit foundation is implemented.
- `knowledge_discovery_requests`, `knowledge_import_previews`, and `knowledge_import_rubrics` exist with migration and validators.
- Discovery promotion creates only `pending_review` candidates.
- Local import requires preview confirmation before candidate creation.
- Local import preview items resolve to `projectId` plus valid per-item or default `taskId` before candidate creation.
- Secret fixtures are blocked before LLM scoring and before copy/download/audit output.
- Rubric activation and rollback are append-only audited.
- Rubric rollback archives the current active rubric and restores the selected archived rubric as active with an audit event.
- `pending_review`, discovery requests, and import previews are excluded from central knowledge.
- URL IDs are navigation hints only and never authorize mutations.
- Approval, rejection, discovery promotion, import confirmation/import, and rubric activation/rollback are validated server-side with current-state transition checks.
- Security validator proves mutation routes use request integrity, admin auth, exact capability checks, `requireCurrentProjectAccess` on discovery/import routes, project/task boundary checks, and redacted audit output.
- Phase 2, Phase 3, and Phase 4 validators are registered only after their script files exist and all green-gate commands reference registered scripts.
- Browser Back/Forward query sync works.
- Dirty draft protection covers click, query, Back/Forward, and unload.
- Authenticated Preview browser smoke passes.

## Execution Handoff

Plan revised and saved to `docs/superpowers/plans/2026-06-12-knowledge-admin-tabbed-workflow-plan.md`.

Recommended execution mode: **Subagent-Driven**, because Phase 1 UI work, Phase 2 data/API/RBAC/audit work, Phase 3 product-flow integration, and Phase 4 Preview verification have different risk profiles and should be reviewed between phases.
