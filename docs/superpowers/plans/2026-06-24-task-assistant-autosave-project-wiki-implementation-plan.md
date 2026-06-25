# Task Assistant Auto-Save Project WIKI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Task Assistant flow where every successful AI review is auto-saved as an `임시 검토 기록`, approved work records can become `프로젝트wiki`, and each project wiki registration also creates a linked `공용wiki 후보`.

**Architecture:** Reuse `AssistantTaskRecord` as the durable temporary review record, extend it with soft-delete and project-wiki linkage metadata, and add a new `ProjectWikiItem` domain for project-scoped reusable knowledge. Keep project wiki management under `/materials`, enforce project membership on all project wiki APIs, and integrate only active project wiki items into Task Assistant retrieval while common WIKI candidate approval remains in the existing admin knowledge flow.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, existing project auth guards, existing assistant and structured knowledge repositories, `tsx` validation scripts, Playwright smoke scripts.

---

## Closeout Status

**Status:** implementation closed on 2026-06-25.

This plan is no longer an open implementation plan. The implementation work was completed on `codex/multi-user-transition`, followed by plan-alignment fixes for project-scoped lineage, mandatory approved work-summary draft selection, common WIKI candidate source links, deleted temporary-review handling, live provider fallback policy, and registration-preview reuse.

Durable worklogs:

- `docs/worklogs/2026-06-24-task-assistant-autosave-project-wiki-implementation.md`
- `docs/worklogs/2026-06-25-project-wiki-plan-alignment-gaps.md`
- `docs/worklogs/2026-06-25-task-assistant-project-wiki-plan-alignment-fixes.md`
- `docs/worklogs/2026-06-25-task-assistant-project-wiki-plan-closeout-push.md`

Final closeout requires only post-push Preview proof for the user-facing deployment target:

- branch parity: local `HEAD` equals `origin/codex/multi-user-transition`
- Vercel Preview deployment is `Ready`
- canonical Preview alias points to the intended deployment
- `/preview/materials?view=wiki` and `/preview/daily` respond successfully

---

## Source Requirements

Implement against `docs/superpowers/specs/2026-06-24-task-assistant-autosave-project-wiki-design.md`.

Scope terms are fixed:

- `임시 검토 기록`: auto-saved review output, reloadable and soft-deletable, not a work record and not WIKI.
- `작업 기록 승인`: official task work-record approval from the draft summary.
- `프로젝트wiki`: project-scoped reusable knowledge, immediately reusable inside the current project while active.
- `공용wiki 후보`: common WIKI review candidate created when project wiki is registered.
- `공용wiki`: approved shared knowledge, still controlled by the existing admin WIKI approval path.

If a discussion or code comment says only `wiki` and the target is unclear, stop and ask whether it means `프로젝트wiki`, `공용wiki 후보`, or `공용wiki`.

## Multi-Agent Execution Model

Use `superpowers:subagent-driven-development` for execution. The coordinator owns the branch, contract decisions, merges, and final verification. Each lane below can run in a separate worktree after Task 0 is complete.

| Lane | Agent | Owns | Depends On | Merge Order |
| --- | --- | --- | --- | --- |
| A | Data/Domain Agent | Prisma models, migration, domain types, repository contracts | Task 0 | 1 |
| B | Temporary Review Agent | auto-save API, soft delete/restore, work approval linkage | Lane A contracts | 2 |
| C | Project WIKI Service Agent | project wiki registration transaction, suitability, search, disable/restore logs | Lane A contracts | 3 |
| D | Retrieval Agent | active project wiki retrieval, source badges, disabled exclusion | Lane C repository | 4 |
| E | Task Assistant UX Agent | auto-save status, retry, 임시 검토 기록 list, registration preview | Lanes B/C APIs | 5 |
| F | Project Materials UX Agent | `/materials` project WIKI page, keyword search, disable/restore UI | Lane C APIs | 5 |
| G | Common WIKI Candidate Agent | candidate metadata, admin badge for disabled project wiki source | Lane C transaction | 6 |
| H | Verification Agent | contract validators, smoke scripts, build/type/lint, Preview proof plan | all lanes | 7 |

Coordinator rules:

- Never reset or discard current dirty files.
- Before spawning agents, either merge the existing Task Assistant UX edits into the base branch or create a named coordination commit for them.
- Do not let two agents edit `src/components/tasks/task-assistant-panel.tsx` at the same time. Agent E owns that file after Lane B contracts are merged.
- Do not let two agents edit `prisma/schema.prisma` at the same time. Agent A owns all schema edits.
- After each lane merge, run the lane validator and commit before starting the next dependent lane.

## File Structure

### Create

- `prisma/migrations/202606240001_add_project_wiki/migration.sql`: SQL migration for `project_wiki_items`, `project_wiki_action_logs`, and review-session soft-delete columns.
- `src/domains/project-wiki/types.ts`: project wiki status, suitability, draft, item, log, and request/response types.
- `src/domains/project-wiki/search.ts`: keyword-only matching and source badge helpers.
- `src/repositories/project-wiki/contracts.ts`: repository interface for project wiki persistence.
- `src/repositories/project-wiki/postgres-store.ts`: Prisma-backed project wiki repository and atomic registration transaction.
- `src/repositories/project-wiki/local-store.ts`: in-memory preview/local implementation.
- `src/repositories/project-wiki/index.ts`: repository selector.
- `src/use-cases/project-wiki-service.ts`: project membership scoped use-case layer.
- `src/use-cases/project-wiki-suitability-service.ts`: AI suitability and commonization caution generation.
- `src/app/api/projects/[projectId]/project-wiki/route.ts`: list/search and register project wiki.
- `src/app/api/projects/[projectId]/project-wiki/registration-preview/route.ts`: read-only registration preview and AI suitability result.
- `src/app/api/projects/[projectId]/project-wiki/[itemId]/route.ts`: item detail.
- `src/app/api/projects/[projectId]/project-wiki/[itemId]/status/route.ts`: disable/restore with optional reason.
- `src/app/api/assistant/review-sessions/[sessionId]/restore/route.ts`: undo restore for a soft-deleted temporary review record.
- `src/components/project-context/project-wiki-page.tsx`: project wiki management surface inside project materials.
- `scripts/project-wiki-contract-validate.ts`: static contract validator for models, routes, repository methods, UI copy, and package scripts.
- `scripts/project-wiki-behavior-validate.ts`: deterministic behavior validator for search, status, and source badge helpers.
- `scripts/project-wiki-preview-smoke.ts`: browser smoke route for `/preview/materials?view=wiki`.
- `docs/worklogs/2026-06-24-task-assistant-autosave-project-wiki-implementation.md`: durable worklog after implementation.

### Modify

