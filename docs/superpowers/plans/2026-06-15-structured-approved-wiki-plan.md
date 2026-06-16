# Structured Approved WIKI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make approved WIKI use structured knowledge records as the source of truth, with Markdown generated from reviewed structure, source buckets, ontology, TOC, and versioned generation profiles.

**Architecture:** Existing `assistant_task_records.metadata.approvedKnowledgeItem` remains a compatibility snapshot for readback/search/export while new `knowledge_*` tables become the write source of truth. Draft generation is split into source-bucket retrieval, versioned generation profile, structured draft, admin review, and approved version publish. The admin UI exposes the structure, prompt/profile version, source coverage, and TOC quality without allowing hidden prompt changes to bypass server validators.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, Prisma/PostgreSQL, existing assistant repository, existing knowledge admin APIs, `tsx` validators, Playwright smoke tests.

---

## Harness Operating Model

Mode: `Strict`.

Roles:

- `choi`: coordinator and manager. Owns plan scope, user decisions, integration, final checklist, and closeout.
- `hy`: data/API worker. Owns schema, migrations, repositories, services, server routes, data validators.
- `ung`: admin UI worker. Owns `/admin/knowledge` structured draft UX, profile UI, source bucket display, CSS.
- `ch`: reviewer. Checks product/UX fit, source hierarchy, admin workflow, and browser smoke coverage.
- `ul`: reviewer. Checks correctness, security boundaries, route guards, secret/path redaction, and unnecessary files.

Manager closeout rule:

- Each task below must be checked only after its verification command or browser observation passes.
- The goal is complete only after `choi` confirms every task checkbox is complete, reviewers have no blocking findings, and final verification is recorded in the worklog.
- No `git push`, deploy, production/staging DB write, or `AGENTS.md` update occurs without fresh user approval.
- Existing dirty files are preserved. Stage and commit only files owned by this plan when a commit is explicitly made.

Planning review additions from `hy` and `ung`:

- Preserve approved WIKI item ID stability. Existing copied links, export audits, selected approved item URLs, and retrieval references may depend on the current `approvedKnowledgeItem.id`.
- Keep `ApprovedKnowledgeItem` as the stable admin/readback/search/export DTO while structured tables become the canonical write model.
- Use backfill, dual-write, structured-first read, and parity validators instead of a hard cutover.
- Preserve current search scope semantics exactly: same project plus organization-level items are searchable; unrelated project items are not.
- Prevent double-approval races with existing candidate state transition guards plus a unique source-record constraint in structured storage.
- Split the Draft tab UI into focused components before adding source bucket, ontology, TOC, and generation profile state.
- Markdown rendered artifact must include an explicit TOC, stable anchors, source coverage, and related knowledge section when the structured draft contains them.
- Integrated reasoning is a persisted draft field, not only UI copy. It must include claim/source/conflict/gap information.
- Approval readiness is typed and enforced server-side. Blocking issues cannot be approved without an explicit audited override path, and this plan defaults to no override for initial implementation.

## Current State To Preserve

- `/admin/knowledge` canonical IA already separates `후보 관리`, `승인 WIKI`, `로컬 WIKI 가져오기`, `운영 점검`.
- `knowledge_discovery_requests`, `knowledge_import_previews`, and `knowledge_import_rubrics` already exist.
- Existing local import rubric manages import selection, not approved WIKI generation.
- Existing approved WIKI lives as `metadata.approvedKnowledgeItem` on `assistant_task_records`.
- Existing `searchApprovedKnowledge()` and approved readback must continue to work during migration.
- `pending_review`, discovery requests, and import previews must never become reusable central knowledge.

## Source-Of-Truth Decision

Structured knowledge records become canonical. Markdown becomes a rendered version of reviewed structure.

The approved WIKI source of truth includes:

- `knowledge_items`: identity, scope, state, slug, tags, ontology category.
- `knowledge_item_versions`: versioned content, structured JSON, TOC, section blocks, digest, approval lineage.
- `knowledge_source_refs`: source bucket membership, locator, quote/excerpt, digest, legal authority and freshness data, allowed use.
- `knowledge_generation_profiles`: versioned admin-managed generation instructions, section rules, TOC rules, ontology schema, citation rules.
- `knowledge_generation_runs`: profile version, source bundle digest, provider/model metadata, prompt digest, legal verification status, project context trace.
- `approval_readiness`: typed blocking/warning/ready issues derived from source coverage, TOC completeness, ontology completeness, reusable scope, and body metadata checks.

The compatibility snapshot remains:

- `AssistantRecordMetadata.approvedKnowledgeItem` is updated from the structured item/version after approval.
- Existing export/sync and assistant retrieval can read the snapshot until they are moved to structured repositories.
- Existing snapshot `id` remains stable during backfill. A structured item created from an existing snapshot must preserve that public id so current URLs and API payloads do not drift.

## Migration Strategy

The rollout is incremental:

1. Contract freeze: add validators that prove the current DTO/search/export shape before behavior changes.
2. Expand schema: add structured tables and profiles without changing reads.
3. Backfill: idempotently copy existing `assistant_task_records.metadata.approvedKnowledgeItem` into structured rows.
4. Dual-write: approval publishes structured records and still writes the metadata snapshot.
5. Structured-first read/search: admin readback and retrieval prefer structured rows and fall back to legacy snapshots.
6. Cleanup decision later: after local and Preview parity, decide whether the metadata snapshot remains a permanent cache.

Do not skip backfill/parity. A direct replacement risks ID drift, search ranking changes, export audit breakage, and scope leakage.

## File Structure

### New Domain And Repository Files

- Create: `src/domains/knowledge/structured-knowledge.ts`
  - Owns shared source-kind, TOC, ontology, section, generation profile, and structured draft types.
- Create: `src/repositories/knowledge/contracts.ts`
  - Owns repository interfaces for structured knowledge items, versions, source refs, profiles, and runs.
- Create: `src/repositories/knowledge/postgres-store.ts`
  - Owns Prisma-backed structured knowledge persistence.
- Create: `src/repositories/knowledge/local-store.ts`
  - Owns in-memory/local structured knowledge behavior for tests and local fallback.
- Create: `src/repositories/knowledge/index.ts`
  - Owns repository selection.

### New Admin Use-Case Files

- Create: `src/use-cases/admin/knowledge-generation-profile-service.ts`
  - Manages generation profile draft/create/activate/rollback/read.
- Create: `src/use-cases/admin/knowledge-source-bucket-service.ts`
  - Builds legal, task, project document, approved WIKI, local WIKI, and external source buckets.
- Create: `src/use-cases/admin/knowledge-structured-draft-service.ts`
  - Generates structured WIKI draft and stores generation run metadata.
- Create: `src/use-cases/admin/structured-knowledge-service.ts`
  - Publishes approved structured items and compatibility snapshots.
- Create: `src/use-cases/admin/knowledge-response-sanitizer.ts`
  - Redacts raw prompt text, secret-like strings, `.env` fragments, Windows/UNC/POSIX absolute paths, provider usage, and cost metadata from admin responses and rendered Markdown.

### Modified Existing Files

- Modify: `prisma/schema.prisma`
- Modify: `src/domains/assistant/types.ts`
- Modify: `src/lib/auth/knowledge-guards.ts`
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `src/components/admin/knowledge-admin-tabs.ts`
- Modify: `package.json`

### New API Routes

- Create: `src/app/api/admin/knowledge/generation-profiles/route.ts`
- Create: `src/app/api/admin/knowledge/generation-profiles/[profileId]/activate/route.ts`
- Create: `src/app/api/admin/knowledge/generation-profiles/[profileId]/rollback/route.ts`
- Create: `src/app/api/admin/knowledge/candidates/[recordId]/source-buckets/route.ts`
- Create: `src/app/api/admin/knowledge/candidates/[recordId]/structured-draft/route.ts`

