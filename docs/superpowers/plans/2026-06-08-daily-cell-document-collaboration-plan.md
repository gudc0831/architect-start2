# Daily Cell Document Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `harness-engineering` in Strict mode because the work changes persistence, realtime collaboration, and Preview validation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/daily` spreadsheet cells into addressable collaborative document units so task creation, editing, navigation, and same-account multi-window use stay responsive while server persistence runs in the background.

**Architecture:** Keep `tasks` as the materialized projection used by existing task lists, filters, exports, AI review, and APIs. Add a cell-document layer per editable task field: a stable document identity, local IndexedDB update journal, realtime transport, and server-side Postgres persistence. Text-like cells use CRDT updates; scalar cells initially use the same document identity and presence model but preserve explicit validated scalar writes unless a true merge policy is defined.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/PostgreSQL, IndexedDB, BroadcastChannel, Supabase Realtime Broadcast/Presence, Yjs-compatible CRDT document model, existing `/daily` mutation journal, Vercel Preview validation.

---

## Problem-To-Solution Coverage

| Original problem | Fast fix before CRDT | Cell-document phase | Proof gate |
| --- | --- | --- | --- |
| Task create server save is slow | Instrument and optimize `/api/tasks` create stages before any migration work. Cache or remove repeated category bootstrap checks, avoid unnecessary active-task reads, and measure advisory-lock/max-number cost. | Keep `clientMutationId` and materialized `Task` projection so a cell document does not slow row creation. | `/api/tasks` timing report names the dominant stage and Preview create remains locally visible immediately. |
| Saving message stays until refresh | Clean up or hide stale `synced` journal operations, refresh the journal after ack/failure, and broadcast row-journal events to sibling windows. | Per-cell status replaces one grid-wide pending illusion for CRDT-backed fields. | `daily-sync-status` clears or becomes retryable without browser refresh after create/update/reorder. |
| Saving message blocks tab/view navigation | Change the `/daily` outside-click and `document` `pointerdown` capture path so server ack pending never blocks navigation after local IndexedDB/cell-document persistence succeeds. | CRDT text edits remain local-first; only local persistence failure can block leaving the edit context. | User can create/edit, immediately switch app tabs/views/routes, and return to a reconciled or retryable state. |
| Same login in another window does not sync like a spreadsheet | Add `BroadcastChannel` row-journal sync for same-origin windows and Supabase task realtime invalidation for remote windows/devices. | Add Yjs cell documents with BroadcastChannel, Supabase Realtime, and HTTP catch-up. | Two-window exact Preview proof shows row events and text-cell merge without manual refresh, then reload persistence. |

## Coordinator Recommendation

Use a **Yjs document model with a repo-owned provider abstraction** as the default implementation path.

Reason:

- Yjs directly matches the "cell is a collaborative document" requirement: shared types automatically merge concurrent edits without merge conflicts.
- The app already uses Supabase and Postgres. Supabase Realtime should be used as transport/invalidation, not as durable storage.
- Keeping a provider abstraction lets the project later swap the transport to Liveblocks or a hosted Hocuspocus-style service if operational load becomes the bottleneck.
- Electric/Postgres Sync and TanStack DB are good row/subset read-path sync options, but they do not replace CRDT text-cell merging by themselves.

Do not make `edit_leases` the primary editing model for CRDT-enabled text cells. Reframe leases as:

- hard lock only for scalar cells where concurrent merge semantics are not defined yet;
- soft presence/active-editor signal for text cells where CRDT merge is available;
- fallback guard when realtime transport is unavailable.

## Current Code Facts This Plan Depends On