- `package.json`: add `project-wiki:validate`, `project-wiki:behavior:validate`, and `project-wiki:preview-smoke` scripts.
- `prisma/schema.prisma`: add project wiki models, relations, and review soft-delete columns.
- `src/domains/assistant/types.ts`: add `project_wiki` as an assistant evidence kind and project wiki metadata.
- `src/use-cases/assistant-service.ts`: include active project wiki in retrieval and prompt context.
- `src/use-cases/task-review-service.ts`: rename saved review semantics to temporary review records, default list size to 6, exclude deleted records, expose project wiki linkage state.
- `src/use-cases/assistant-service.ts`: return AI project wiki suitability after approved work summary save or expose a follow-up use-case call.
- `src/repositories/assistant/contracts.ts`: add review-session soft delete/restore and metadata update methods.
- `src/repositories/assistant/postgres-store.ts`: implement review-session soft delete/restore and metadata update.
- `src/repositories/assistant/local-store.ts`: mirror soft delete/restore behavior.
- `src/app/api/assistant/review-sessions/route.ts`: keep `POST` as auto-save endpoint and return temporary-record copy.
- `src/app/api/assistant/review-sessions/[sessionId]/route.ts`: add `DELETE`.
- `src/components/tasks/task-assistant-panel.tsx`: auto-save state machine, retry, temporary list, work approval linkage, project wiki preview, registration.
- `src/app/globals.css`: compact badges, auto-save status, registration preview, temporary record delete/undo toast.
- `src/components/project-context/project-materials-page.tsx`: add 자료 / 프로젝트 WIKI segmented view.
- `src/components/project-context/project-materials-page.module.css`: add project wiki list/detail/search/status styles.
- `src/app/preview/assistant/preview-client.tsx`: mock new review-session/project-wiki API responses for preview.
- `src/components/admin/knowledge-admin-shell.tsx`: show small `원본 비활성화됨` badge for linked common WIKI candidates whose source project wiki is disabled.
- `scripts/task-assistant-unified-contract-validate.ts`: extend assertions for auto-save, project wiki registration, and removal of primary manual save.

## Shared Data Contracts

Agent A defines these exact TypeScript unions in `src/domains/project-wiki/types.ts`:

```ts
import type { AssistantCandidateState } from "@/domains/assistant/types";

export type ProjectWikiStatus = "active" | "disabled";

export type ProjectWikiSuitabilityState = "recommended" | "caution" | "not_recommended";

export type ProjectWikiRegistrationState =
  | "not_evaluated"
  | "recommended"
  | "caution"
  | "not_recommended"
  | "registered";

export type ProjectWikiSourceBadge = "프로젝트 WIKI" | "공용 WIKI" | "task" | "도면/문서" | "법규" | "외부";

export type ProjectWikiCommonCandidateStatus = AssistantCandidateState | null;

export type ProjectWikiDraft = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  aiSuitabilityState: ProjectWikiSuitabilityState;
  aiSuitabilityReason: string;
  commonizationCaution: string;
};

export type ProjectWikiItem = ProjectWikiDraft & {
  id: string;
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  commonCandidateRecordId: string | null;
  commonCandidateStatus: ProjectWikiCommonCandidateStatus;
  supplementalNote: string;
  status: ProjectWikiStatus;
  createdBy: string;
  createdByDisplay: string;
  createdAt: string;
  updatedAt: string;
  disabledBy: string | null;
  disabledAt: string | null;
  restoredBy: string | null;
  restoredAt: string | null;
};

export type ProjectWikiActionLog = {
  id: string;
  projectId: string;
  projectWikiItemId: string;
  action: "disable" | "restore";
  actorProfileId: string;
  actorDisplay: string;
  reason: string;
  createdAt: string;
};
```

Task Assistant review-session summaries include these fields after Lane B:

```ts
type ProjectWikiReviewState = {
  registrationState: "not_evaluated" | "recommended" | "caution" | "not_recommended" | "registered";
  suitabilityReason: string | null;
  projectWikiItemId: string | null;
  commonCandidateRecordId: string | null;
  workSummaryDraftId: string | null;
};
```

## Task 0: Coordinator Preflight

**Files:**
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-06-24-task-assistant-autosave-project-wiki-design.md`
- Read: `docs/superpowers/plans/2026-06-24-task-assistant-autosave-project-wiki-implementation-plan.md`

- [ ] **Step 1: Confirm branch and dirty worktree**

Run:

```powershell
git status --short --branch
```

Expected current baseline before implementation:

```text
## codex/multi-user-transition...origin/codex/multi-user-transition [ahead 1]
 M docs/worklogs/2026-06-24-task-assistant-visible-answer-ux.md
 M scripts/task-assistant-unified-contract-validate.ts
 M src/app/globals.css
 M src/components/tasks/task-assistant-panel.tsx
```

If the output differs, record the exact output in the implementation worklog before spawning agents. Do not reset any file.

- [ ] **Step 2: Read the design spec**

Run:

```powershell
Get-Content -Raw -Path docs\superpowers\specs\2026-06-24-task-assistant-autosave-project-wiki-design.md
```

Expected: the file contains `자동저장`, `프로젝트wiki`, `공용wiki 후보`, `비활성 포함`, and `보완 메모 추가`.

- [ ] **Step 3: Assign lanes**

Record this assignment in the worklog:

```markdown
Lane A Data/Domain:
Lane B Temporary Review:
Lane C Project WIKI Service:
Lane D Retrieval:
Lane E Task Assistant UX:
Lane F Project Materials UX:
Lane G Common Candidate:
Lane H Verification:
```

- [ ] **Step 4: Commit coordination-only baseline if needed**

If the dirty files are intentional prior UX work, commit them before lane work:

```powershell
git add docs\worklogs\2026-06-24-task-assistant-visible-answer-ux.md scripts\task-assistant-unified-contract-validate.ts src\app\globals.css src\components\tasks\task-assistant-panel.tsx
git commit -m "feat: simplify task assistant review actions"
```

Expected: one commit is created and `git status --short` shows only lane work after agents start.

## Task 1: Data Model And Static Contracts

**Owner:** Agent A

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202606240001_add_project_wiki/migration.sql`
- Create: `src/domains/project-wiki/types.ts`
- Create: `src/domains/project-wiki/search.ts`
- Create: `src/repositories/project-wiki/contracts.ts`
- Create: `src/repositories/project-wiki/index.ts`
- Create: `scripts/project-wiki-contract-validate.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract validator**

Create `scripts/project-wiki-contract-validate.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const schema = read("prisma/schema.prisma");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