### New UI Components

- Create: `src/components/admin/knowledge-source-bucket-panel.tsx`
- Create: `src/components/admin/knowledge-ontology-editor.tsx`
- Create: `src/components/admin/knowledge-toc-editor.tsx`
- Create: `src/components/admin/knowledge-generation-profile-panel.tsx`
- Create: `src/components/admin/knowledge-structured-draft-panel.tsx`

### New Validators

- Create: `scripts/structured-knowledge-domain-validate.ts`
- Create: `scripts/structured-knowledge-data-contract-validate.ts`
- Create: `scripts/structured-knowledge-generation-validate.ts`
- Create: `scripts/structured-knowledge-approval-validate.ts`
- Create: `scripts/structured-knowledge-ui-contract-validate.ts`
- Create: `scripts/structured-knowledge-preview-smoke.ts`
- Create: `scripts/structured-knowledge-parity-validate.ts`

## Task 1: Record The Structured WIKI Governance Contract

**Files:**
- Create: `docs/superpowers/specs/2026-06-15-structured-approved-wiki-design.md`
- Create or update: `docs/worklogs/2026-06-15-structured-approved-wiki.md`
- Modify: `docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md`

- [x] **Step 1: Write the governance spec**

Create `docs/superpowers/specs/2026-06-15-structured-approved-wiki-design.md` with this section structure:

```markdown
# Structured Approved WIKI Design

작성일: 2026-06-15
상태: implementation planning approved
범위: approved WIKI source of truth, structured draft generation, source buckets, ontology, TOC, generation profiles, admin review UX

## Core Decision

Approved WIKI uses structured knowledge records as the source of truth. Markdown is a rendered artifact of reviewed structure.

## Source Buckets

- legal_evidence: 법령, 조문, 공식 출처, 확인 시점, 법령 변경 경고
- task_context: task 질문, 결론 후보, task 특수 조건, 제거해야 할 일회성 맥락
- project_document: 업로드 문서, 도면/문서 청크, 프로젝트 조건, 신뢰도와 사용 제한
- approved_wiki: 기존 승인 WIKI, 중복/상충/보완 관계
- local_wiki: 로컬 WIKI import 후보, raw source digest, citation 상태, import rubric version
- external_evidence: 외부 근거, record id, 검증 상태

## WIKI Structure

- title
- slug
- summary
- ontology
- sourceCoverage
- toc
- sections
- relatedKnowledge
- reasoningSummary
- claimEvidenceMatrix
- approvalReadiness
- reviewWarnings

## Generation Profile

Generation profiles are versioned admin-managed instructions. They may change TOC, ontology schema, section rules, and citation rules. They cannot override security, legal evidence, approval, or central knowledge exclusion boundaries.

## Approval Rules

Approval requires source coverage, reusable scope review, ontology completeness, TOC quality, and metadata/body separation. Provider, usage, task id, assistant record id, raw local path, and secret-like content cannot appear in approved Markdown body.

## Runtime Enforcement

Docs define intent. Runtime behavior is enforced by services, route guards, validators, and smoke tests.
```

- [x] **Step 2: Create the worklog**

Create `docs/worklogs/2026-06-15-structured-approved-wiki.md`:

```text
Req: make approved WIKI structured source-of-truth with ontology, TOC, source buckets, and versioned generation profiles.
Diff: planning started; implementation not yet applied.
Why: current approved WIKI is a Markdown/metadata snapshot and can preserve task transcripts instead of durable reusable knowledge.
Verify: pending.
Time: 2026-06-15 Asia/Seoul.
```

- [x] **Step 3: Verify docs**

Run:

```powershell
npm run worklog:check
git diff --check -- docs/superpowers/specs/2026-06-15-structured-approved-wiki-design.md docs/worklogs/2026-06-15-structured-approved-wiki.md docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md
```

Expected:

```text
worklog: ok
No whitespace errors
```

## Task 2: Add Structured Knowledge Domain Types

**Files:**
- Create: `src/domains/knowledge/structured-knowledge.ts`
- Modify: `src/domains/assistant/types.ts`
- Create: `scripts/structured-knowledge-domain-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Create domain constants and types**

Create `src/domains/knowledge/structured-knowledge.ts`:

```ts
export const knowledgeSourceKinds = [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
] as const;

export type KnowledgeSourceKind = (typeof knowledgeSourceKinds)[number];

export const knowledgeAllowedUseKinds = ["legal_basis", "context", "comparison", "citation", "do_not_publish"] as const;
export type KnowledgeAllowedUse = (typeof knowledgeAllowedUseKinds)[number];

export type KnowledgeSourceRef = {
  id: string;
  sourceKind: KnowledgeSourceKind;
  sourceId: string;
  title: string;
  locator: string;
  excerpt: string;
  sourceUrl: string | null;
  digest: string;
  authorityRank: number;
  verifiedAt: string | null;
  stale: boolean;
  legalChangeWarnings: string[];
  allowedUse: KnowledgeAllowedUse;
};

export type KnowledgeOntologyRelationKind =
  | "parent"
  | "child"
  | "related"
  | "depends_on"
  | "conflicts_with"
  | "supersedes"
  | "supplements";

export type KnowledgeOntologyNode = {
  conceptId: string;
  label: string;
  category: "legal_rule" | "workflow" | "project_condition" | "design_decision" | "reference";
  scope: "organization" | "project" | "project_members" | "admin_only";
  relations: Array<{
    kind: KnowledgeOntologyRelationKind;
    targetId: string;
    reason: string;
  }>;
};

export type KnowledgeTocItem = {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  purpose: "summary" | "applicability" | "procedure" | "evidence" | "exception" | "related" | "history";
  required: boolean;
};

export type KnowledgeSection = {
  tocId: string;
  anchor: string;
  heading: string;
  bodyMarkdown: string;
  sourceRefIds: string[];
};

export type KnowledgeClaimEvidence = {
  claim: string;
  sourceRefIds: string[];
  confidence: "high" | "medium" | "low";
  conflicts: string[];
  gaps: string[];
};

export type KnowledgeReviewIssue = {
  code:
    | "missing_required_source_bucket"
    | "missing_required_toc_section"
    | "missing_ontology"
    | "metadata_in_body"
    | "unsourced_claim"
    | "source_conflict"
    | "legal_freshness_warning";
  severity: "blocking" | "warning" | "ready";
  message: string;
  sourceRefIds: string[];
};

export type KnowledgeApprovalReadiness = {
  status: "blocked" | "needs_review" | "ready";
  issues: KnowledgeReviewIssue[];
};

export type StructuredKnowledgeDraft = {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  ontology: KnowledgeOntologyNode;
  toc: KnowledgeTocItem[];
  sections: KnowledgeSection[];
  reasoningSummary: string;
  claimEvidenceMatrix: KnowledgeClaimEvidence[];
  approvalReadiness: KnowledgeApprovalReadiness;
  sourceRefs: KnowledgeSourceRef[];
  markdown: string;
  warnings: string[];
};