- `/daily` already writes local-first operations into IndexedDB before optimistic create/update/reorder UI changes.
- `src/components/tasks/task-workspace.tsx` has `dailyMutationScope`, `flushDailyMutationJournal`, and `createTaskFromForm` as the main local-first path.
- `src/components/tasks/daily-mutation-journal.ts` persists create/update/trash/delete/reorder operations, but it is task-row oriented, not cell-document oriented.
- `dailyMutationStatusLabel` is derived from the daily mutation journal's `pending`/`syncing`/`failed` counts. Successful operations become `synced`, but synced cleanup and cross-window status broadcast are not strong enough today.
- `src/components/tasks/task-workspace.tsx` currently uses Supabase only for project presence; it does not subscribe to task or cell document changes.
- `src/components/tasks/task-workspace.tsx` uses a `document` `pointerdown` capture path for outside interactions. When a selected task has draft changes and `saving` or clearing is active, this path can prevent outside navigation.
- `src/providers/dashboard-provider.tsx` polls `/api/project/changes` every 12 seconds as a best-effort invalidation fallback.
- `prisma/schema.prisma` has a single `Task` row with scalar columns and an `EditLease` unique key on `(projectId, targetType, targetId, fieldKey)`.
- Existing task write APIs still accept text fields such as `issueTitle`, `issueDetailNote`, and `decision`; once those fields become cell-document backed, legacy task writes must be fenced or translated to avoid divergence.
- `package.json` currently has no `yjs`, Liveblocks, or Hocuspocus dependency.

## External Research Inputs Checked

- Yjs docs: shared types are CRDT data structures that sync automatically and merge concurrent edits without merge conflicts: https://docs.yjs.dev/
- Yjs shared types and provider update propagation: https://docs.yjs.dev/getting-started/working-with-shared-types
- Liveblocks Storage supports CRDT-like room storage and explicitly lists cells in a spreadsheet as a use case: https://liveblocks.io/docs/collaboration-features/multiplayer/sync-engine/liveblocks-storage
- Supabase Realtime Broadcast supports database-triggered broadcasts and private authorization; recent docs also expose broadcast replay limits: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Realtime protocol supports broadcast, presence, and Postgres changes in one channel config: https://supabase.com/docs/guides/realtime/protocol
- Electric Postgres Sync syncs subsets of Postgres data into local apps; treat it as row/subset sync, not as the CRDT engine: https://electric-sql.com/primitives/postgres-sync

## Decision Gate 1: CRDT Engine And Managed Service Boundary

Recommendation:

- Start with `yjs` plus a small internal provider layer.
- Transport v1: BroadcastChannel for same-browser tabs, Supabase Realtime Broadcast for remote sessions, HTTP for durable persistence and catch-up.
- Persistence v1: Postgres snapshots and append-only cell update log.

Alt 1:

- Liveblocks Storage/Rooms for managed multiplayer storage and presence.
- Choose this if speed to managed collaboration is more important than owning persistence and avoiding vendor coupling.

Alt 2:

- Hocuspocus/Y-WebSocket service.
- Choose this if the team wants a standard Yjs server and is ready to operate a persistent WebSocket runtime outside Vercel serverless.

Alt 3:

- Supabase Postgres Changes only.
- Reject for this requirement as the primary engine because row changes broadcast final values, not true concurrent text-cell merge operations.

Alt 4:

- Electric Postgres Sync plus TanStack DB for row/subset synchronization.
- Keep this as a read-path/row-sync alternative, not as the Phase 1 CRDT text merge engine.

Do not begin implementation until this gate is acknowledged. The rest of this plan assumes the recommended path.

## Decision Gate 2: First Cell Scope

Recommendation:

- Phase 1 CRDT fields use the app/API field keys that editors already write:

| Cell document field key | Materialized `tasks` column | Current API/TaskRecord meaning |
| --- | --- | --- |
| `issueTitle` | `tasks.title` | visible task title cell |
| `issueDetailNote` | `tasks.description` | long-form task detail/description cell |
| `decision` | `tasks.conclusion` | conclusion/decision text cell |

- Phase 1 scalar document shell: `status`, `dueDate`, `workType`, category fields, assignee, booleans, and reorder-related fields. These get cell identity, presence, and per-cell sync status, but writes remain validated scalar operations.

Reason:

- For free text, CRDT merge is valuable immediately.
- For enum/date/status cells, automatic merge can hide business conflicts. The right conflict policy should be explicit.