assert.match(schema, /model ProjectWikiItem\s+\{/);
assert.match(schema, /model ProjectWikiActionLog\s+\{/);
assert.match(schema, /reviewDeletedAt\s+DateTime\?/);
assert.match(schema, /sourceReviewRecordId\s+String\s+@unique/);
assert.match(schema, /commonCandidateRecordId\s+String\?\s+@unique/);
assert.match(schema, /@@index\(\[projectId, status, updatedAt\]\)/);

const types = read("src/domains/project-wiki/types.ts");
assert.match(types, /export type ProjectWikiStatus = "active" \| "disabled"/);
assert.match(types, /export type ProjectWikiSuitabilityState = "recommended" \| "caution" \| "not_recommended"/);
assert.match(types, /export type ProjectWikiRegistrationState/);

const contracts = read("src/repositories/project-wiki/contracts.ts");
for (const name of [
  "listProjectWikiItems",
  "getProjectWikiItem",
  "buildProjectWikiRegistrationPreview",
  "registerProjectWiki",
  "setProjectWikiStatus",
  "searchProjectWikiForAssistant",
]) {
  assert.match(contracts, new RegExp(`${name}\\(`));
}

assert.equal(packageJson.scripts?.["project-wiki:validate"], "tsx scripts/project-wiki-contract-validate.ts");
assert.equal(packageJson.scripts?.["project-wiki:behavior:validate"], "tsx scripts/project-wiki-behavior-validate.ts");
assert.equal(packageJson.scripts?.["project-wiki:preview-smoke"], "tsx scripts/project-wiki-preview-smoke.ts");

console.log("project-wiki-contract-validate: ok");
```

- [ ] **Step 2: Run the validator and confirm failure**

Run:

```powershell
npm exec tsx scripts/project-wiki-contract-validate.ts
```

Expected: FAIL with an assertion mentioning `model ProjectWikiItem`.

- [ ] **Step 3: Extend Prisma schema**

Add these fields to `AssistantTaskRecord`:

```prisma
  reviewDeletedAt DateTime? @map("review_deleted_at") @db.Timestamptz(6)
  reviewDeletedBy String?   @map("review_deleted_by") @db.Uuid
  reviewRestoredAt DateTime? @map("review_restored_at") @db.Timestamptz(6)
  reviewRestoredBy String?   @map("review_restored_by") @db.Uuid
  projectWikiSourceItems ProjectWikiItem[] @relation("ProjectWikiSourceReviewRecord")
  projectWikiCommonCandidateItems ProjectWikiItem[] @relation("ProjectWikiCommonCandidateRecord")
  @@unique([projectId, id])
```

Add relation arrays:

```prisma
// Profile
  createdProjectWikiItems ProjectWikiItem[] @relation("ProjectWikiCreatedBy")
  disabledProjectWikiItems ProjectWikiItem[] @relation("ProjectWikiDisabledBy")
  restoredProjectWikiItems ProjectWikiItem[] @relation("ProjectWikiRestoredBy")
  projectWikiActionLogs ProjectWikiActionLog[] @relation("ProjectWikiActionLogActor")

// Project
  projectWikiItems ProjectWikiItem[]
  projectWikiActionLogs ProjectWikiActionLog[]

// Task
  sourceProjectWikiItems ProjectWikiItem[] @relation("ProjectWikiSourceTask")

// AssistantWorkSummaryDraft
  projectWikiItems ProjectWikiItem[]
  @@unique([projectId, id])
```

Add these models after `AssistantWorkSummaryDraft`:

```prisma
model ProjectWikiItem {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId                String   @map("project_id") @db.Uuid
  sourceTaskId             String   @map("source_task_id") @db.Uuid
  sourceReviewRecordId     String   @unique @map("source_review_record_id") @db.Uuid
  sourceWorkSummaryDraftId String   @map("source_work_summary_draft_id") @db.Uuid
  commonCandidateRecordId  String?  @unique @map("common_candidate_record_id") @db.Uuid
  title                    String
  summary                  String
  bodyMarkdown             String   @map("body_markdown")
  tags                     Json     @default("[]")
  supplementalNote         String   @default("") @map("supplemental_note")
  aiSuitabilityState       String   @map("ai_suitability_state")
  aiSuitabilityReason      String   @default("") @map("ai_suitability_reason")
  commonizationCaution     String   @default("") @map("commonization_caution")
  status                   String   @default("active")
  createdBy                String   @map("created_by") @db.Uuid
  disabledBy               String?  @map("disabled_by") @db.Uuid
  disabledAt               DateTime? @map("disabled_at") @db.Timestamptz(6)
  restoredBy               String?  @map("restored_by") @db.Uuid
  restoredAt               DateTime? @map("restored_at") @db.Timestamptz(6)
  createdAt                DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project                  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sourceTask               Task     @relation("ProjectWikiSourceTask", fields: [projectId, sourceTaskId], references: [projectId, id], onDelete: Cascade)
  sourceReviewRecord       AssistantTaskRecord @relation("ProjectWikiSourceReviewRecord", fields: [projectId, sourceReviewRecordId], references: [projectId, id], onDelete: Restrict)
  sourceWorkSummaryDraft   AssistantWorkSummaryDraft @relation(fields: [projectId, sourceWorkSummaryDraftId], references: [projectId, id], onDelete: Restrict)
  /// DB invariant: migration enforces the common candidate relation as a scoped composite FK
  /// with ON DELETE SET NULL for common_candidate_record_id only. Prisma cannot express
  /// column-list SetNull when projectId is shared and required, so NoAction mirrors the scope.
  commonCandidateRecord    AssistantTaskRecord? @relation("ProjectWikiCommonCandidateRecord", fields: [projectId, commonCandidateRecordId], references: [projectId, id], onDelete: NoAction)
  creator                  Profile @relation("ProjectWikiCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  disabler                 Profile? @relation("ProjectWikiDisabledBy", fields: [disabledBy], references: [id], onDelete: SetNull)
  restorer                 Profile? @relation("ProjectWikiRestoredBy", fields: [restoredBy], references: [id], onDelete: SetNull)
  actionLogs               ProjectWikiActionLog[]

  @@unique([projectId, id])
  @@index([projectId, status, updatedAt])
  @@index([sourceTaskId, createdAt])
  @@map("project_wiki_items")
}

model ProjectWikiActionLog {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId         String   @map("project_id") @db.Uuid
  projectWikiItemId String   @map("project_wiki_item_id") @db.Uuid
  action            String
  actorProfileId    String   @map("actor_profile_id") @db.Uuid
  actorDisplay      String   @default("") @map("actor_display")
  reason            String   @default("")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  item              ProjectWikiItem @relation(fields: [projectId, projectWikiItemId], references: [projectId, id], onDelete: Cascade)
  actor             Profile @relation("ProjectWikiActionLogActor", fields: [actorProfileId], references: [id], onDelete: Restrict)

  @@index([projectId, projectWikiItemId, createdAt])
  @@index([actorProfileId, createdAt])
  @@map("project_wiki_action_logs")
}
```

- [ ] **Step 4: Add SQL migration**

Create `prisma/migrations/202606240001_add_project_wiki/migration.sql` with SQL matching the Prisma schema. Include project-scoped composite foreign keys so project WIKI lineage cannot cross project boundaries:

```sql
alter table "assistant_task_records"
  add column if not exists "review_deleted_at" timestamptz,
  add column if not exists "review_deleted_by" uuid,
  add column if not exists "review_restored_at" timestamptz,
  add column if not exists "review_restored_by" uuid;

create unique index if not exists "assistant_task_records_project_id_id_key"
  on "assistant_task_records" ("project_id", "id");

create unique index if not exists "assistant_work_summary_drafts_project_id_id_key"
  on "assistant_work_summary_drafts" ("project_id", "id");

create table if not exists "project_wiki_items" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "source_task_id" uuid not null,
  "source_review_record_id" uuid not null unique,
  "source_work_summary_draft_id" uuid not null,
  "common_candidate_record_id" uuid unique,
  "title" text not null,
  "summary" text not null,
  "body_markdown" text not null,
  "tags" jsonb not null default '[]'::jsonb,
  "supplemental_note" text not null default '',
  "ai_suitability_state" text not null,
  "ai_suitability_reason" text not null default '',
  "commonization_caution" text not null default '',
  "status" text not null default 'active',
  "created_by" uuid not null references "profiles"("id") on delete restrict,
  "disabled_by" uuid references "profiles"("id") on delete set null,
  "disabled_at" timestamptz,
  "restored_by" uuid references "profiles"("id") on delete set null,
  "restored_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "project_wiki_items_source_task_fk"
    foreign key ("project_id", "source_task_id") references "tasks"("project_id", "id") on delete cascade,
  constraint "project_wiki_items_source_review_fk"
    foreign key ("project_id", "source_review_record_id") references "assistant_task_records"("project_id", "id") on delete restrict,
  constraint "project_wiki_items_source_work_summary_fk"
    foreign key ("project_id", "source_work_summary_draft_id") references "assistant_work_summary_drafts"("project_id", "id") on delete restrict,
  constraint "project_wiki_items_common_candidate_fk"
    foreign key ("project_id", "common_candidate_record_id") references "assistant_task_records"("project_id", "id") on delete set null ("common_candidate_record_id"),
  constraint "project_wiki_items_status_check" check ("status" in ('active', 'disabled')),
  constraint "project_wiki_items_suitability_check" check ("ai_suitability_state" in ('recommended', 'caution', 'not_recommended'))
);

create unique index if not exists "project_wiki_items_project_id_id_key"
  on "project_wiki_items" ("project_id", "id");

create index if not exists "project_wiki_items_project_status_updated_idx"
  on "project_wiki_items" ("project_id", "status", "updated_at");

create index if not exists "project_wiki_items_source_task_created_idx"
  on "project_wiki_items" ("source_task_id", "created_at");

create table if not exists "project_wiki_action_logs" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "project_wiki_item_id" uuid not null,
  "action" text not null,
  "actor_profile_id" uuid not null references "profiles"("id") on delete restrict,
  "actor_display" text not null default '',
  "reason" text not null default '',
  "created_at" timestamptz not null default now(),
  constraint "project_wiki_action_logs_item_fk"
    foreign key ("project_id", "project_wiki_item_id") references "project_wiki_items"("project_id", "id") on delete cascade,
  constraint "project_wiki_action_logs_action_check" check ("action" in ('disable', 'restore'))
);

create index if not exists "project_wiki_action_logs_item_created_idx"
  on "project_wiki_action_logs" ("project_id", "project_wiki_item_id", "created_at");

create index if not exists "project_wiki_action_logs_actor_created_idx"
  on "project_wiki_action_logs" ("actor_profile_id", "created_at");
```

- [ ] **Step 5: Add domain and repository contracts**

Create `src/repositories/project-wiki/contracts.ts`:

```ts
import type {
  ProjectWikiActionLog,
  ProjectWikiDraft,
  ProjectWikiItem,
  ProjectWikiStatus,
} from "@/domains/project-wiki/types";
import type { AssistantEvidence } from "@/domains/assistant/types";

export type ProjectWikiListInput = {
  projectId: string;
  query?: string;
  includeDisabled?: boolean;
  limit?: number;
};

export type ProjectWikiRegistrationPreviewInput = {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  actorProfileId: string;
};

export type ProjectWikiRegistrationInput = ProjectWikiRegistrationPreviewInput & {
  draft: ProjectWikiDraft;
  supplementalNote: string;
};

export type ProjectWikiStatusInput = {
  projectId: string;
  itemId: string;
  status: ProjectWikiStatus;
  actorProfileId: string;
  actorDisplay: string;
  reason: string;
};

export type ProjectWikiAssistantSearchInput = {
  projectId: string;
  query: string;
  limit?: number;
};

export type ProjectWikiRepository = {
  listProjectWikiItems(input: ProjectWikiListInput): Promise<ProjectWikiItem[]>;
  getProjectWikiItem(input: { projectId: string; itemId: string }): Promise<(ProjectWikiItem & { actionLogs: ProjectWikiActionLog[] }) | null>;
  findProjectWikiBySourceReviewRecord(input: { projectId: string; sourceReviewRecordId: string }): Promise<ProjectWikiItem | null>;
  registerProjectWiki(input: ProjectWikiRegistrationInput): Promise<ProjectWikiItem>;
  setProjectWikiStatus(input: ProjectWikiStatusInput): Promise<ProjectWikiItem>;
  searchProjectWikiForAssistant(input: ProjectWikiAssistantSearchInput): Promise<AssistantEvidence[]>;
};
```

- [ ] **Step 6: Add package scripts**

Update `package.json`:

```json
"project-wiki:validate": "tsx scripts/project-wiki-contract-validate.ts",
"project-wiki:behavior:validate": "tsx scripts/project-wiki-behavior-validate.ts",
"project-wiki:preview-smoke": "tsx scripts/project-wiki-preview-smoke.ts"
```

- [ ] **Step 7: Generate Prisma client and rerun contract validation**

Run:

```powershell
npm run db:generate
npm run project-wiki:validate
```

Expected:

```text
project-wiki-contract-validate: ok
```

- [ ] **Step 8: Commit data contracts**

Run:

```powershell
git add prisma\schema.prisma prisma\migrations\202606240001_add_project_wiki\migration.sql src\domains\project-wiki src\repositories\project-wiki package.json scripts\project-wiki-contract-validate.ts
git commit -m "feat: add project wiki data contracts"
```

## Task 2: Temporary Review Auto-Save And Delete/Restore

**Owner:** Agent B

**Files:**
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Modify: `src/use-cases/task-review-service.ts`
- Modify: `src/app/api/assistant/review-sessions/route.ts`
- Modify: `src/app/api/assistant/review-sessions/[sessionId]/route.ts`
- Create: `src/app/api/assistant/review-sessions/[sessionId]/restore/route.ts`
- Modify: `scripts/task-assistant-unified-contract-validate.ts`

- [ ] **Step 1: Extend assistant repository contract**

Add these methods to `AssistantRepository`:

```ts
  softDeleteReviewSession(input: {
    projectId: string;
    recordId: string;
    profileId: string;
  }): Promise<AssistantRecord>;
  restoreReviewSession(input: {
    projectId: string;
    recordId: string;
    profileId: string;
  }): Promise<AssistantRecord>;
  updateReviewSessionMetadata(input: {
    projectId: string;
    recordId: string;
    metadata: AssistantRecordMetadata;
  }): Promise<AssistantRecord>;
```

- [ ] **Step 2: Implement soft delete/restore in stores**

Postgres behavior:

- `softDeleteReviewSession` updates `reviewDeletedAt` and `reviewDeletedBy`.
- `restoreReviewSession` clears `reviewDeletedAt` and `reviewDeletedBy`, sets `reviewRestoredAt` and `reviewRestoredBy`.
- Both methods filter by `id` and `projectId`.
- Both methods leave `AssistantWorkSummaryDraft`, project wiki, and common candidate records untouched.

Local store behavior mirrors the same fields on the in-memory record object.

- [ ] **Step 3: Update task-review service semantics**

Change `saveTaskReviewSessionRecord` metadata:

```ts
savedBy: "auto",
reviewRecordKind: "temporary",
```

Change `isSavedTaskReviewRecord`:

```ts
function isSavedTaskReviewRecord(record: AssistantRecord) {
  const taskReview = record.metadata.taskReview;
  return (
    taskReview?.source === "assistant-task-review" &&
    (taskReview.savedBy === "auto" || taskReview.savedBy === "user") &&
    !record.reviewDeletedAt
  );
}
```

Change `listTaskReviewSessions` to return `.slice(0, 6)`.

Add service functions:

```ts
export async function deleteTaskReviewSession(sessionId: string, user: AuthUser) {
  const record = await findSavedTaskReviewRecordIncludingDeleted(sessionId);
  await requireTaskInSelectedProject(record.taskId);
  return toTaskReviewSessionSummary(
    await assistantRepository.softDeleteReviewSession({
      projectId: record.projectId,
      recordId: record.id,
      profileId: user.id,
    }),
  );
}

export async function restoreTaskReviewSession(sessionId: string, user: AuthUser) {
  const record = await findSavedTaskReviewRecordIncludingDeleted(sessionId);
  await requireTaskInSelectedProject(record.taskId);
  return toTaskReviewSessionSummary(
    await assistantRepository.restoreReviewSession({
      projectId: record.projectId,
      recordId: record.id,
      profileId: user.id,
    }),
  );
}
```

- [ ] **Step 4: Add DELETE and restore routes**

In `src/app/api/assistant/review-sessions/[sessionId]/route.ts`, add:

```ts
export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { sessionId } = await context.params;
    const data = await deleteTaskReviewSession(sessionId, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

Create `src/app/api/assistant/review-sessions/[sessionId]/restore/route.ts`:

```ts
import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { restoreTaskReviewSession } from "@/use-cases/task-review-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { sessionId } = await context.params;
    const data = await restoreTaskReviewSession(sessionId, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 5: Update validator**

Add checks to `scripts/task-assistant-unified-contract-validate.ts`:

```ts
assertIncludes(panelContent, "임시 검토 기록", "temporary review record label");
assertIncludes(panelContent, "임시 기록 자동저장됨", "auto-save success badge");
assertIncludes(panelContent, "저장 실패 · 다시 시도", "auto-save retry copy");
assertExcludes(panelContent, "검토기록저장", "manual review save action removed");
assertIncludes(routeContent, "DELETE", "review session delete route");
```

- [ ] **Step 6: Run validation**

Run:

```powershell
npm run task-assistant:unified:validate
```

Expected: existing task assistant validation passes with the new auto-save assertions.

- [ ] **Step 7: Commit temporary review API work**

Run:

```powershell
git add src\repositories\assistant src\use-cases\task-review-service.ts src\app\api\assistant\review-sessions scripts\task-assistant-unified-contract-validate.ts
git commit -m "feat: support temporary review auto-save records"
```

## Task 3: Project WIKI Service, Suitability, And Atomic Registration

**Owner:** Agent C

**Files:**
- Create: `src/use-cases/project-wiki-service.ts`
- Create: `src/use-cases/project-wiki-suitability-service.ts`
- Create: `src/repositories/project-wiki/postgres-store.ts`
- Create: `src/repositories/project-wiki/local-store.ts`
- Create: `src/app/api/projects/[projectId]/project-wiki/registration-preview/route.ts`
- Create: `src/app/api/projects/[projectId]/project-wiki/route.ts`
- Create: `src/app/api/projects/[projectId]/project-wiki/[itemId]/route.ts`
- Create: `src/app/api/projects/[projectId]/project-wiki/[itemId]/status/route.ts`
- Create: `scripts/project-wiki-behavior-validate.ts`

- [ ] **Step 1: Write behavior validator**

Create `scripts/project-wiki-behavior-validate.ts`:

```ts
import assert from "node:assert/strict";
import {
  matchesProjectWikiKeyword,
  normalizeProjectWikiKeyword,
  projectWikiStatusLabel,
  suitabilityBadgeTone,
} from "../src/domains/project-wiki/search";

assert.equal(normalizeProjectWikiKeyword("  방화 구획  "), "방화 구획");
assert.equal(normalizeProjectWikiKeyword(""), "");

assert.equal(
  matchesProjectWikiKeyword(
    {
      title: "피난계단 방화문 기준",
      summary: "계단실 방화문 확인",
      bodyMarkdown: "피난 동선과 방화구획을 함께 본다.",
      tags: ["피난", "방화"],
      supplementalNote: "현장 협의사항",
    },
    "방화구획",
  ),
  true,
);

assert.equal(projectWikiStatusLabel("active"), "활성");
assert.equal(projectWikiStatusLabel("disabled"), "비활성");
assert.equal(suitabilityBadgeTone("recommended"), "green");
assert.equal(suitabilityBadgeTone("caution"), "amber");
assert.equal(suitabilityBadgeTone("not_recommended"), "gray");

console.log("project-wiki-behavior-validate: ok");
```

- [ ] **Step 2: Implement domain search helpers**

Create `src/domains/project-wiki/search.ts`:

```ts
import type { ProjectWikiStatus, ProjectWikiSuitabilityState } from "@/domains/project-wiki/types";

export function normalizeProjectWikiKeyword(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function matchesProjectWikiKeyword(
  item: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    tags: string[];
    supplementalNote: string;
  },
  keyword: string,
) {
  const normalized = normalizeProjectWikiKeyword(keyword).toLocaleLowerCase("ko-KR");
  if (!normalized) {
    return true;
  }
  const haystack = [
    item.title,
    item.summary,
    item.bodyMarkdown,
    item.tags.join(" "),
    item.supplementalNote,
  ].join("\n").toLocaleLowerCase("ko-KR");
  return haystack.includes(normalized);
}

export function projectWikiStatusLabel(status: ProjectWikiStatus) {
  return status === "active" ? "활성" : "비활성";
}

export function suitabilityBadgeTone(state: ProjectWikiSuitabilityState) {
  if (state === "recommended") {
    return "green" as const;
  }
  if (state === "caution") {
    return "amber" as const;
  }
  return "gray" as const;
}
```

- [ ] **Step 3: Implement AI suitability service**

Create `src/use-cases/project-wiki-suitability-service.ts`.

Required exported functions:

```ts
export async function evaluateProjectWikiSuitability(input: {
  projectId: string;
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
  userId: string;
}): Promise<ProjectWikiDraft>

export function buildDeterministicProjectWikiDraft(input: {
  taskTitle: string;
  approvedConclusion: string;
  approvedScope: string;
  approvedFollowUpAction: string;
  evidenceTitles: string[];
}): ProjectWikiDraft
```

Rules:

- Use existing assistant run policy and `runAssistantProvider` when policy provider is live.
- Return JSON with `state`, `reason`, `title`, `summary`, `bodyMarkdown`, `tags`, and `commonizationCaution`.
- If provider is mock or disabled, use `buildDeterministicProjectWikiDraft`.
- Clamp title to 80 chars, summary to 220 chars, body to 2400 chars, reason to 160 chars, caution to 180 chars, and tags to 8 values.
- Map Korean UI states to storage states: `추천` -> `recommended`, `주의` -> `caution`, `비추천` -> `not_recommended`.

- [ ] **Step 4: Implement atomic registration in Postgres repository**

`registerProjectWiki` must run a single `prisma.$transaction`.

Transaction sequence:

1. Load source review record by `sourceReviewRecordId` and `projectId`.
2. Load approved work summary draft by `sourceWorkSummaryDraftId`, `recordId`, and `status: "approved"`.
3. Return existing `ProjectWikiItem` if `sourceReviewRecordId` already exists.
4. Create common candidate `AssistantTaskRecord` with `candidateState: "candidate"`, `cleanupState: "draft"`, `runtimeMode: "project-wiki-registration"`, and metadata:

```ts
metadata: {
  commonWikiCandidate: {
    source: "project-wiki",
    sourceProjectWikiStatus: "active",
    sourceReviewRecordId,
    sourceWorkSummaryDraftId,
    supplementalNote,
    aiSuitabilityState: draft.aiSuitabilityState,
    aiSuitabilityReason: draft.aiSuitabilityReason,
    commonizationCaution: draft.commonizationCaution,
    projectSpecificContext: true,
  },
}
```

5. Create `ProjectWikiItem` linked to the common candidate record id.
6. Update source review record metadata with `projectWiki.registrationState: "registered"`.
7. Return mapped `ProjectWikiItem`.

Failure rule: any error in steps 1-6 rolls back the common candidate and project wiki item.

- [ ] **Step 5: Implement use-case permissions**

`src/use-cases/project-wiki-service.ts` must expose:

```ts
export async function listProjectWiki(input: {
  projectId: string;
  query?: string;
  includeDisabled?: boolean;
  user: AuthUser;
})

export async function getProjectWikiDetail(input: {
  projectId: string;
  itemId: string;
  user: AuthUser;
})

export async function buildProjectWikiRegistrationPreview(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  user: AuthUser;
})

export async function registerProjectWiki(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  supplementalNote?: string;
  user: AuthUser;
})