export type KnowledgeGenerationProfile = {
  id: string;
  name: string;
  version: number;
  state: "draft" | "active" | "archived";
  sourceBucketRules: Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>;
  tocTemplate: KnowledgeTocItem[];
  ontologySchema: Record<string, unknown>;
  citationRules: string[];
  sectionRules: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
```

- [x] **Step 2: Extend assistant metadata without breaking existing records**

In `src/domains/assistant/types.ts`, extend `ApprovedKnowledgeItem` with optional structured lineage:

```ts
  structuredKnowledgeItemId?: string;
  structuredKnowledgeVersionId?: string;
  generationRunId?: string;
```

These fields must be optional so existing approved records remain valid.

- [x] **Step 3: Add domain validator**

Create `scripts/structured-knowledge-domain-validate.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const domain = readFileSync("src/domains/knowledge/structured-knowledge.ts", "utf8");
const assistantTypes = readFileSync("src/domains/assistant/types.ts", "utf8");

for (const source of ["legal_evidence", "task_context", "project_document", "approved_wiki", "local_wiki", "external_evidence"]) {
  assert.match(domain, new RegExp(`"${source}"`), `missing source kind ${source}`);
}

for (const field of ["ontology", "toc", "sections", "reasoningSummary", "claimEvidenceMatrix", "approvalReadiness", "sourceRefs", "markdown", "warnings"]) {
  assert.match(domain, new RegExp(`\\b${field}\\b`), `StructuredKnowledgeDraft missing ${field}`);
}

for (const typeName of ["KnowledgeClaimEvidence", "KnowledgeReviewIssue", "KnowledgeApprovalReadiness"]) {
  assert.match(domain, new RegExp(`type ${typeName}\\b`), `missing ${typeName}`);
}

assert.match(assistantTypes, /structuredKnowledgeItemId\?: string/);
assert.match(assistantTypes, /structuredKnowledgeVersionId\?: string/);
assert.match(assistantTypes, /generationRunId\?: string/);

console.log("structured-knowledge-domain-validate: ok");
```

- [x] **Step 4: Register and run validator**

Add to `package.json`:

```json
"structured-knowledge:domain:validate": "tsx scripts/structured-knowledge-domain-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:domain:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-domain-validate: ok
tsc exits 0
```

## Task 3: Add Structured Knowledge Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260615090000_structured_approved_wiki/migration.sql`
- Create: `scripts/structured-knowledge-data-contract-validate.ts`
- Create: `scripts/structured-knowledge-parity-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Add Prisma models**

Add these models to `prisma/schema.prisma`:

```prisma
model KnowledgeItem {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  publicId    String   @unique @map("public_id")
  projectId   String?  @map("project_id") @db.Uuid
  state       String   @default("draft")
  title       String
  slug        String
  scope       String
  tags        Json     @default("[]")
  ontology    Json     @default("{}")
  createdBy   String   @map("created_by") @db.Uuid
  updatedBy   String   @map("updated_by") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  versions    KnowledgeItemVersion[]
  sourceRefs  KnowledgeSourceReference[]

  @@unique([projectId, slug])
  @@index([state, updatedAt])
  @@index([projectId, state, updatedAt])
  @@map("knowledge_items")
}

model KnowledgeItemVersion {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  itemId          String   @map("item_id") @db.Uuid
  version         Int
  state           String   @default("draft")
  title           String
  summary         String
  bodyMarkdown    String   @map("body_markdown")
  structuredDraft Json     @default("{}") @map("structured_draft")
  toc             Json     @default("[]")
  sectionBlocks   Json     @default("[]") @map("section_blocks")
  contentDigest   String   @map("content_digest")
  sourceDigest    String   @map("source_digest")
  sourceRecordId  String?  @unique @map("source_record_id") @db.Uuid
  sourceTaskId    String?  @map("source_task_id") @db.Uuid
  sourceProjectId String?  @map("source_project_id") @db.Uuid
  generationRunId String?  @map("generation_run_id") @db.Uuid
  approvedBy      String?  @map("approved_by") @db.Uuid
  approvedAt      DateTime? @map("approved_at") @db.Timestamptz(6)
  supersedesId    String?  @map("supersedes_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  item            KnowledgeItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  sourceRefs      KnowledgeSourceReference[]

  @@unique([itemId, version])
  @@index([itemId, state, createdAt])
  @@index([sourceProjectId, state, approvedAt])
  @@index([generationRunId])
  @@map("knowledge_item_versions")
}

model KnowledgeSourceReference {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
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
  item                KnowledgeItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  version             KnowledgeItemVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@index([itemId, sourceKind])
  @@index([versionId, sourceKind])
  @@index([sourceKind, sourceId])
  @@map("knowledge_source_references")
}

model KnowledgeGenerationProfile {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name              String
  version           Int
  state             String   @default("draft")
  sourceBucketRules Json     @default("{}") @map("source_bucket_rules")
  tocTemplate       Json     @default("[]") @map("toc_template")
  ontologySchema    Json     @default("{}") @map("ontology_schema")
  citationRules     Json     @default("[]") @map("citation_rules")
  sectionRules      Json     @default("[]") @map("section_rules")
  createdBy         String   @map("created_by") @db.Uuid
  updatedBy         String   @map("updated_by") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  archivedAt        DateTime? @map("archived_at") @db.Timestamptz(6)
  runs              KnowledgeGenerationRun[]

  @@unique([name, version])
  @@index([state, updatedAt])
  @@map("knowledge_generation_profiles")
}

model KnowledgeGenerationRun {
  id                         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recordId                   String   @map("record_id") @db.Uuid
  profileId                  String   @map("profile_id") @db.Uuid
  profileVersion             Int      @map("profile_version")
  sourceBundleDigest         String   @map("source_bundle_digest")
  promptDigest               String   @map("prompt_digest")
  legalVerificationStatus    String   @default("not_required") @map("legal_verification_status")
  legalVerificationDigest    String   @default("") @map("legal_verification_digest")
  projectContextTraceDigest  String   @default("") @map("project_context_trace_digest")
  provider                   String   @default("mock")
  model                      String   @default("mock")
  structuredDraft            Json     @default("{}") @map("structured_draft")
  warnings                   Json     @default("[]")
  createdBy                  String   @map("created_by") @db.Uuid
  createdAt                  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  profile                    KnowledgeGenerationProfile @relation(fields: [profileId], references: [id], onDelete: Restrict)

  @@index([recordId, createdAt])
  @@index([profileId, createdAt])
  @@map("knowledge_generation_runs")
}
```

- [x] **Step 2: Add SQL constraints and one-active profile guard**

Create migration SQL with:

```sql
alter table "knowledge_items"
  add constraint "knowledge_items_state_check" check ("state" in ('draft', 'active', 'archived'));

alter table "knowledge_items"
  add constraint "knowledge_items_scope_check" check ("scope" in ('admin_only', 'organization', 'project_members', 'project'));

alter table "knowledge_items"
  add constraint "knowledge_items_scope_project_check"
  check (
    ("scope" = 'organization' and "project_id" is null)
    or ("scope" in ('admin_only', 'project_members', 'project') and "project_id" is not null)
  );

alter table "knowledge_item_versions"
  add constraint "knowledge_item_versions_state_check" check ("state" in ('draft', 'approved', 'superseded', 'archived'));

alter table "knowledge_source_references"
  add constraint "knowledge_source_references_source_kind_check"
  check ("source_kind" in ('legal_evidence', 'task_context', 'project_document', 'approved_wiki', 'local_wiki', 'external_evidence'));

alter table "knowledge_source_references"
  add constraint "knowledge_source_references_allowed_use_check"
  check ("allowed_use" in ('legal_basis', 'context', 'comparison', 'citation', 'do_not_publish'));

alter table "knowledge_generation_profiles"
  add constraint "knowledge_generation_profiles_state_check" check ("state" in ('draft', 'active', 'archived'));

create unique index "knowledge_generation_profiles_one_active"
  on "knowledge_generation_profiles" ("name")
  where "state" = 'active';

create index "knowledge_item_versions_search_idx"
  on "knowledge_item_versions"
  using gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("body_markdown", '')));