## File Structure Map

Create:

- `src/components/tasks/daily-row-sync-bus.ts`: BroadcastChannel bus for current row-level `/daily` journal events before CRDT rollout.
- `src/domains/task/cell-documents.ts`: field-key allowlist, cell document id helpers, CRDT/scalar field classification.
- `src/components/tasks/cell-documents/cell-document-store.ts`: browser-side Yjs document cache and lifecycle.
- `src/components/tasks/cell-documents/cell-document-journal.ts`: IndexedDB outbox for cell document updates.
- `src/components/tasks/cell-documents/cell-document-transport.ts`: BroadcastChannel and Supabase Realtime provider abstraction.
- `src/components/tasks/cell-documents/use-task-cell-document.ts`: React hook used by `/daily` cell editors.
- `src/components/tasks/cell-documents/task-cell-editor.tsx`: editor wrapper for CRDT-enabled text cells.
- `src/lib/features/daily-cell-documents.ts`: disabled-by-default feature flag helper for CRDT-backed cells.
- `src/app/api/task-cell-documents/[taskId]/[fieldKey]/route.ts`: document snapshot and metadata endpoint.
- `src/app/api/task-cell-documents/[taskId]/[fieldKey]/updates/route.ts`: append/apply CRDT update endpoint.
- `scripts/daily-cell-collaboration-verify.ts`: static and runtime verification for cell-doc architecture.
- `scripts/daily-cell-collaboration-two-window-verify.ts`: browser automation for two sessions/windows after implementation.

Modify:

- `prisma/schema.prisma`: add cell document and update log models.
- `src/components/tasks/task-workspace.tsx`: integrate cell document editor, remove server-sync pending as a navigation blocker, keep row-level create/delete/reorder journal.
- `src/components/tasks/daily-grid-row-v2.tsx`: route editable text cells through `TaskCellEditor`.
- `src/components/tasks/daily-mutation-journal.ts`: leave row operations in place; add cleanup/reporting if synced rows cause stuck global status.
- `src/providers/dashboard-provider.tsx`: add realtime invalidation hook while keeping 12-second polling as fallback.
- `src/app/api/tasks/[taskId]/route.ts` or the existing task-update route: fence or translate writes for feature-flagged CRDT fields.
- `src/app/api/tasks/route.ts`, `src/use-cases/task-service.ts`, `src/repositories/postgres/store.ts`, `src/repositories/admin/postgres-store.ts`: optimize create latency and expose timing instrumentation.
- `package.json`: add scripts for the new validators; add dependencies only after explicit approval.

## Task 0: Preflight And Exact Baseline

- [ ] Run read-only worktree status:

```powershell
git -C D:\architect-workspace\architect-saas status --short --branch
git -C D:\architect-workspace\architect-saas worktree list --porcelain
git -C D:\architect-workspace\architect-saas rev-parse HEAD
```

- [ ] Dirty-tree rule: if status is not clean except approved plan/worklog files, create an isolated implementation worktree/branch before code changes and do not touch unrelated user changes.
- [ ] Confirm exact route before UI verification:

```powershell
# Browser target
https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily
```

- [ ] Capture exact Preview provenance before changing code or claiming deployment behavior:

```powershell
npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app
npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --logs
git -C D:\architect-workspace\architect-saas rev-parse --abbrev-ref HEAD
git -C D:\architect-workspace\architect-saas rev-parse HEAD
```

- [ ] Record Preview URL, branch, local SHA, deployment id, alias target, and whether `/daily` is the authenticated DB-backed route rather than `/preview/daily`.
- [ ] Capture current behavior without data writes unless approved: console errors, network timing for `/api/tasks`, journal status text, and whether navigation is blocked while `daily-sync-status` is visible.
- [ ] Run read-only latency verifier only when `APP_BACKEND_MODE=cloud` is configured:

```powershell
npx tsx scripts/daily-cloud-latency-verify.ts --max-read-ms=3000
```

- [ ] Ask before `--mutate`, migrations, dependency installation, Vercel deploys, or Preview DB writes.