export async function setProjectWikiStatus(input: {
  projectId: string;
  itemId: string;
  action: "disable" | "restore";
  reason?: string;
  user: AuthUser;
})
```

Every function must call `requireProjectAccess(user, projectId)` or the existing project-context access helper used by materials APIs. No function may require top-level admin.

- [ ] **Step 6: Add project WIKI API routes**

Route behavior:

- `GET /api/projects/[projectId]/project-wiki?query=&includeDisabled=1`: list keyword matches.
- `POST /api/projects/[projectId]/project-wiki/registration-preview`: return read-only preview.
- `POST /api/projects/[projectId]/project-wiki`: register project wiki and linked common candidate.
- `GET /api/projects/[projectId]/project-wiki/[itemId]`: detail with logs.
- `PATCH /api/projects/[projectId]/project-wiki/[itemId]/status`: body `{ "action": "disable" | "restore", "reason": "optional" }`.

All write routes must call `assertRequestIntegrity(request)`.

- [ ] **Step 7: Validate behavior**

Run:

```powershell
npm run project-wiki:behavior:validate
npm run project-wiki:validate
```

Expected:

```text
project-wiki-behavior-validate: ok
project-wiki-contract-validate: ok
```

- [ ] **Step 8: Commit service layer**

Run:

```powershell
git add src\domains\project-wiki src\repositories\project-wiki src\use-cases\project-wiki-service.ts src\use-cases\project-wiki-suitability-service.ts src\app\api\projects scripts\project-wiki-behavior-validate.ts
git commit -m "feat: register project wiki from approved reviews"
```

## Task 4: Retrieval Integration And Evidence Badges

**Owner:** Agent D

**Files:**
- Modify: `src/domains/assistant/types.ts`
- Modify: `src/use-cases/assistant-service.ts`
- Modify: `src/use-cases/task-review-service.ts`
- Modify: `src/components/tasks/task-assistant-panel.tsx`
- Modify: `src/app/api/assistant/retrieve/route.ts`
- Modify: `scripts/task-review-orchestrator-validate.ts`
- Modify: `scripts/project-wiki-behavior-validate.ts`

- [ ] **Step 1: Extend assistant evidence kind**

In `src/domains/assistant/types.ts`, add `project_wiki` to `AssistantEvidence["kind"]`.

Update every normalizer that currently accepts:

```ts
"central_knowledge" | "regulation" | "task" | "project_document" | "web_or_skill"
```

to also accept:

```ts
"project_wiki"
```

- [ ] **Step 2: Add active project wiki retrieval**

In `retrieveAssistantEvidence`, extend the Promise group:

```ts
const [tasks, files, previousRecords, externalEvidence, approvedKnowledge, projectWikiEvidence] = await Promise.all([
  taskRepository.listActiveTasks(project.id),
  fileRepository.listFilesByTask(task.id),
  assistantRepository.listRecordsByTask(task.id),
  assistantRepository.listExternalEvidenceByTask(task.id),
  assistantRepository.searchApprovedKnowledge({ projectId: project.id, query: retrievalQuery, limit: 4 }),
  projectWikiRepository.searchProjectWikiForAssistant({ projectId: project.id, query: retrievalQuery, limit: 4 }),
]);
```

Add `projectWikiEvidence` to `buildEvidence` input and merge it before common WIKI:

```ts
const evidence: AssistantEvidence[] = [
  ...input.projectWikiEvidence,
  ...input.approvedKnowledge.map((item) => ({
    id: `approved-knowledge:${item.id}`,
    kind: "central_knowledge" as const,
    priority: 2,
    title: item.title,
    excerpt: compactExcerpt([item.summary, item.bodyMarkdown]),
    recordId: item.sourceRecordId,
    confidenceWeight: 0.86,
  })),
];
```

Project wiki evidence uses:

```ts
{
  id: `project-wiki:${item.id}`,
  kind: "project_wiki",
  priority: 1,
  title: item.title,
  excerpt: compactExcerpt([item.summary, item.bodyMarkdown, item.supplementalNote]),
  recordId: item.id,
  confidenceWeight: 0.84,
}
```

- [ ] **Step 3: Exclude disabled project wiki**

`projectWikiRepository.searchProjectWikiForAssistant` must filter `status === "active"` only. Do not accept an `includeDisabled` flag for assistant retrieval.

- [ ] **Step 4: Update visible evidence badges**

Update Task Assistant badge mapping:

```ts
function evidenceKindLabel(kind: AssistantEvidence["kind"]) {
  switch (kind) {
    case "project_wiki":
      return "프로젝트 WIKI";
    case "central_knowledge":
      return "공용 WIKI";
    case "task":
      return "task";
    case "project_document":
      return "도면/문서";
    case "regulation":
      return "법규";
    case "web_or_skill":
      return "외부";
  }
}
```

Keep answer composition natural. Do not create large separate answer sections named `프로젝트 WIKI` and `공용 WIKI`; show source type only in evidence badges and citations.

- [ ] **Step 5: Validate retrieval contract**

Extend `scripts/project-wiki-behavior-validate.ts` with:

```ts
import { evidenceKindSourceBadge } from "../src/domains/project-wiki/search";