create unique index "knowledge_items_organization_slug_unique"
  on "knowledge_items" ("slug")
  where "scope" = 'organization';
```

- [x] **Step 3: Add data contract validator**

Create `scripts/structured-knowledge-data-contract-validate.ts` that asserts every model, mapped table name, state check, source kind check, one-active profile index, scope/project consistency check, organization slug partial unique index, migration file, and package script exists.

This Task 3 validator must not assert route files that are created in later tasks. Route existence and route guard checks belong to the profile, source-bucket, generation, and security validators in Tasks 5-7.

It must also assert `publicId`, `sourceRecordId`, the unique source-record guard, `KnowledgeSourceReference.versionId`, and the structured FTS index exist.

- [x] **Step 4: Add parity validator**

Create `scripts/structured-knowledge-parity-validate.ts` to assert:

- legacy `ApprovedKnowledgeItem` fields remain in `src/domains/assistant/types.ts`
- structured rows preserve legacy public IDs
- backfill is idempotent by source record id
- `GET /api/admin/knowledge/items` payload shape remains `ApprovedKnowledgeItem[]`
- search scope still permits same project plus `organization`
- unrelated project, `pending_review`, rejected, discovery request, and import preview records are excluded
- duplicate results are deduped by public id/source record id

- [x] **Step 5: Register and run data gates**

Add:

```json
"structured-knowledge:data-contract:validate": "tsx scripts/structured-knowledge-data-contract-validate.ts",
"structured-knowledge:parity:validate": "tsx scripts/structured-knowledge-parity-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:data-contract:validate
npm run structured-knowledge:parity:validate
npm run db:generate
npx prisma validate
npm run deploy:migration-gate
```

Expected:

```text
structured-knowledge-data-contract-validate: ok
structured-knowledge-parity-validate: ok
Prisma schema is valid
Migration gate passes, or exits 0 with an explicit local skip when APP_BACKEND_MODE=cloud and DATABASE_URL are not both configured
```

## Task 4: Add Structured Knowledge Repository Layer

**Files:**
- Create: `src/repositories/knowledge/contracts.ts`
- Create: `src/repositories/knowledge/postgres-store.ts`
- Create: `src/repositories/knowledge/local-store.ts`
- Create: `src/repositories/knowledge/index.ts`
- Create: `scripts/structured-knowledge-repository-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Define repository contract**

`src/repositories/knowledge/contracts.ts` must export:

```ts
import type { StructuredKnowledgeDraft, KnowledgeGenerationProfile, KnowledgeSourceRef } from "@/domains/knowledge/structured-knowledge";

export type CreateKnowledgeItemInput = {
  publicId: string;
  projectId: string | null;
  title: string;
  slug: string;
  scope: string;
  tags: string[];
  ontology: StructuredKnowledgeDraft["ontology"];
  createdBy: string;
};

export type PublishKnowledgeVersionInput = {
  itemId: string;
  sourceRecordId: string | null;
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  title: string;
  summary: string;
  bodyMarkdown: string;
  structuredDraft: StructuredKnowledgeDraft;
  toc: StructuredKnowledgeDraft["toc"];
  sectionBlocks: StructuredKnowledgeDraft["sections"];
  sourceRefs: KnowledgeSourceRef[];
  generationRunId: string | null;
  approvedBy: string;
};

export type StructuredKnowledgeRepository = {
  createItem(input: CreateKnowledgeItemInput): Promise<{ id: string; publicId: string }>;
  publishVersion(input: PublishKnowledgeVersionInput): Promise<{ itemId: string; versionId: string; version: number }>;
  listApprovedItems(input?: { projectId?: string | null }): Promise<StructuredKnowledgeDraft[]>;
  getActiveGenerationProfile(name: string): Promise<KnowledgeGenerationProfile | null>;
};
```

- [x] **Step 2: Implement Postgres store**

`postgres-store.ts` must use Prisma transactions when publishing:

```ts
const result = await prisma.$transaction(async (tx) => {
  const latest = await tx.knowledgeItemVersion.findFirst({
    where: { itemId: input.itemId },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const created = await tx.knowledgeItemVersion.create({
    data: {
      itemId: input.itemId,
      version,
      state: "approved",
      title: input.title,
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      structuredDraft: input.structuredDraft,
      toc: input.toc,
      sectionBlocks: input.sectionBlocks,
      contentDigest: createDigest(input.bodyMarkdown),
      sourceDigest: createDigest(JSON.stringify(input.sourceRefs)),
      sourceRecordId: input.sourceRecordId,
      sourceTaskId: input.sourceTaskId,
      sourceProjectId: input.sourceProjectId,
      generationRunId: input.generationRunId,
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
    },
  });
  await tx.knowledgeSourceReference.createMany({
    data: input.sourceRefs.map((source) => ({
      itemId: input.itemId,
      versionId: created.id,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      title: source.title,
      locator: source.locator,
      excerpt: source.excerpt,
      sourceUrl: source.sourceUrl,
      digest: source.digest,
      authorityRank: source.authorityRank,
      verifiedAt: source.verifiedAt ? new Date(source.verifiedAt) : null,
      stale: source.stale,
      legalChangeWarnings: source.legalChangeWarnings,
      allowedUse: source.allowedUse,
    })),
  });
  await tx.knowledgeItem.update({ where: { id: input.itemId }, data: { state: "active", updatedBy: input.approvedBy } });
  return { itemId: input.itemId, versionId: created.id, version };
});
```

Source references are version-scoped. A later version may change source coverage without altering the audit trail of older approved versions.

- [x] **Step 3: Implement local store**

`local-store.ts` must mirror version increment, source refs, and active profile behavior without Prisma.

- [x] **Step 4: Add repository validator**

Create `scripts/structured-knowledge-repository-validate.ts` to assert:

- repository contract exports `StructuredKnowledgeRepository`
- postgres store uses `prisma.$transaction`
- publish path writes `knowledgeItemVersion`, `knowledgeSourceReference`, and `knowledgeItem.update`
- publish path writes `KnowledgeSourceReference.versionId`
- local store has version increment behavior
- repository contract preserves `publicId`
- publish path writes `sourceRecordId`, `sourceTaskId`, and `sourceProjectId`

- [x] **Step 5: Register and verify**

Add:

```json
"structured-knowledge:repository:validate": "tsx scripts/structured-knowledge-repository-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:repository:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-repository-validate: ok
tsc exits 0
```

## Task 5: Add Generation Profiles And Admin Routes