## Task 1: Instrument And Optimize The Existing Create Path

- [ ] Add timing checkpoints around `src/app/api/tasks/route.ts` POST stages: integrity, auth, project editor guard, body parse, `createTask`, JSON response.
- [ ] Add internal timings inside `src/use-cases/task-service.ts` for category loading, foundation settings, parent resolution, assignee resolution, and repository create.
- [ ] Add repository timings around advisory lock, max task number lookup, sibling order aggregate, and insert in `src/repositories/postgres/store.ts`.
- [ ] Add an `npm` script for `scripts/daily-cloud-latency-verify.ts`.
- [ ] Remove repeated category bootstrap checks from every create request, or cache their result with clear invalidation after admin category changes.
- [ ] Avoid full active task reads during create unless parent resolution is actually needed.
- [ ] Confirm advisory lock time is not dominating task number assignment; if it is, add a project counter table or narrower sequence strategy in a separate migration plan.
- [ ] Keep `clientMutationId` idempotency for task creation.
- [ ] Expected proof: `/api/tasks` POST stage timings identify the dominant cost, task create latency can be attributed to a named stage, and a create action no longer keeps the UI in a modal saving state.

## Task 2: Fix Existing Background Sync UX And Row-Level Window Sync Before CRDT

- [ ] In `src/components/tasks/daily-mutation-journal.ts`, add a bounded cleanup path for `synced` operations so they do not accumulate indefinitely.
- [ ] In `src/components/tasks/task-workspace.tsx`, make the global sync pill non-blocking and informational only.
- [ ] Inspect and change the `task-workspace.tsx` `document` `pointerdown` capture/outside-click path so server persistence pending state never blocks sidebar, route, view-tab, or workspace navigation after a local draft has been written to IndexedDB or a cell document.
- [ ] Preserve blocking only for the narrow case where the local draft cannot be safely persisted locally.
- [ ] Create `src/components/tasks/daily-row-sync-bus.ts` with a `BroadcastChannel` named for the `/daily` project scope.
- [ ] Emit row-level events from existing daily mutation flow:
  - `daily-journal-updated` after local journal write/update/delete;
  - `task-created` after optimistic create is inserted;
  - `task-synced` after server acknowledgement reconciles the operation;
  - `task-failed` after terminal failure or retryable failure classification.
- [ ] On those events in sibling same-origin windows, refresh the daily journal status and run a silent `/api/tasks?orderScope=daily` refresh or existing equivalent reconciliation for the active scope.
- [ ] Also refresh journal/reconcile on focus, online, and reconnect so missed BroadcastChannel events do not leave stale status visible.
- [ ] Add Supabase Realtime row invalidation for the existing task projection before the CRDT layer:
  - use `postgres_changes` on `tasks` for `INSERT`/`UPDATE`/`DELETE`, or DB-trigger Broadcast Changes when direct row payload exposure is not acceptable;
  - treat realtime as an invalidation/update hint and keep HTTP refresh as the source of catch-up truth.
- [ ] Verification: create a task, immediately switch app tabs, return to `/daily`, and confirm the temporary row either reconciles or remains retryable without reload.
- [ ] Verification: open a second same-origin window with the same login, create/update/trash/reorder in window A, and confirm window B updates via BroadcastChannel or server realtime without waiting for the 12-second poll.

## Task 3: Add Cell Document Schema

- [ ] Add Prisma models equivalent to:

```prisma
model TaskCellDocument {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId       String   @map("project_id") @db.Uuid
  taskId          String   @map("task_id") @db.Uuid
  fieldKey        String   @map("field_key")
  docType         String   @default("text") @map("doc_type")
  yState          Bytes?   @map("y_state")
  plainText       String   @default("") @map("plain_text")
  scalarValueJson Json?    @map("scalar_value_json")
  version         Int      @default(1)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  updatedBy       String?  @map("updated_by") @db.Uuid
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task            Task     @relation(fields: [projectId, taskId], references: [projectId, id], onDelete: Cascade)
  updates         TaskCellUpdate[]

  @@unique([projectId, taskId, fieldKey])
  @@index([projectId, updatedAt])
  @@map("task_cell_documents")
}

model TaskCellUpdate {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId      String   @map("project_id") @db.Uuid
  cellDocumentId String   @map("cell_document_id") @db.Uuid
  clientUpdateId String   @map("client_update_id")
  actorProfileId String   @map("actor_profile_id") @db.Uuid
  updatePayload  Bytes    @map("update_payload")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  cellDocument   TaskCellDocument @relation(fields: [cellDocumentId], references: [id], onDelete: Cascade)

  @@unique([cellDocumentId, clientUpdateId])
  @@index([projectId, createdAt])
  @@map("task_cell_updates")
}
```

- [ ] Adjust relation fields in `Task` if Prisma requires reverse relations.
- [ ] Preserve compound project containment with `Task.@@unique([projectId, id])`; do not rely on task id alone for authorization or cascade boundaries.
- [ ] Add reverse relations on `Project`/`Task` only as required by Prisma validation and keep names explicit if relation-name collisions occur.
- [ ] Create a safe migration through the repo migration workflow, not direct `db push`.
- [ ] Do not apply migration to Preview or Production without explicit approval.

## Task 4: Add Domain Field Classification

- [ ] Implement `src/domains/task/cell-documents.ts` with:
  - allowed task field keys;
  - `isTextCellDocumentField(fieldKey)`;
  - `isScalarCellDocumentField(fieldKey)`;
  - `buildTaskCellDocumentTopic(projectId, taskId, fieldKey)`;
  - `assertTaskCellDocumentFieldKey(fieldKey)`;
  - field mapping for `issueTitle -> title`, `issueDetailNote -> description`, and `decision -> conclusion`;
  - payload limits such as `MAX_CELL_UPDATE_BYTES` and `MAX_CELL_SNAPSHOT_BYTES`.
- [ ] Add tests or script assertions so unsupported field keys cannot create arbitrary document rooms.
- [ ] Expected proof: invalid field keys return controlled 400 responses and cannot subscribe to private realtime topics.

## Task 5: Add Server APIs For Cell Documents

- [ ] `GET /api/task-cell-documents/[taskId]/[fieldKey]`:
  - require project access;
  - validate task belongs to selected project;
  - lazy-create document metadata from the current `tasks` projection for allowed fields;
  - accept optional `knownVersion` or Yjs `stateVector`;
  - return missing updates when the requested gap is within retention, otherwise return a compacted base64 Yjs snapshot;
  - return scalar value for scalar fields, version, and updated metadata.
- [ ] `POST /api/task-cell-documents/[taskId]/[fieldKey]/updates`:
  - require project editor access;
  - validate request integrity;
  - require `clientUpdateId`;
  - reject unsupported or oversized updates with a controlled 413/400 response;
  - idempotently store the update;
  - apply update to the persisted snapshot;
  - update the materialized `Task` projection in the same transaction.
- [ ] Broadcast an invalidation or update event after successful commit. If broadcast fails, persistence still succeeds and clients catch up by HTTP.
- [ ] Broadcast envelope must include `projectId`, `taskId`, `fieldKey`, `cellDocumentId`, `clientUpdateId`, `docVersion`, actor profile id, and enough metadata for clients to detect version gaps.
- [ ] Add update-log retention and compaction policy:
  - compact `updatePayload` records into `yState` after a bounded count or age;
  - retain enough recent updates for short disconnect catch-up;
  - if `yState` exceeds `MAX_CELL_SNAPSHOT_BYTES`, reject further growth with a controlled error and keep the existing task-row edit fallback disabled only for that field after product review.
- [ ] Expected proof: duplicate `clientUpdateId` does not duplicate updates; task projection reflects the cell document text.

## Task 6: Add CRDT Field Write Fence