assert.equal(evidenceKindSourceBadge("project_wiki"), "프로젝트 WIKI");
assert.equal(evidenceKindSourceBadge("central_knowledge"), "공용 WIKI");
```

Run:

```powershell
npm run project-wiki:behavior:validate
npm run task-review:validate
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit retrieval work**

Run:

```powershell
git add src\domains\assistant\types.ts src\use-cases\assistant-service.ts src\use-cases\task-review-service.ts src\components\tasks\task-assistant-panel.tsx src\app\api\assistant\retrieve\route.ts scripts\task-review-orchestrator-validate.ts scripts\project-wiki-behavior-validate.ts
git commit -m "feat: include active project wiki in assistant retrieval"
```

## Task 5: Task Assistant UX

**Owner:** Agent E

**Files:**
- Modify: `src/components/tasks/task-assistant-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/preview/assistant/preview-client.tsx`
- Modify: `scripts/task-assistant-unified-contract-validate.ts`

- [ ] **Step 1: Add client state machine**

Add state:

```ts
type AutoSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; sessionId: string }
  | { status: "failed"; message: string; retryPayload: SaveReviewSessionPayload };

type ProjectWikiPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: ProjectWikiRegistrationPreview }
  | { status: "registered"; item: ProjectWikiItem }
  | { status: "failed"; message: string };
```