**Files:**
- Modify: `src/lib/auth/knowledge-guards.ts`
- Create: `src/use-cases/admin/knowledge-generation-profile-service.ts`
- Create: `src/app/api/admin/knowledge/generation-profiles/route.ts`
- Create: `src/app/api/admin/knowledge/generation-profiles/[profileId]/activate/route.ts`
- Create: `src/app/api/admin/knowledge/generation-profiles/[profileId]/rollback/route.ts`
- Create: `scripts/structured-knowledge-profile-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Add capabilities**

Add capabilities:

```ts
| "knowledge.generation.manage"
| "knowledge.generation.activate"
```

Add both to `allKnowledgeAdminCapabilities`.

- [x] **Step 2: Create profile service**

`knowledge-generation-profile-service.ts` must expose:

```ts
export async function listKnowledgeGenerationProfiles() {}
export async function getOrCreateActiveKnowledgeGenerationProfile(user: AuthUser) {}
export async function createKnowledgeGenerationProfileDraft(input: { user: AuthUser; name: string; sourceBucketRules: unknown; tocTemplate: unknown; ontologySchema: unknown; citationRules: unknown; sectionRules: unknown }) {}
export async function activateKnowledgeGenerationProfile(profileId: string, user: AuthUser) {}
export async function rollbackKnowledgeGenerationProfile(input: { profileId: string; reason: string; user: AuthUser }) {}
```

Default active profile content:

```ts
const defaultProfileName = "approved-wiki-generation-profile";
const defaultSourceBucketRules = {
  legal_evidence: { required: false, maxItems: 8 },
  task_context: { required: true, maxItems: 4 },
  project_document: { required: false, maxItems: 8 },
  approved_wiki: { required: false, maxItems: 6 },
  local_wiki: { required: false, maxItems: 6 },
  external_evidence: { required: false, maxItems: 6 },
};
const defaultTocTemplate = [
  { id: "summary", level: 2, title: "요약", purpose: "summary", required: true },
  { id: "applicability", level: 2, title: "적용 기준", purpose: "applicability", required: true },
  { id: "procedure", level: 2, title: "확인 절차", purpose: "procedure", required: true },
  { id: "evidence", level: 2, title: "근거", purpose: "evidence", required: true },
  { id: "exceptions", level: 2, title: "예외 / 주의", purpose: "exception", required: true },
  { id: "related", level: 2, title: "관련 WIKI", purpose: "related", required: false },
];
```

- [x] **Step 3: Create routes**

Every mutation route must call:

```ts
assertRequestIntegrity(request);
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "knowledge.generation.manage");
```

Activation and rollback use `"knowledge.generation.activate"`.

Update `scripts/knowledge-wiki-security-validate.ts` route matrix with:

- `src/app/api/admin/knowledge/generation-profiles/route.ts` -> `knowledge.generation.manage`
- `src/app/api/admin/knowledge/generation-profiles/[profileId]/activate/route.ts` -> `knowledge.generation.activate`
- `src/app/api/admin/knowledge/generation-profiles/[profileId]/rollback/route.ts` -> `knowledge.generation.activate`

- [x] **Step 4: Add profile validator**

Create `scripts/structured-knowledge-profile-validate.ts` to assert capabilities, route guards, default TOC, one-active transaction, rollback audit, and no raw prompt secrets in API output.

The validator must also assert `defaultSourceBucketRules.task_context.required === true` and every source kind has an explicit required/maxItems rule.

- [x] **Step 5: Register and verify**

Add:

```json
"structured-knowledge:profile:validate": "tsx scripts/structured-knowledge-profile-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:profile:validate
npm run knowledge-wiki:security:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-profile-validate: ok
security route and transition guards ok
tsc exits 0
```

## Task 6: Build Source Buckets For WIKI Drafting

**Files:**
- Create: `src/use-cases/admin/knowledge-response-sanitizer.ts`
- Create: `src/use-cases/admin/knowledge-source-bucket-service.ts`
- Create: `src/app/api/admin/knowledge/candidates/[recordId]/source-buckets/route.ts`
- Create: `scripts/structured-knowledge-source-buckets-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Implement source bucket service**

The service must return:

```ts
export type KnowledgeSourceBucket = {
  kind: KnowledgeSourceKind;
  label: string;
  required: boolean;
  items: KnowledgeSourceRef[];
  warnings: string[];
};
```

Source mapping rules:

- `AssistantEvidence.kind === "regulation"` or `evidence.legal` maps to `legal_evidence`.
- Candidate `question`, `answer`, `taskId`, and `taskIssueId` map to `task_context` with `allowedUse: "context"`.
- Project upload chunks returned by existing retrieval traces map to `project_document`.
- `assistantRepository.searchApprovedKnowledge()` results map to `approved_wiki`.
- Local import candidate source metadata maps to `local_wiki`.
- External evidence records map to `external_evidence`.

- [x] **Step 2: Preserve source boundaries**

The service must keep these restrictions:

```ts
if (sourceKind === "project_document") allowedUse = "context";
if (sourceKind === "legal_evidence" && !verifiedAt) warnings.push("법규 근거 확인 시점 누락");
if (sourceKind === "local_wiki" && !digest) warnings.push("로컬 WIKI digest 누락");
```

All outbound source bucket data must pass through `knowledge-response-sanitizer.ts`.

The sanitizer must redact:

- Windows absolute paths such as `C:\Users\name\...`
- UNC paths such as `\\server\share\...`
- POSIX absolute paths such as `/home/name/...`
- `.env` fragments
- provider usage/cost fields
- raw prompt text
- secret-like key/token strings

- [x] **Step 3: Add source bucket route**

Route:

```text
GET /api/admin/knowledge/candidates/[recordId]/source-buckets
```

Guards:

```ts
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "knowledge.candidates.review");
await requireCurrentProjectAccess(user);
```

The route or service must re-read the candidate by `recordId` and verify the candidate project matches the current project access context before returning source buckets.

Update `scripts/knowledge-wiki-security-validate.ts` route matrix with:

- `src/app/api/admin/knowledge/candidates/[recordId]/source-buckets/route.ts` -> `knowledge.candidates.review`

- [x] **Step 4: Add source bucket validator**

Create `scripts/structured-knowledge-source-buckets-validate.ts` to assert:

- all six source kinds exist
- route requires knowledge admin
- legal/project/local source rules are present
- raw local absolute paths are redacted
- raw prompt text, provider usage, provider cost, `.env` fragments, and secret-like strings are redacted
- source bucket output never serializes provider usage or secret-like strings
- source bucket service does not read `LAW_OPEN_DATA_OC` and uses the verified legal evidence boundary already validated by `ai-review:readiness`

- [x] **Step 5: Register and verify**

Add:

```json
"structured-knowledge:source-buckets:validate": "tsx scripts/structured-knowledge-source-buckets-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:source-buckets:validate
npm run ai-review:readiness
npm run legal-search:validate
npm run project-context:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-source-buckets-validate: ok
AI review readiness passes
legal-search validator passes
project-context validator passes
tsc exits 0
```

## Task 7: Generate Structured WIKI Drafts

