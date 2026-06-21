# Structured Approved WIKI Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the P1/P2 review findings so structured approved WIKI approval, cloud readback, route security, and release verification are not weaker than the new data model.

**Architecture:** Preserve the existing structured WIKI architecture, but tighten the trust boundary at approval time. The server owns source identity, scope, readiness, and publishability; the client may edit a draft but cannot smuggle scope/source/readiness decisions into approved WIKI.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/Postgres, local fallback repositories, Playwright smoke scripts, static TypeScript validators.

---

## File Structure

### Schema And Persistence
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260615090000_structured_approved_wiki/migration.sql`
- Modify: `src/domains/knowledge/structured-knowledge.ts`
- Modify: `src/use-cases/admin/structured-knowledge-service.ts`
- Modify: `src/repositories/knowledge/postgres-store.ts`
- Modify: `src/repositories/knowledge/local-store.ts`

### Approval Trust Boundary
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/use-cases/admin/knowledge-source-bucket-service.ts`
- Modify: `src/use-cases/admin/knowledge-structured-draft-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-structured-draft-panel.tsx`
- Modify: `src/components/admin/knowledge-source-bucket-panel.tsx`

### Route Guards, Migration Tolerance, And Versioning
- Modify: `src/app/api/admin/knowledge/items/route.ts`
- Modify: `src/app/api/admin/knowledge/discovery-requests/route.ts`
- Modify: `src/app/api/admin/knowledge/import-previews/route.ts`
- Modify: `src/app/api/admin/knowledge/rubrics/route.ts`
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/use-cases/admin/structured-knowledge-service.ts`
- Modify: `scripts/knowledge-wiki-security-validate.ts`

### Verification And Release Gates
- Modify: `scripts/backfill-structured-approved-wiki.ts`
- Modify: `scripts/structured-knowledge-approval-validate.ts`
- Modify: `scripts/structured-knowledge-readback-validate.ts`
- Modify: `scripts/structured-knowledge-repository-validate.ts`
- Modify: `scripts/structured-knowledge-preview-smoke.ts`
- Modify: `scripts/structured-knowledge-ui-contract-validate.ts`
- Modify: `package.json`
- Modify: `docs/worklogs/2026-06-15-structured-approved-wiki.md`
- Modify: `docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md`

## Task 1: Preserve Logical Source Reference IDs

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260615090000_structured_approved_wiki/migration.sql`
- Modify: `src/domains/knowledge/structured-knowledge.ts`
- Modify: `src/use-cases/admin/structured-knowledge-service.ts`
- Modify: `src/repositories/knowledge/postgres-store.ts`
- Modify: `src/repositories/knowledge/local-store.ts`
- Modify validators: `scripts/structured-knowledge-data-contract-validate.ts`, `scripts/structured-knowledge-readback-validate.ts`, `scripts/structured-knowledge-repository-validate.ts`

- [x] **Step 1: Add `sourceRefId` to source references**

Add a stable text ID to persisted source references:

```prisma
model KnowledgeSourceReference {
  id                  String   @id @default(uuid()) @db.Uuid
  sourceRefId         String   @map("source_ref_id")
  itemId              String   @map("item_id") @db.Uuid
  versionId           String   @map("version_id") @db.Uuid
  sourceKind          String   @map("source_kind")
  sourceId            String   @map("source_id")
  title               String
  locator             String   @default("")
  excerpt             String   @default("")
  sourceUrl           String?  @map("source_url")
  digest              String
  authorityRank       Int      @default(0) @map("authority_rank")
  verifiedAt          DateTime? @map("verified_at") @db.Timestamptz(6)
  stale               Boolean  @default(false)
  legalChangeWarnings Json     @default("[]") @map("legal_change_warnings")
  allowedUse          String   @default("context") @map("allowed_use")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
}
```

Expected SQL addition:

```sql
"source_ref_id" text not null,
create unique index "knowledge_source_references_version_id_source_ref_id_key"
  on "knowledge_source_references" ("version_id", "source_ref_id");
```

- [x] **Step 2: Write sourceRefId on publish and read it back**

In `publishStructuredKnowledgeFromCandidate`, create rows with both database UUID `id` and logical `sourceRefId`:

```ts
sourceRefId: source.id,
```

In Postgres DTO conversion, return `id: source.sourceRefId`, not the DB UUID.

- [x] **Step 3: Keep local parity**

The local store already keeps logical IDs in JSON. Add a repository validator assertion that local and Postgres DTOs expose the same `sourceRefs[].id` semantics.

- [x] **Step 4: Verify**

Run:

```powershell
npm run structured-knowledge:data-contract:validate
npm run structured-knowledge:repository:validate
npm run structured-knowledge:readback:validate
npx prisma validate
npm run typecheck
```

Expected: all pass.

## Task 2: Make Approval Server-Canonical

**Files:**
- Modify: `src/use-cases/admin/structured-knowledge-service.ts`
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/use-cases/admin/knowledge-source-bucket-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Modify: `scripts/structured-knowledge-approval-validate.ts`

- [x] **Step 1: Add publish policy validation**

Add a server-side validation function with this behavior:

```ts
export function assertStructuredKnowledgeDraftPublishable(input: {
  draft: StructuredKnowledgeDraft;
  sourceBuckets: KnowledgeSourceBucket[];
  requestedScope: KnowledgePublicationScope;
}) {
  // block approvalReadiness.status === "blocked"
  // block unsafe prompt/credential/path/provider usage text
  // require every section/claim sourceRefId to exist in draft.sourceRefs
  // reject sourceRefs where allowedUse === "do_not_publish"
  // reject sourceRefs not present in current server source buckets
  // reject organization scope when any source kind is task_context, project_document, or local_wiki
  // require at least one non-task reusable source for organization scope
}
```

- [x] **Step 2: Build canonical draft before repository mutation**

In `reviewKnowledgeCandidate`, load `getKnowledgeSourceBuckets({ recordId, projectId })`, normalize the draft, and pass a canonical draft to the repository. The repository should not perform policy decisions based on raw client input.

- [x] **Step 3: Remove normal legacy approval fallback**

Require `structuredDraft` for normal approve requests. Keep `buildStructuredKnowledgeDraftFromLegacyCandidate` available for backfill/preflight only.

- [x] **Step 4: Verify**

Run:

```powershell
npm run structured-knowledge:approval:validate
npm run knowledge-wiki:security:validate
npm run typecheck
```

Expected: validators assert mandatory structured draft, server bucket validation, do-not-publish rejection, and scope canonicalization.

## Task 3: Keep UI Approval Source Of Truth Consistent

**Files:**
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-structured-draft-panel.tsx`
- Modify: `src/components/admin/knowledge-source-bucket-panel.tsx`
- Modify: `scripts/structured-knowledge-ui-contract-validate.ts`
- Modify: `scripts/structured-knowledge-preview-smoke.ts`

- [x] **Step 1: Keep admin edits synchronized with structured draft**

Before approve, create the payload from the latest structured draft plus current visible edits:

```ts
const approvalDraft = mergeStructuredDraftWithCurrentEdits(structuredDraftResult.draft, draft, draftTags);
```

The merged draft must update `title`, `summary`, `tags`, `ontology.scope`, `markdown`, and the section body that represents the Markdown body.

- [x] **Step 2: Disable approval until structured review exists**

Approval button must require:

```ts
Boolean(structuredDraftResult?.draft) && structuredDraftResult.draft.approvalReadiness.status !== "blocked"
```

Show a clear status message when the user tries to approve without a generated/reviewed structured draft.

- [x] **Step 3: Separate loading/error/empty bucket states**

The source bucket panel must not render fallback blocking status while the server bucket load is still pending or failed.

- [x] **Step 4: Verify**

Run:

```powershell
npm run structured-knowledge:ui-contract:validate
npx eslint src\components\admin\knowledge-admin-shell.tsx src\components\admin\knowledge-structured-draft-panel.tsx src\components\admin\knowledge-source-bucket-panel.tsx
npm run typecheck
```

Expected: UI contract asserts structured approval gate and no false blocking fallback.

## Task 4: Harden Readback, Routes, And Version Lifecycle

**Files:**
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/use-cases/admin/structured-knowledge-service.ts`
- Modify: `src/app/api/admin/knowledge/items/route.ts`
- Modify: `src/app/api/admin/knowledge/discovery-requests/route.ts`
- Modify: `src/app/api/admin/knowledge/import-previews/route.ts`
- Modify: `src/app/api/admin/knowledge/rubrics/route.ts`
- Modify: `scripts/knowledge-wiki-security-validate.ts`
- Modify: `scripts/structured-knowledge-readback-validate.ts`

- [x] **Step 1: Add migration-tolerant structured readback**

Catch known Prisma missing-table/missing-column errors in `listApprovedKnowledgeItems` and continue with legacy rows.

- [x] **Step 2: Supersede old versions**

In the same approval transaction, update prior approved versions for the item:

```ts
await input.tx.knowledgeItemVersion.updateMany({
  where: { itemId: item.id, state: "approved" },
  data: { state: "superseded" },
});
```

Create the new approved version after this update.

- [x] **Step 3: Require current project access on project-scoped read routes**

For `/api/admin/knowledge/items`, ignore arbitrary query `projectId` unless it matches `requireCurrentProjectAccess(user).project.id`.

- [x] **Step 4: Make security validator handler-aware**

The validator must inspect each exported `GET`/`POST` handler body for `assertRequestIntegrity`, auth, capability, and project guard where required.

- [x] **Step 5: Verify**

Run:

```powershell
npm run knowledge-wiki:security:validate
npm run structured-knowledge:readback:validate
npm run typecheck
```

Expected: route guard gaps are caught by validators.

## Task 5: Upgrade Backfill And Release Smoke

**Files:**
- Modify: `scripts/backfill-structured-approved-wiki.ts`
- Modify: `scripts/structured-knowledge-preview-smoke.ts`
- Modify: `package.json`
- Modify: `docs/worklogs/2026-06-15-structured-approved-wiki.md`
- Modify: `docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md`

- [x] **Step 1: Add backfill preflight mode**

Default backfill must build and validate each candidate draft without writes. `--apply` is the only write mode.