- [ ] **Step 2: Trigger auto-save after generation**

After `근거 조회 + 의견 생성` succeeds and `output` is set, call the existing review-session `POST` endpoint with the generated output. Use the same generated answer. Do not regenerate on retry.

Badge copy:

```ts
const autoSaveLabel = {
  idle: "",
  saving: "저장 중",
  saved: "임시 기록 자동저장됨",
  failed: "저장 실패 · 다시 시도",
};
```

- [ ] **Step 3: Rename and trim history section**

Change `최근 검토 기록` to `임시 검토 기록`.

List behavior:

- show newest 6 records.
- show `작업기록 승인됨` if `savedRecord.cleanupState === "approved"`.
- show `프로젝트wiki 등록됨` when `projectWikiState.registrationState === "registered"`.
- each row has a small delete icon button with accessible label `임시 검토 기록 삭제`.

- [ ] **Step 4: Add delete and undo toast**

Delete handler:

```ts
async function deleteReviewSession(session: AssistantReviewSessionItem) {
  const deleted = await fetch(`/api/assistant/review-sessions/${session.id}`, {
    method: "DELETE",
    headers: { "x-architect-request-intent": "mutate" },
  });
  if (!deleted.ok) {
    setStatus("임시 검토 기록을 삭제하지 못했습니다.");
    return;
  }
  removeSessionFromList(session.id);
  showUndoToast({
    message: session.projectWikiState?.projectWikiItemId
      ? "임시 검토 기록을 삭제했습니다. 연결된 프로젝트wiki와 공용wiki 후보는 유지됩니다."
      : "임시 검토 기록을 삭제했습니다.",
    actionLabel: "되돌리기",
    onAction: () => restoreReviewSession(session.id),
  });
}
```