**Files:**
- Create: `src/use-cases/admin/knowledge-structured-draft-service.ts`
- Create: `src/app/api/admin/knowledge/candidates/[recordId]/structured-draft/route.ts`
- Create: `scripts/structured-knowledge-generation-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Implement structured draft renderer**

Create a pure renderer:

```ts
export function renderStructuredKnowledgeMarkdown(draft: StructuredKnowledgeDraft) {
  return [
    `# ${draft.title}`,
    "",
    "## 목차",
    ...draft.toc.map((item) => `${"  ".repeat(item.level - 1)}- [${item.title}](#${readTocAnchor(item, draft.sections)})`),
    "",
    "## 출처 범위",
    ...summarizeSourceCoverage(draft.sourceRefs),
    "",
    ...draft.sections.flatMap((section) => [
      `## ${section.heading} {#${section.anchor}}`,
      "",
      section.bodyMarkdown.trim(),
      "",
    ]),
    draft.ontology.relations.length ? "## 관련 WIKI" : "",
    ...draft.ontology.relations.map((relation) => `- ${relation.kind}: ${relation.targetId} - ${relation.reason}`),
  ].join("\n").trim();
}
```

The renderer must not append task id, assistant record id, provider, usage, or cost. It must render TOC links using stable `section.anchor` values and every `KnowledgeSection.tocId` must match a `KnowledgeTocItem.id`.

- [x] **Step 2: Implement draft generation service**

The service must:

1. Load candidate detail.
2. Load active generation profile.
3. Build source buckets.
4. Create source bundle digest.
5. Build prompt text from source buckets and profile.
6. Produce `StructuredKnowledgeDraft`.
7. Store `KnowledgeGenerationRun`.
8. Return draft, profile id/version, run id, warnings.

The prompt text must include these section labels:

```text
Legal evidence bucket:
Task context bucket:
Project document bucket:
Approved WIKI bucket:
Local WIKI bucket:
External evidence bucket:
Ontology requirements:
TOC requirements:
Citation requirements:
Integrated reasoning requirements:
```

The integrated reasoning output must include:

```ts
reasoningSummary: string;
claimEvidenceMatrix: Array<{
  claim: string;
  sourceRefIds: string[];
  confidence: "high" | "medium" | "low";
  conflicts: string[];
  gaps: string[];
}>;
```

- [x] **Step 3: Add generation route**

Route:

```text
POST /api/admin/knowledge/candidates/[recordId]/structured-draft
```

Guards:

```ts
assertRequestIntegrity(request);
const user = await requireKnowledgeAdmin();
assertKnowledgeCapability(user, "knowledge.candidates.review");
await requireCurrentProjectAccess(user);
```

The generation route must re-read the candidate and verify current project access before generating any draft.

Update `scripts/knowledge-wiki-security-validate.ts` route matrix with:

- `src/app/api/admin/knowledge/candidates/[recordId]/structured-draft/route.ts` -> `knowledge.candidates.review`

- [x] **Step 4: Add generation validator**

Create `scripts/structured-knowledge-generation-validate.ts` to assert:

- prompt has all source bucket labels
- prompt has `Integrated reasoning requirements:`
- renderer excludes `Provider:`, `사용량:`, `estimatedCost`, `assistant record`, `task:`
- renderer includes `## 목차`, stable anchors, `## 출처 범위`, and `## 관련 WIKI` when relations exist
- every section has `tocId` and `anchor`
- generated draft includes ontology, TOC, sections, source refs
- generated draft includes `reasoningSummary`, `claimEvidenceMatrix`, and `approvalReadiness`
- generation run stores profile version and digests
- no raw prompt text is exposed in admin list APIs

- [x] **Step 5: Register and verify**

Add:

```json
"structured-knowledge:generation:validate": "tsx scripts/structured-knowledge-generation-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:generation:validate
npm run assistant-thread-memory:validate
npm run task-review:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-generation-validate: ok
assistant thread memory validator passes
task review validator passes
tsc exits 0
```

## Task 8: Publish Structured Knowledge On Approval

**Files:**
- Create: `src/use-cases/admin/structured-knowledge-service.ts`
- Create: `scripts/backfill-structured-approved-wiki.ts`
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Create: `scripts/structured-knowledge-approval-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Create publish service**

`structured-knowledge-service.ts` must export:

```ts
import type { Prisma } from "@prisma/client";

export async function publishStructuredKnowledgeFromCandidate(input: {
  tx: Prisma.TransactionClient;
  recordId: string;
  legacyPublicId: string;
  draft: StructuredKnowledgeDraft;
  generationRunId: string | null;
  approvedBy: string;
}) {
  // uses input.tx only
  // creates or updates KnowledgeItem
  // publishes KnowledgeItemVersion
  // writes version-scoped KnowledgeSourceReference rows
  // returns legacy ApprovedKnowledgeItem snapshot fields
}
```

The publish service must preserve stable public item identity:

```ts
const publicId = input.legacyPublicId || createStableKnowledgePublicId(input.recordId);
```

For an existing approved snapshot, `legacyPublicId` must be `approvedKnowledgeItem.id`.

- [x] **Step 2: Add idempotent backfill script**

Create `scripts/backfill-structured-approved-wiki.ts`.

The script must:

- read approved records with `metadata.approvedKnowledgeItem`
- run in dry-run mode by default
- skip records that already have a structured row by `sourceRecordId`
- preserve `approvedKnowledgeItem.id` as `KnowledgeItem.publicId`
- preserve legacy DTO fields
- write source refs from existing `sourceReferences`
- print counts only, not raw body text or secret-like values

Expected output shape:

```text
structured approved wiki backfill: scanned <n>, inserted <n>, skipped <n>
```

Running backfill without `--dry-run` is a database write and requires fresh user approval under the harness approval policy.

- [x] **Step 3: Modify approval path**

`reviewKnowledgeCandidate()` must call the publish service for approvals and still write `metadata.approvedKnowledgeItem` in the same logical approval operation. The resulting legacy snapshot must include:

Postgres implementation must perform these writes in one `prisma.$transaction`:

1. Re-read candidate and current state.
2. Enforce `candidateState in ["candidate", "pending_review"]` with the existing state transition guard.
3. Call `publishStructuredKnowledgeFromCandidate({ tx, ... })`.
4. Update `assistant_task_records.candidate_state`.
5. Update `assistant_task_records.metadata.knowledgeReview`.
6. Update `assistant_task_records.metadata.approvedKnowledgeItem`.

If any step fails, neither the structured records nor the legacy snapshot may be committed. The local store must mirror this as an all-or-nothing operation.

```ts
{
  id: structuredPublicId,
  structuredKnowledgeItemId,
  structuredKnowledgeVersionId,
  generationRunId,
  bodyMarkdown: renderStructuredKnowledgeMarkdown(draft),
  sourceReferences: legacySourceReferencesFromStructuredRefs(draft.sourceRefs)
}
```

Reject path remains unchanged except for preserving structured draft metadata.

The approval path must reject drafts with blocking readiness issues:

```ts
if (draft.approvalReadiness.status === "blocked") {
  throw conflict("Structured WIKI draft has blocking review issues.", "STRUCTURED_WIKI_APPROVAL_BLOCKED");
}
```

Initial implementation does not support override approval. If override is added later it must require a reason and append-only audit event.

- [x] **Step 4: Add approval validator**

Create `scripts/structured-knowledge-approval-validate.ts` to assert:

- approval path calls `publishStructuredKnowledgeFromCandidate`
- approval path passes a transaction client to `publishStructuredKnowledgeFromCandidate`
- postgres approval path uses one `prisma.$transaction` for candidate state update, structured publish, source refs, and legacy metadata snapshot
- approval path still calls `assertKnowledgeCandidateReviewTransition`
- approval path preserves legacy public id
- approval path writes structured row and legacy metadata snapshot
- approval path rejects `approvalReadiness.status === "blocked"`
- legacy snapshot optional structured ids exist
- body Markdown exclusion patterns are enforced
- `sourceReferences` are derived from structured source refs
- backfill script is idempotent by `sourceRecordId`
- `pending_review`, import preview, and discovery request central exclusion still passes

- [x] **Step 5: Register and verify**

Add:

```json
"structured-knowledge:approval:validate": "tsx scripts/structured-knowledge-approval-validate.ts",
"structured-knowledge:backfill": "tsx scripts/backfill-structured-approved-wiki.ts"
```

Run:

```powershell
npm run structured-knowledge:approval:validate
npm run structured-knowledge:parity:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-approval-validate: ok
structured-knowledge-parity-validate: ok
central knowledge exclusion passes
security route and transition guards ok
tsc exits 0
```

## Task 9: Update Approved WIKI Readback And Search Compatibility

**Files:**
- Modify: `src/use-cases/admin/knowledge-service.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Create: `scripts/structured-knowledge-readback-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Read structured records first**

`listApprovedKnowledgeItems()` must read structured approved versions first and map them to `ApprovedKnowledgeItem`. If no structured versions exist, it must fall back to existing metadata snapshots.

Deduping rule:

```text
Prefer structured item when structured.publicId === legacy approvedKnowledgeItem.id
Fallback to legacy snapshot only when no structured item exists for that public id or sourceRecordId.
```

- [x] **Step 2: Keep search compatibility**

`searchApprovedKnowledge()` must search:

1. structured active approved versions
2. existing `metadata.approvedKnowledgeItem` snapshots as fallback

It must still exclude:

- `pending_review`
- `rejected`
- discovery requests
- import previews
- structured draft versions not in approved state
- unrelated project items

It must preserve existing inclusion semantics:

```text
include if item.projectId === currentProjectId
include if item.scope === "organization"
exclude all other project-scoped items
```

- [x] **Step 3: Add readback validator**

Create `scripts/structured-knowledge-readback-validate.ts` to assert:

- structured path is preferred
- legacy fallback remains
- legacy public id remains stable
- search excludes unapproved structured versions
- search preserves organization plus same-project scope semantics
- export stats include structured source refs
- no duplicate item appears when both structured and snapshot data exist

- [x] **Step 4: Register and verify**

Add:

```json
"structured-knowledge:readback:validate": "tsx scripts/structured-knowledge-readback-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:readback:validate
npm run structured-knowledge:parity:validate
npm run knowledge-wiki:central-exclusion:validate
npm run retrieval:hybrid:validate
npm run typecheck
```

Expected:

```text
structured-knowledge-readback-validate: ok
structured-knowledge-parity-validate: ok
central knowledge exclusion passes
hybrid retrieval validator passes
tsc exits 0
```

## Task 10: Add Structured Draft Admin UI

**Files:**
- Create: `src/components/admin/knowledge-source-bucket-panel.tsx`
- Create: `src/components/admin/knowledge-ontology-editor.tsx`
- Create: `src/components/admin/knowledge-toc-editor.tsx`
- Create: `src/components/admin/knowledge-structured-draft-panel.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `src/components/admin/knowledge-admin-tabs.ts`
- Create: `scripts/structured-knowledge-ui-contract-validate.ts`
- Modify: `package.json`