- [ ] Add a disabled-by-default feature flag helper such as `DAILY_CELL_DOCUMENTS_ENABLED` in `src/lib/features/daily-cell-documents.ts`.
- [ ] When the flag is disabled, prove existing task-row writes continue unchanged.
- [ ] When a field is enabled as cell-document backed, all writes for that field must go through the cell-document API or a server translator that applies a Yjs update and updates the `tasks` projection in the same transaction.
- [ ] Legacy task update routes must reject or route feature-flagged CRDT fields:
  - reject direct `issueTitle`, `issueDetailNote`, and `decision` patch writes with a controlled error when no translator is implemented;
  - or translate the patch into a cell-document update with a generated `clientUpdateId`, then update projection through the same cell-document path.
- [ ] Keep scalar fields on the existing task-row path until their merge policy is explicitly approved.
- [ ] Expected proof: under the feature flag, no API path can update `tasks.title`, `tasks.description`, or `tasks.conclusion` without also updating the matching cell document state.

## Task 7: Add Browser Cell Document Store And Outbox

- [ ] Add `cell-document-store.ts` to cache one document per `(projectId, taskId, fieldKey)`.
- [ ] Add `cell-document-journal.ts` with an IndexedDB store separate from the row mutation journal.
- [ ] Persist CRDT update payloads locally before reflecting them as "saved locally".
- [ ] Add retry/backoff and stuck `syncing` reset equivalent to the existing daily mutation journal.
- [ ] Keep per-cell status. Do not tie one cell's pending server ack to the entire task grid.

## Task 8: Add Realtime Transport

- [ ] Add BroadcastChannel for same-origin same-browser tabs/windows.
- [ ] Add Supabase Realtime private channel integration for remote windows/devices:
  - topic: project/task/cell scoped;
  - channel config uses `private: true`;
  - topic names are built only through the allowlisted topic builder;
  - `realtime.messages` RLS permits subscribe/receive only for active project members with the correct project id;
  - presence: active editor, cursor/selection metadata when available;
  - broadcast: CRDT update envelope or update notification;
  - replay only as a short disconnect bridge, not durable storage.
- [ ] Add server row-realtime support for materialized projection changes:
  - use Supabase `postgres_changes` on `tasks` for simple invalidation when RLS/payload exposure is acceptable;
  - otherwise use DB-trigger Broadcast Changes with a minimal payload for `tasks` and `task_cell_documents`.
- [ ] Add HTTP catch-up on focus, reconnect, and version mismatch.
- [ ] HTTP catch-up contract:
  - client sends `knownVersion` or encoded Yjs `stateVector`;
  - server returns missing updates when retained;
  - server returns compacted snapshot when the gap is too large;
  - client applies updates idempotently and silently ignores its own already-applied `clientUpdateId`.
- [ ] Add subscription tests for no-access, viewer, editor, manager, and admin roles. Viewers may subscribe/read but cannot post updates; no-access users cannot subscribe.
- [ ] Keep `/api/project/changes` polling as a fallback, but do not rely on 12-second polling for spreadsheet-like live sync.

## Task 9: Integrate `/daily` Cell Editors

- [ ] Refactor text cells in `daily-grid-row-v2.tsx` to use `TaskCellEditor`.
- [ ] Keep quick create local-first behavior in `task-workspace.tsx`; create the task row first, then lazily attach cell documents.
- [ ] Update `task-workspace.tsx` selection/outside-click logic so navigation is blocked only when local persistence failed.
- [ ] Convert active editor UI from "hard lock everywhere" to:
  - CRDT text field: show collaborator presence, allow concurrent typing;
  - scalar field: use existing edit lease or conflict prompt until explicit merge policy exists.
- [ ] Expected proof: two windows editing the same text cell both see merged text without refresh.

## Task 10: Verification Matrix

- [x] Local static checks:

```powershell
npm run typecheck
npm run lint
npm run build
npx prisma validate
git diff --check
```

- [x] Existing `/daily` guard:

```powershell
npx tsx scripts/daily-editing-responsiveness-verify.ts
```

- [x] New cell collaboration guard:

```powershell
npx tsx scripts/daily-cell-collaboration-verify.ts
```

- [x] New two-window collaboration guard against the exact Preview route:

```powershell
npx tsx scripts/daily-cell-collaboration-two-window-verify.ts --url "https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily"
```

- [x] Two-window browser proof on the exact Preview `/daily` route:
  - window A opens same project/task/cell;
  - window B opens same login or same project account;
  - both edit a text cell concurrently;
  - both see merged text without manual refresh;
  - reload both windows and confirm server projection matches;
  - create a task and navigate away while sync is pending;
  - confirm global sync status does not block sidebar/workspace navigation.

### Four-Issue Acceptance Matrix

- [x] Create latency: Preview `/api/tasks` timing output records route, service, and repository stages; temporary row appears locally within 1 second; server ack either reconciles or stays retryable without blocking editing.
- [x] Stuck sync message: after successful create/update/reorder, `daily-sync-status` clears or changes to a retryable failure state without manual browser refresh; `synced` journal records are cleaned or ignored in active counts.
- [x] Navigation while sync pending: while a create or edit is pending, user can switch `/daily` view tabs, sidebar routes, and workspace tabs after local persistence succeeds; only local persistence failure can block.
- [x] Same-account/multi-window sync: same-origin second window receives `BroadcastChannel` row events; remote window/device receives Supabase realtime invalidation; CRDT text cell edits merge in both windows and survive reload.

Latest exact Preview evidence before the final three-agent gate:

- Target: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily`, inspected as Preview deployment `dpl_8bqwnMTGnxj3MkhSuqUV4CQ59jc4`, alias target `https://architect-start2-i08w11jlr-chois-projects-7b2948cf.vercel.app`, branch `codex/multi-user-transition`, commit `56bebb8`.
- Build logs confirmed `Branch: codex/multi-user-transition, Commit: 56bebb8`, 27 migrations, `/daily` and `/preview/daily` as separate routes, and DB schema up to date.
- `npm run daily:remaining-acceptance:verify -- --url ".../daily"` returned `ok=true`; create timing included route/service/repository stages with `totalMs=8986`, viewer Supabase realtime row visibility `10579ms` before 12-second polling, viewer read allowed, viewer write denied `403 PROJECT_EDITOR_REQUIRED`, no-access denied `403 PROJECT_ACCESS_DENIED`, cleanup `trash=200/delete=200`, and delayed reorder sync status cleared with `remaining=0`.
- `npx tsx scripts/daily-cell-collaboration-two-window-verify.ts --url ".../daily"` returned `ok=true`; local row `81ms`, second window row `5ms`, sync status `count=0`, CRDT POSTs `A=200/B=200`, server projection contained both `-A` and `-B`, both windows saw merged text without refresh, and reload preserved it.
- `npm run daily:navigation-pending-sync:verify -- --url ".../daily" --delay-ms=4000 --max-navigation-ms=1000` returned `ok=true` for `/board`: local row `41ms`, navigation `152ms`, same-document navigation `true`, cleanup `200/200`.
- The same navigation verifier returned `ok=true` for `--target-path=/materials`: local row `50ms`, navigation `135ms`, same-document navigation `true`, cleanup `200/200`.

### Three-Agent Acceptance Gate

- [x] Agent 1, symptom coverage reviewer: PASS on the mapping from the four original problems to plan tasks and proof gates.
- [x] Agent 2, collaboration architecture reviewer: PASS on CRDT projection safety, write fences, realtime/catch-up, permissions, retention, and alternatives.
- [x] Agent 3, execution/release reviewer: PASS on task order, approval boundaries, exact Preview proof, rollback, and verification commands.
- [x] Do not enable the Preview feature flag, promote to production, or mark the plan implementation complete until all three review axes are PASS.

Final three-agent gate on the latest exact Preview deployment:

- Agent 1 symptom coverage reviewer: PASS; all four original symptoms are covered by exact Preview evidence, with `rowVisibleMs=11619` noted as close but still within the 12-second gate.
- Agent 2 collaboration architecture reviewer: PASS; API flag gates, access/editor split, legacy write fence, advisory lock, row lock/CAS, idempotent update IDs, retained-update catch-up, snapshot fallback, and same-transaction projection were accepted.
- Agent 3 execution/release reviewer: PASS; latest exact Preview proof on `dpl_WQ9yzctL24Q78mPa5USh12r3XagU` supersedes earlier worklog evidence, approval boundaries were respected, and residual warnings are non-blocking.

## Rollout Order

1. Commit create-path instrumentation/optimization.
2. Commit non-blocking sync UX, `dailyMutationStatusLabel` cleanup behavior, and row-level BroadcastChannel sync.
3. Add Supabase task projection realtime invalidation while keeping `/api/project/changes` polling as fallback.
4. Add schema and cell-document APIs behind disabled feature flag `DAILY_CELL_DOCUMENTS_ENABLED=false`.
5. Add client store/outbox, write fence, and realtime transport behind the same disabled flag.
6. Enable CRDT document editing for one low-risk text field in Preview only after explicit approval.
7. Expand to all text-like `/daily` fields after the three-agent acceptance gate passes.
8. Add scalar cell document shells and refine scalar conflict handling.
9. Write worklog and exact Preview evidence before any production promotion.

## Explicit Approval Gates

Ask before:

- installing `yjs`, Liveblocks, Hocuspocus, TanStack DB, Electric, or any dependency;
- creating a local Prisma migration if it changes schema files beyond plan text;
- applying any migration to Preview or Production;
- running browser proof that creates/updates/deletes Preview DB data;
- enabling `DAILY_CELL_DOCUMENTS_ENABLED` on the exact Preview URL;
- changing Vercel env vars, aliases, deployment protection, or auth settings;
- changing Supabase Realtime authorization, `realtime.messages` RLS, publication settings, or task table replication settings;
- promoting the feature to Production.

## Rollback And Backout Criteria

- If row-level fast fixes regress `/daily`, disable only the new BroadcastChannel/realtime subscription codepath and keep the existing daily mutation journal flush path.
- If CRDT cell documents fail in Preview, set `DAILY_CELL_DOCUMENTS_ENABLED=false`; existing task-row writes must continue to work with the feature disabled.
- If realtime authorization rejects valid users or allows no-access users, stop Preview rollout and revert the RLS/publication/broadcast policy change before further feature work.
- If a migration has been applied, do not drop data blindly. Document the rollback SQL or forward-fix path, preserve `tasks` projection rows, and take a backup before destructive rollback.
- If Vercel alias/env changes were made, restore the previous alias/env target recorded in Task 0 provenance.
- If two-window merge creates divergence between cell documents and `tasks` projection, disable the feature flag and route writes back to the legacy task-row path until the write fence is corrected.

## Stop Conditions

This section is the short operator summary. Use `Explicit Approval Gates` and `Rollback And Backout Criteria` above for the full rule set.

- stop before dependency installs, migrations, Preview/Production data writes, feature-flag enablement, Supabase policy changes, Vercel env/alias changes, or production promotion unless explicitly approved;
- making scalar cells automatically merge without a product-approved conflict policy.

## Grill-Me Question Queue

Question 1:

- Should Phase 1 CRDT editing cover only text-like task cells, or every visible `/daily` cell immediately?

Recommended answer:

- Start with text-like task cells. Give every cell a document identity from day one, but do not auto-merge scalar business fields until conflict rules are explicit.

Question 2:

- Is a managed collaboration vendor acceptable if it materially shortens delivery?

Recommended answer:

- Default to repo-owned Yjs plus Supabase/Postgres because the app already has Supabase/Postgres, then revisit Liveblocks if operations or browser proof becomes the bottleneck.

Question 3:

- Should same-account other-window sync be considered sufficient if it only works in the same browser profile?

Recommended answer:

- No. BroadcastChannel is necessary for instant same-browser sync, but Supabase Realtime plus HTTP catch-up is required for separate browser profiles, devices, and real collaborators.