Restore handler calls:

```ts
POST /api/assistant/review-sessions/${sessionId}/restore
```

- [ ] **Step 5: Keep approval editor collapsed by default**

The prior UX decision remains:

- default view shows 검토 의견 and draft summary preview only.
- 결론 / 적용 범위 / 후속 조치 / 태그 open when the user clicks `작업 기록 승인 준비` or `요약 수정`.
- primary action row contains only `근거 조회 + 의견 생성` and `작업 기록 승인`.

- [ ] **Step 6: Add project wiki preview panel after approval**

After `작업 기록 승인` succeeds:

1. Store returned approved summary draft id.
2. Call `POST /api/projects/${projectId}/project-wiki/registration-preview`.
3. Show small suitability badge:
   - `추천`: green
   - `주의`: amber
   - `비추천`: gray
4. Show `프로젝트wiki로 등록` only for `recommended` and `caution`.
5. Show read-only title, summary, body, tags, and commonization caution.
6. Keep supplemental note collapsed behind `보완 메모 추가`.

Helper copy:

```text
프로젝트wiki로 즉시 등록되고, 공용wiki 후보 검토에도 올라갑니다.
```

- [ ] **Step 7: Register project wiki**

Button handler posts:

```ts
POST /api/projects/${projectId}/project-wiki
{
  sourceReviewRecordId,
  sourceWorkSummaryDraftId,
  supplementalNote
}
```

Success state:

- set preview state to `registered`.
- update matching temporary record row with `프로젝트wiki 등록됨`.
- show common candidate link/status if returned.

Repeated click behavior: if API returns existing item, display it as registered without error.

- [ ] **Step 8: Preview mocks**

Update `src/app/preview/assistant/preview-client.tsx` mocked fetch handling for:

- `POST /api/assistant/review-sessions`
- `DELETE /api/assistant/review-sessions/:id`
- `POST /api/assistant/review-sessions/:id/restore`
- `POST /api/projects/:projectId/project-wiki/registration-preview`
- `POST /api/projects/:projectId/project-wiki`

- [ ] **Step 9: Validate Task Assistant UI contracts**

Run:

```powershell
npm run task-assistant:unified:validate
npm run typecheck
```

Expected: both pass.

- [ ] **Step 10: Commit Task Assistant UX**

Run:

```powershell
git add src\components\tasks\task-assistant-panel.tsx src\app\globals.css src\app\preview\assistant\preview-client.tsx scripts\task-assistant-unified-contract-validate.ts
git commit -m "feat: auto-save task assistant reviews and register project wiki"
```

## Task 6: Project Materials `프로젝트 WIKI` Page

**Owner:** Agent F

**Files:**
- Modify: `src/components/project-context/project-materials-page.tsx`
- Modify: `src/components/project-context/project-materials-page.module.css`
- Create: `src/components/project-context/project-wiki-page.tsx`
- Create: `scripts/project-wiki-preview-smoke.ts`

- [ ] **Step 1: Add segmented view to Project Materials**

In `ProjectMaterialsPage`, add:

```ts
const [view, setView] = useState<"materials" | "wiki">(
  new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("view") === "wiki"
    ? "wiki"
    : "materials",
);
```

Render compact segmented controls:

```tsx
<div className={styles.viewTabs} role="tablist" aria-label="프로젝트 자료 보기">
  <button aria-selected={view === "materials"} onClick={() => setView("materials")} role="tab" type="button">
    자료
  </button>
  <button aria-selected={view === "wiki"} onClick={() => setView("wiki")} role="tab" type="button">
    프로젝트 WIKI
  </button>
</div>
```

When `view === "wiki"`, render:

```tsx
<ProjectWikiPage preview={preview} projectId={currentProjectId} />
```

- [ ] **Step 2: Implement project wiki page**

`ProjectWikiPage` must include:

- keyword input hint text `키워드 검색`
- `비활성 포함` checkbox
- active/disabled small status badge
- source task
- creator
- created date
- common candidate status
- detail panel with body, supplemental note, AI suitability, commonization caution, action logs, disable/restore controls
- optional reason input inside the disable/restore control area

Do not split results by status. Use badges only.

- [ ] **Step 3: Add API calls**

List call:

```ts
GET /api/projects/${projectId}/project-wiki?query=${encodeURIComponent(query)}&includeDisabled=${includeDisabled ? "1" : "0"}
```

Detail call:

```ts
GET /api/projects/${projectId}/project-wiki/${itemId}
```

Status call:

```ts
PATCH /api/projects/${projectId}/project-wiki/${itemId}/status
{
  "action": "disable",
  "reason": reason
}
```

Restore uses `"action": "restore"`.

- [ ] **Step 4: Add preview smoke script**

Create `scripts/project-wiki-preview-smoke.ts`:

```ts
import { chromium } from "playwright";

const url = process.env.PROJECT_WIKI_SMOKE_URL ?? "http://localhost:3000/preview/materials?view=wiki";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "프로젝트 WIKI" }).click();
await page.getByPlaceholder("키워드 검색").fill("방화");
await page.getByLabel("비활성 포함").check();
await page.screenshot({ path: "test-results/project-wiki-preview-smoke.png", fullPage: true });
await browser.close();

console.log("project-wiki-preview-smoke: ok");
```

- [ ] **Step 5: Validate UI**

Run local dev server:

```powershell
npm run dev
```

In another shell:

```powershell
npm run project-wiki:preview-smoke
npm run typecheck
```

Expected:

```text
project-wiki-preview-smoke: ok
```

- [ ] **Step 6: Commit project materials UI**