- [x] **Step 1: Render source buckets**

`knowledge-source-bucket-panel.tsx` must render six buckets with labels:

```ts
const sourceBucketLabels = {
  legal_evidence: "법규 근거",
  task_context: "Task 맥락",
  project_document: "프로젝트 자료",
  approved_wiki: "기존 승인 WIKI",
  local_wiki: "로컬 WIKI",
  external_evidence: "외부 근거",
};
```

Warnings must use warning visual treatment. Empty optional buckets must be muted. Empty required buckets must be blocking.

- [x] **Step 2: Render ontology editor**

`knowledge-ontology-editor.tsx` must edit:

- concept label
- category
- scope
- relations
- relation reason

It must not show provider, usage, or cost.

- [x] **Step 3: Render TOC editor**

`knowledge-toc-editor.tsx` must show required sections:

- 요약
- 적용 기준
- 확인 절차
- 근거
- 예외 / 주의

Missing required sections must be blocking before approval.

- [x] **Step 4: Integrate into Draft tab**

Before adding more state to `knowledge-admin-shell.tsx`, move the new draft surfaces into the focused component files listed above. `knowledge-admin-shell.tsx` should orchestrate data loading, selected candidate state, and API calls only.

In `knowledge-admin-shell.tsx`, replace the current draft body-first hierarchy with:

1. Source buckets
2. Integrated reasoning summary
3. Ontology
4. TOC
5. Section editor
6. Markdown preview
7. Collapsed generation metadata

The plain Markdown textarea can remain as an advanced editor but must be below structure controls.

- [x] **Step 5: Add draft subview URL state**

Extend `src/components/admin/knowledge-admin-tabs.ts` with:

```ts
export type KnowledgeDraftSubview = "sources" | "reasoning" | "ontology" | "toc" | "sections" | "preview" | "metadata";
```

Add `draftSubview` to `KnowledgeAdminNavigation`. Rules:

- invalid `draftSubview` falls back to `sources`
- switching subviews uses `router.push`
- advanced metadata is addressable as `draftSubview=metadata` but remains visually secondary
- draft subview does not authorize any mutation

- [x] **Step 6: Add UI contract validator**

Create `scripts/structured-knowledge-ui-contract-validate.ts` to assert:

- component files exist
- draft tab imports structured components
- `knowledge-admin-tabs.ts` defines `KnowledgeDraftSubview`
- URL parsing includes `draftSubview`
- all six source bucket labels exist
- TOC required section labels exist
- integrated reasoning summary and claim-evidence matrix labels exist
- blocking/warning/ready issue labels exist
- generation metadata is collapsed
- draft UI text does not present task id/provider/usage as WIKI body content

- [x] **Step 7: Register and verify**

Add:

```json
"structured-knowledge:ui-contract:validate": "tsx scripts/structured-knowledge-ui-contract-validate.ts"
```

Run:

```powershell
npm run structured-knowledge:ui-contract:validate
npx eslint src\components\admin\knowledge-admin-shell.tsx src\components\admin\knowledge-source-bucket-panel.tsx src\components\admin\knowledge-ontology-editor.tsx src\components\admin\knowledge-toc-editor.tsx src\components\admin\knowledge-structured-draft-panel.tsx
npm run typecheck
```

Expected:

```text
structured-knowledge-ui-contract-validate: ok
ESLint exits 0
tsc exits 0
```

## Task 11: Add Generation Profile Admin UI

**Files:**
- Create: `src/components/admin/knowledge-generation-profile-panel.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.tsx`
- Modify: `src/components/admin/knowledge-admin-shell.module.css`
- Modify: `scripts/structured-knowledge-ui-contract-validate.ts`

- [x] **Step 1: Add read-only active profile summary**

The panel must show:

- active profile name
- version
- state
- TOC template count
- citation rule count
- section rule count
- last updated

- [x] **Step 2: Add draft edit surface**

The panel must allow admin to edit JSON arrays for:

- source bucket rules
- TOC template
- ontology schema
- citation rules
- section rules

The panel must show parse errors inline and keep activation disabled until JSON parses.

The initial UI may use JSON editors for power-user speed, but it must include:

- before/after diff preview for profile drafts
- sample candidate dry-run button for the selected candidate
- activation impact summary showing source bucket rules, TOC template count, ontology schema keys, citation rule count, and section rule count

- [x] **Step 3: Add activate and rollback controls**

Activation and rollback must require:

- explicit confirmation text
- rollback reason
- server route result
- audit status message

- [x] **Step 4: Verify UI contract**

Run:

```powershell
npm run structured-knowledge:ui-contract:validate
npx eslint src\components\admin\knowledge-generation-profile-panel.tsx src\components\admin\knowledge-admin-shell.tsx
npm run typecheck
```

Expected:

```text
structured-knowledge-ui-contract-validate: ok
ESLint exits 0
tsc exits 0
```

## Task 12: Add Full Verification Gate And Browser Smoke

**Files:**
- Create: `scripts/structured-knowledge-preview-smoke.ts`
- Modify: `package.json`
- Update: `docs/worklogs/2026-06-15-structured-approved-wiki.md`

- [x] **Step 1: Create Playwright smoke**

The smoke must open these local routes:

```text
/admin/knowledge?work=candidates&candidateTab=evidence
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sources
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=reasoning
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=ontology
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=toc
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sections
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=preview
/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=metadata
/admin/knowledge?work=candidates&candidateTab=decision
/admin/knowledge?work=approved
/admin/knowledge?work=local_import
/admin/knowledge?work=operations
```

It must collect:

- page errors
- console errors
- failed `/api/admin/knowledge/*` responses
- source bucket labels
- TOC required labels
- reasoning and claim-evidence matrix labels
- blocking/warning/ready issue labels
- active profile label
- profile edit/diff/activation controls

- [x] **Step 2: Register smoke**