- [x] **Step 2: Split local smoke and release smoke semantics**

Add release flags:

```text
npm run structured-knowledge:preview-smoke:release
STRUCTURED_KNOWLEDGE_SMOKE_NO_SKIP=1 npm run structured-knowledge:preview-smoke
```

No-skip mode must not skip candidate selection, project selection, structured generation, approval, or approved readback.

- [x] **Step 3: Correct closeout wording**

Update manager closeout from “full gate passed” to “local subset passed; release gates pending” until Preview URL, cloud DB, and migration checks are available.

- [x] **Step 4: Verify**

Run:

```powershell
npm run structured-knowledge:backfill -- --preflight
npm run structured-knowledge:preview-smoke
npm run typecheck
git diff --check
```

Expected: local smoke may skip release-only checks; strict smoke must fail loudly when required env is missing.

## Task 6: Final Harness Review

**Files:**
- Modify: `docs/worklogs/2026-06-15-structured-approved-wiki.md`
- Modify: `docs/superpowers/plans/2026-06-16-structured-approved-wiki-review-fixes-plan.md`

- [x] **Step 1: Run full local gate**

Run:

```powershell
npm run structured-knowledge:domain:validate
npm run structured-knowledge:data-contract:validate
npm run structured-knowledge:repository:validate
npm run structured-knowledge:approval:validate
npm run structured-knowledge:readback:validate
npm run structured-knowledge:ui-contract:validate
npm run knowledge-wiki:security:validate
npm run typecheck
npm run lint
npm run build
git diff --check
```

- [x] **Step 2: Run multi-agent final review**

Dispatch read-only reviewers for backend/security, product/UX, and release readiness. Blocking findings must be fixed before closeout.

- [x] **Step 3: Update worklog**

Record:

```text
Req: fix structured approved WIKI review findings.
Diff: sourceRef logical ids, server-canonical approval, UI source-of-truth, route/migration/version hardening, release smoke/preflight.
Why: reviewed P1/P2 findings showed cloud readback and approval trust boundary were not release-ready.
Verify: <commands and results>
Time: <Asia/Seoul timestamp>
```

## Planning Self-Review

Spec coverage:
- Cloud sourceRef readback: Task 1.
- Client trust boundary and scope/readiness/source validation: Task 2.
- Mandatory structured review and stale draft divergence: Task 3.
- Migration fallback, route guards, superseded lifecycle: Task 4.
- Backfill preflight, release smoke, closeout honesty: Task 5.
- Multi-agent final verification: Task 6.

Placeholder scan:
- No TBD/TODO placeholders are required for implementation.

Type consistency:
- `KnowledgeSourceRef.id` remains the logical publication ID.
- DB `KnowledgeSourceReference.id` remains the internal UUID.
- DB `KnowledgeSourceReference.sourceRefId` maps to the logical `KnowledgeSourceRef.id`.
- Approval uses a canonical `StructuredKnowledgeDraft` built from server-validated source buckets.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-16-structured-approved-wiki-review-fixes-plan.md`.

Execution mode selected by user: **Subagent/Harness Driven**.

## Manager Closeout

Final review fixes applied:
- Source reference fallback was narrowed so only Prisma missing-table/missing-column errors or explicit missing structured relation/table/column messages allow legacy fallback.
- Release smoke plan wording now matches the implemented no-skip gate.
- Worklog records the 2026-06-16 review-fix closeout and remaining deployment-environment checks.

Verification:
- `npm run db:generate` -> ok.
- `npm run structured-knowledge:domain:validate` -> ok.
- `npm run structured-knowledge:data-contract:validate` -> ok.
- `npm run structured-knowledge:repository:validate` -> ok.
- `npm run structured-knowledge:approval:validate` -> ok.
- `npm run structured-knowledge:readback:validate` -> ok.
- `npm run structured-knowledge:parity:validate` -> ok.
- `npm run structured-knowledge:ui-contract:validate` -> ok.
- `npm run structured-knowledge:behavior:validate` -> ok.
- `npm run structured-knowledge:schema-preflight` -> skipped safely because cloud `DATABASE_URL` is not configured.
- `npm run structured-knowledge:backfill -- --preflight` -> dry-run summary ok, zero scanned.
- `npm run knowledge-wiki:security:validate` -> ok.
- `npm run typecheck` -> ok.
- `npx prisma validate --schema prisma/schema.prisma` -> schema valid.
- `STRUCTURED_KNOWLEDGE_SMOKE_URL=http://localhost:3001 npm run structured-knowledge:preview-smoke` -> 50 checks ok, local non-UUID project selection skip only.
- `npm run lint` -> ok.
- `git diff --check` -> ok with CRLF normalization warnings only.
- `npm run build` -> ok, Next.js 16.2.7 Webpack, 107/107 static pages.

Residual release checks:
- `npm run structured-knowledge:preview-smoke:release` must run against the deployed Preview/production-like URL with no skips.
- `npm run structured-knowledge:schema-preflight` must run against the target cloud `DATABASE_URL`.
- Backfill write mode remains unrun; use `npm run structured-knowledge:backfill -- --apply` only after migration and backup approval.