Run:

```powershell
git add src\components\project-context scripts\project-wiki-preview-smoke.ts
git commit -m "feat: add project wiki materials page"
```

## Task 7: Common WIKI Candidate Integration

**Owner:** Agent G

**Files:**
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `scripts/structured-knowledge-ui-contract-validate.ts`
- Modify: `src/repositories/project-wiki/postgres-store.ts`

- [ ] **Step 1: Preserve common candidate when project wiki is disabled**

`setProjectWikiStatus` must update project wiki status and action log only. It must not delete, reject, approve, or mutate the linked common candidate state.

When disabling or restoring, update only candidate metadata field:

```ts
commonWikiCandidate: {
  ...existing.commonWikiCandidate,
  sourceProjectWikiStatus: nextStatus,
}
```

- [ ] **Step 2: Return source-disabled marker in admin candidates**

In admin candidate mapping, read:

```ts
const sourceProjectWikiStatus = record.metadata.commonWikiCandidate?.sourceProjectWikiStatus;
```

Expose:

```ts
sourceProjectWiki: {
  itemId: record.metadata.commonWikiCandidate?.sourceProjectWikiItemId ?? null,
  status: sourceProjectWikiStatus === "disabled" ? "disabled" : "active",
}
```

- [ ] **Step 3: Render small badge**

In `KnowledgeAdminShell`, show a small badge only when status is disabled:

```tsx
{candidate.sourceProjectWiki?.status === "disabled" ? (
  <span className={styles.sourceDisabledBadge}>원본 비활성화됨</span>
) : null}
```

CSS:

```css
.sourceDisabledBadge {
  background: rgba(176, 82, 0, 0.12);
  border: 1px solid rgba(176, 82, 0, 0.28);
  border-radius: 999px;
  color: #8a3f00;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.18rem 0.42rem;
}
```

- [ ] **Step 4: Validate admin UI contract**

Add to `scripts/structured-knowledge-ui-contract-validate.ts`:

```ts
assertIncludes(shellSource, "원본 비활성화됨", "disabled source project wiki badge");
assertIncludes(shellCss, "sourceDisabledBadge", "disabled source project wiki badge css");
```

Run:

```powershell
npm run structured-knowledge:ui-contract:validate
npm run project-wiki:validate
```

Expected: both pass.

- [ ] **Step 5: Commit common candidate integration**

Run:

```powershell
git add src\use-cases\admin\knowledge-service.ts src\components\admin\knowledge-admin-shell.tsx src\components\admin\knowledge-admin-shell.module.css scripts\structured-knowledge-ui-contract-validate.ts src\repositories\project-wiki\postgres-store.ts
git commit -m "feat: mark disabled project wiki sources on common candidates"
```

## Task 8: Final Verification And Worklog

**Owner:** Agent H

**Files:**
- Create: `docs/worklogs/2026-06-24-task-assistant-autosave-project-wiki-implementation.md`

- [ ] **Step 1: Run static validators**

Run:

```powershell
npm run project-wiki:validate
npm run project-wiki:behavior:validate
npm run task-assistant:unified:validate
npm run structured-knowledge:ui-contract:validate
npm run task-review:validate
npm run project-context:validate
```

Expected: all scripts exit 0.

- [ ] **Step 2: Run type/lint/build**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: all scripts exit 0.

- [ ] **Step 3: Run local browser smoke**

Start dev server:

```powershell
npm run dev
```

Run smoke:

```powershell
npm run project-wiki:preview-smoke
```

Expected:

```text
project-wiki-preview-smoke: ok
```

- [ ] **Step 4: Write implementation worklog**

Create `docs/worklogs/2026-06-24-task-assistant-autosave-project-wiki-implementation.md`:

```markdown
Req: Task Assistant auto-save temporary review records and project wiki registration
Diff: Added project wiki domain/repository/API/UI, temporary review auto-save/delete/restore, retrieval integration, common candidate source badge
Why: Prevent review loss, separate temporary records from work approval, and keep project-scoped wiki distinct from common wiki approval
Verify: npm run project-wiki:validate; npm run project-wiki:behavior:validate; npm run task-assistant:unified:validate; npm run structured-knowledge:ui-contract:validate; npm run task-review:validate; npm run project-context:validate; npm run typecheck; npm run lint; npm run build; npm run project-wiki:preview-smoke
```

- [ ] **Step 5: Commit verification artifacts**

Run:

```powershell
git add docs\worklogs\2026-06-24-task-assistant-autosave-project-wiki-implementation.md
git commit -m "docs: record project wiki implementation verification"
```

## Task 9: Preview Deployment Verification

**Owner:** Coordinator

Run this task only after the user asks for push/deploy verification.

- [ ] **Step 1: Verify branch parity after push**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/codex/multi-user-transition
```

Expected: `HEAD` equals `origin/codex/multi-user-transition`.

- [ ] **Step 2: Verify Preview deployment**

Use the existing workspace deployment policy: Preview by default, not production.

Proof required in final deployment report:

- repo: `architect-saas`
- branch: `codex/multi-user-transition`
- local SHA
- remote SHA
- deployment id or URL
- alias URL if used
- smoke route: `/preview/materials?view=wiki` and `/preview/daily`
- HTTP status or browser smoke result
- any unverified condition

## Completion Criteria

Implementation is complete only when all conditions below are true:

- Successful generation auto-saves a temporary review record.
- Auto-save failure keeps the generated answer visible and offers retry without regenerating.
- Temporary review list shows latest 6 records and can reopen records.
- Temporary delete uses soft delete, supports undo restore, and preserves linked work approval/project wiki/common candidate artifacts.
- Work summary approval remains separate from temporary save.
- AI suitability produces `recommended`, `caution`, or `not_recommended`.
- Project wiki registration is available only for `recommended` and `caution`.
- Registration creates one project wiki and one linked common WIKI candidate atomically.
- Repeated registration clicks do not create duplicates.
- Active project wiki is retrieved by Task Assistant and shown with a small `프로젝트 WIKI` badge.
- Disabled project wiki is excluded from Task Assistant retrieval.
- `/materials` contains a `프로젝트 WIKI` view with keyword-only search and `비활성 포함`.
- Project participants can disable/restore and logs contain actor id, display/email, timestamp, action, and optional reason.
- Common WIKI candidate remains after project wiki disable and shows a small `원본 비활성화됨` badge.
- `npm run typecheck`, `npm run lint`, `npm run build`, and all feature validators pass.

## Self-Review

Spec coverage:

- Auto-save and retry: Task 2, Task 5.
- Temporary reload/delete/undo: Task 2, Task 5.
- Work approval separation: Task 2, Task 5.
- AI suitability and read-only preview: Task 3, Task 5.
- Atomic project wiki plus common candidate: Task 3.
- Project participant management page: Task 6.
- Keyword-only search and disabled toggle: Task 3, Task 6.
- Disable/restore logs: Task 3, Task 6.
- Disabled retrieval exclusion: Task 4.
- Common candidate disabled-source badge: Task 7.
- Validation and Preview proof path: Task 8, Task 9.

Type consistency:

- `recommended | caution | not_recommended` is the only stored suitability union.
- `active | disabled` is the only project wiki status union.
- `project_wiki` is the new assistant evidence kind for project-scoped wiki evidence.
- Existing `central_knowledge` remains the common WIKI evidence kind.