Add:

```json
"structured-knowledge:preview-smoke": "tsx scripts/structured-knowledge-preview-smoke.ts"
```

- [x] **Step 3: Run full static gate**

Run:

```powershell
npm run structured-knowledge:domain:validate
npm run structured-knowledge:data-contract:validate
npm run structured-knowledge:parity:validate
npm run structured-knowledge:repository:validate
npm run structured-knowledge:profile:validate
npm run structured-knowledge:source-buckets:validate
npm run structured-knowledge:generation:validate
npm run structured-knowledge:approval:validate
npm run structured-knowledge:readback:validate
npm run structured-knowledge:ui-contract:validate
npm run knowledge-admin:tabs:validate
npm run knowledge-wiki:data-contract:validate
npm run knowledge-wiki:central-exclusion:validate
npm run knowledge-wiki:security:validate
npm run knowledge-discovery-scan:validate
npm run knowledge-wiki:preview-smoke
npm run ai-review:readiness
npm run task-review:validate
npm run project-context:validate
npm run legal-search:validate
npm run verified-legal-candidate-import:validate
npm run db:generate
npx prisma validate
npm run deploy:migration-gate
npm run structured-knowledge:backfill -- --dry-run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected:

```text
All commands exit 0
```

- [x] **Step 4: Run browser smoke**

Run:

```powershell
npm run structured-knowledge:preview-smoke
```

Expected:

```text
structured-knowledge-preview-smoke: ok
```

- [x] **Step 5: Update worklog**

Update `docs/worklogs/2026-06-15-structured-approved-wiki.md`:

```text
Req: make approved WIKI structured source-of-truth with ontology, TOC, source buckets, and versioned generation profiles.
Diff: <files changed and behavior changed>
Why: approved WIKI must store durable reusable knowledge, not task transcript Markdown.
Verify: <commands run and result>
Time: <Asia/Seoul timestamp>
```

## Task 13: Reviewer And Manager Closeout

**Files:**
- Modify: `docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md`
- Update: `docs/worklogs/2026-06-15-structured-approved-wiki.md`

- [x] **Step 1: Product review**

`ch` reviews:

- source bucket labels are understandable
- draft tab hierarchy puts required work before optional metadata
- TOC quality is visible before approval
- warning/blocked/ready states are visually distinct

- [x] **Step 2: Engineering/security review**

`ul` reviews:

- no raw prompt text, local path, credential, provider usage, or secret-like value is exposed
- route guards use `assertRequestIntegrity`, `requireKnowledgeAdmin`, and exact capabilities
- pending/import/discovery records cannot enter central retrieval
- structured tables and legacy snapshot do not create duplicate retrieval results

- [x] **Step 3: Manager checklist**

`choi` checks every task checkbox and records:

```text
Manager closeout:
- Task 1: complete / evidence
- Task 2: complete / evidence
- Task 3: complete / evidence
- Task 4: complete / evidence
- Task 5: complete / evidence
- Task 6: complete / evidence
- Task 7: complete / evidence
- Task 8: complete / evidence
- Task 9: complete / evidence
- Task 10: complete / evidence
- Task 11: complete / evidence
- Task 12: complete / evidence
- Task 13: complete / evidence
```

- [x] **Step 4: Final status**

The goal may be marked complete only after:

- every checkbox is checked
- full static gate passes
- browser smoke passes
- worklog has verification evidence
- reviewers have no blocking findings
- user receives changed files, verification commands, and residual risk summary

## Planning Self-Review

Spec coverage:

- Durable structured WIKI source of truth: Task 2, Task 3, Task 4, Task 8.
- Markdown as rendered artifact: Task 7, Task 8.
- Legal, task, project document, approved WIKI, local WIKI, external evidence buckets: Task 6, Task 10.
- Ontology and TOC: Task 2, Task 5, Task 7, Task 10.
- Admin-editable prompt/profile with versioning and rollback: Task 5, Task 11.
- Existing WIKI simplification compatibility: Task 8, Task 9, Task 12.
- Regression prevention: Task 2 through Task 12 validators.
- Harness manager/worker/reviewer closeout: Task 13.

Placeholder scan:

- No placeholder markers, incomplete sections, or undefined future decisions are required for implementation start.
- Every task lists exact files, commands, and expected results.

Type consistency:

- `StructuredKnowledgeDraft`, `KnowledgeSourceRef`, `KnowledgeGenerationProfile`, `KnowledgeSourceKind`, and related names are introduced in Task 2 and reused consistently.
- Structured repository publish outputs `itemId`, `versionId`, and `version`; approval stores optional `structuredKnowledgeItemId` and `structuredKnowledgeVersionId`.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-15-structured-approved-wiki-plan.md`.

Execution mode selected by user: **Subagent/Harness Driven**.

Recommended first implementation split:

- `hy`: Task 1 through Task 5.
- `ung`: Task 10 and Task 11 after Task 6/7 API contracts exist.
- `choi`: Task 6 through Task 9 integration and all final verification.
- `ch`: product/UX review after Task 10.
- `ul`: security/repository review after Task 8 and Task 12.

## Manager Closeout

Status: original implementation landed; release signoff is pending the follow-up review-fix gate in `2026-06-16-structured-approved-wiki-review-fixes-plan.md`.

- [x] Task 1: Governance contract recorded in `docs/superpowers/specs/2026-06-15-structured-approved-wiki-design.md` and worklog initialized.
- [x] Task 2: Structured knowledge domain model and assistant metadata extensions added; `npm run structured-knowledge:domain:validate` passed.
- [x] Task 3: Prisma persistence and migration added; `npm run structured-knowledge:data-contract:validate` and `npm run structured-knowledge:parity:validate` passed.
- [x] Task 4: Structured knowledge repository contract/local/Postgres stores added; `npm run structured-knowledge:repository:validate` passed.
- [x] Task 5: Versioned generation profile service/routes added; `npm run structured-knowledge:profile:validate` passed.
- [x] Task 6: Source bucket service and guarded route added; `npm run structured-knowledge:source-buckets:validate` passed.
- [x] Task 7: Deterministic structured draft generation and route added; `npm run structured-knowledge:generation:validate` passed.
- [x] Task 8: Approval publish path, lineage, and dry-run backfill added; `npm run structured-knowledge:approval:validate` and dry-run backfill passed.
- [x] Task 9: Structured-first approved WIKI readback/search added with legacy fallback; `npm run structured-knowledge:readback:validate` passed.
- [x] Task 10: Structured draft admin UI added with source buckets, ontology, TOC, sections, preview, and collapsed metadata; `npm run structured-knowledge:ui-contract:validate` passed.
- [x] Task 11: Generation Profile admin UI added with diff, dry-run, activation, and rollback controls; UI/profile validators passed.
- [x] Task 12: Original local gate passed for the first implementation; follow-up gate now includes sourceRef identity, structured-draft-required approval, behavior validation, schema preflight, and no-skip release smoke.
- [x] Task 13: Initial product/security reviews completed. Additional review findings are tracked and fixed in the 2026-06-16 review-fixes plan.

Residual deploy checks before production release:

- [ ] Run `npm run structured-knowledge:preview-smoke:release` and `npm run knowledge-wiki:preview-smoke` against a real Preview URL by setting `ARCHITECT_PREVIEW_URL` or `PREVIEW_BASE_URL`.
- [ ] Run `npm run structured-knowledge:schema-preflight` with the target cloud `DATABASE_URL` after migrations are applied.
- [ ] Run `npm run ai-review:readiness` in an environment with `DATABASE_URL`, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
- [ ] Apply the new Prisma migration in the target database before relying on structured approved WIKI rows in production.
