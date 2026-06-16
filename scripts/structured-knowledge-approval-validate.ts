import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./knowledge-central-exclusion-validate";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function methodBody(source: string, name: string) {
  const start = source.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `${name} method missing`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} method signature end missing`);
  const braceStart = source.indexOf("{", signatureEnd);
  assert.notEqual(braceStart, -1, `${name} method body missing`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  assert.fail(`${name} method body not closed`);
}

function assertBefore(source: string, first: RegExp, second: RegExp, message: string) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.notEqual(firstIndex, -1, `${message}: first pattern missing`);
  assert.notEqual(secondIndex, -1, `${message}: second pattern missing`);
  assert.ok(firstIndex < secondIndex, message);
}

const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
const publishService = read("src/use-cases/admin/structured-knowledge-service.ts");
const knowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const approveRoute = read("src/app/api/admin/knowledge/candidates/[recordId]/approve/route.ts");
const contracts = read("src/repositories/assistant/contracts.ts");
const postgresStore = read("src/repositories/assistant/postgres-store.ts");
const localStore = read("src/repositories/assistant/local-store.ts");
const backfill = read("scripts/backfill-structured-approved-wiki.ts");
const postgresReview = methodBody(postgresStore, "reviewKnowledgeCandidate");
const localReview = methodBody(localStore, "reviewKnowledgeCandidate");

assert.equal(
  packageJson.scripts?.["structured-knowledge:approval:validate"],
  "tsx scripts/structured-knowledge-approval-validate.ts",
  "package script structured-knowledge:approval:validate missing",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:backfill"],
  "tsx scripts/backfill-structured-approved-wiki.ts",
  "package script structured-knowledge:backfill missing",
);

assert.match(
  contracts,
  /structuredDraft: StructuredKnowledgeDraft/,
  "approve input must require StructuredKnowledgeDraft",
);
assert.match(contracts, /generationRunId\?: string \| null/, "approve input must optionally accept generationRunId");
assert.match(contracts, /projectId: string/, "review input must carry current projectId");

assert.match(
  publishService,
  /export async function publishStructuredKnowledgeFromCandidate\(/,
  "publishStructuredKnowledgeFromCandidate export missing",
);
assert.match(publishService, /tx: Prisma\.TransactionClient/, "publish service must receive a transaction client");
assert.doesNotMatch(publishService, /\bprisma\./, "publish service must not use the global prisma client");
assert.match(
  publishService,
  /STRUCTURED_WIKI_APPROVAL_BLOCKED/,
  "blocked approval readiness must use STRUCTURED_WIKI_APPROVAL_BLOCKED",
);
assert.match(
  publishService,
  /buildServerApprovalReadiness\(draft, sourceRefs\)/,
  "publish service must recompute approval readiness server-side",
);
assert.match(publishService, /canonicalizeStructuredKnowledgeDraftForApproval/, "publish service must expose server canonical draft creation");
assert.match(publishService, /sourceRefPublicationFingerprint/, "publish service must compare full publication source refs");
assert.match(
  publishService,
  /input\.legacyPublicId \|\| createStableKnowledgePublicId\(input\.recordId\)/,
  "publish service must preserve legacy public id or create a stable public id",
);
assert.match(
  publishService,
  /renderStructuredKnowledgeMarkdown\(\{\s*[\s\S]*sourceRefs,\s*\}\)/,
  "publish service must render body markdown from the structured draft",
);
assert.match(publishService, /input\.tx\.knowledgeItem\.upsert/, "publish service must create/update KnowledgeItem with tx");
assert.match(publishService, /where: \{ publicId \}/, "KnowledgeItem upsert must be keyed by publicId");
assert.match(publishService, /input\.tx\.knowledgeItemVersion\.create/, "publish service must create KnowledgeItemVersion with tx");
assert.match(
  publishService,
  /input\.tx\.knowledgeSourceReference\.createMany/,
  "publish service must create source references with tx",
);
assert.match(publishService, /versionId: created\.id/, "source reference rows must be version-scoped");
assert.match(
  publishService,
  /sourceReferences: toApprovedKnowledgeSourceReferences\(input\.draft\.sourceRefs\)/,
  "legacy snapshot sourceReferences must derive from structured source refs",
);
assert.match(
  publishService,
  /structuredKnowledgeItemId: input\.structuredKnowledgeItemId/,
  "legacy snapshot must include structuredKnowledgeItemId",
);
assert.match(
  publishService,
  /structuredKnowledgeVersionId: input\.structuredKnowledgeVersionId/,
  "legacy snapshot must include structuredKnowledgeVersionId",
);
assert.match(publishService, /generationRunId: input\.generationRunId/, "legacy snapshot must carry generationRunId when present");
assert.match(publishService, /STRUCTURED_WIKI_METADATA_IN_BODY/, "publish service must reject assistant/task metadata in body");
assert.match(publishService, /STRUCTURED_WIKI_UNSAFE_DRAFT_CONTENT/, "publish service must reject unsafe structured draft content");
assert.match(publishService, /assertNoUnsafePublicationValue\(draft, "structuredDraft"\)/, "publish service must inspect the full structured draft before publish");
assert.match(publishService, /STRUCTURED_WIKI_SOURCE_REF_NOT_IN_BUCKET/, "publish service must reject source refs outside server buckets");
assert.match(publishService, /STRUCTURED_WIKI_DO_NOT_PUBLISH_SOURCE/, "publish service must reject do_not_publish source refs");
assert.match(publishService, /STRUCTURED_WIKI_TASK_CONTEXT_ONLY/, "publish service must reject task-context-only publishing");
assert.match(publishService, /STRUCTURED_WIKI_ORGANIZATION_SCOPE_SOURCE_CONFLICT/, "publish service must reject project-bound sources for org scope");
assert.match(publishService, /STRUCTURED_WIKI_GENERATION_RUN_SOURCE_MISMATCH/, "publish service must validate generation run source refs");
assert.match(
  publishService,
  /taskId\|taskIssueId\|assistantRecord\|assistant record\|recordId\|providerCallMode\|provider\|usage\|estimatedCostCents\|costCents\|inputTokens\|outputTokens\|requestHash/,
  "metadata exclusion pattern must cover task/provider/usage/cost/assistant record fields",
);
assert.match(publishService, /rawPrompt/, "unsafe draft guard must reject raw prompt markers");
assert.match(publishService, /API\[_-\]\?KEY/, "unsafe draft guard must reject env-style API keys");
assert.match(publishService, /sk-\[A-Za-z0-9_-\]/, "unsafe draft guard must reject provider secret token strings");
assert.match(publishService, /\.env/, "unsafe draft guard must reject .env references");
assert.match(publishService, /A-Za-z\]:\\\\/, "unsafe draft guard must reject Windows absolute paths");
assert.match(publishService, /Users\|home\|var\|etc\|tmp\|mnt\|opt\|srv\|root\|Volumes\|workspace/, "unsafe draft guard must reject POSIX/local paths");

assert.match(
  knowledgeService,
  /normalizeStructuredKnowledgeDraftInput\(input\.structuredDraft\)/,
  "approval service must normalize structuredDraft",
);
assert.match(knowledgeService, /STRUCTURED_WIKI_DRAFT_REQUIRED/, "approval service must require structured draft");
assert.match(knowledgeService, /getKnowledgeSourceBuckets\(\{ recordId: record\.id, projectId \}\)/, "approval service must reload server source buckets");
assert.match(knowledgeService, /canonicalizeStructuredKnowledgeDraftForApproval\(\{\s*[\s\S]*sourceBuckets/, "approval service must replace client source refs with canonical bucket refs");
assert.match(knowledgeService, /assertStructuredKnowledgeDraftPublishable\(\{\s*[\s\S]*sourceBuckets,[\s\S]*requestedScope:/, "approval service must validate source buckets and scope server-side");
assert.match(
  knowledgeService,
  /record\.projectId !== projectId/,
  "approval service must reject candidates outside the current project",
);
assert.doesNotMatch(
  knowledgeService,
  /inputStructuredDraft \?\?[\s\S]*buildStructuredKnowledgeDraftFromLegacyCandidate/,
  "approval service must not runtime-fallback to legacy candidate drafts",
);
assert.match(knowledgeService, /const generationRunId = normalizeRequiredText\(input\.generationRunId, "generationRunId"\)/);
assert.match(approveRoute, /structuredDraft: bodyRecord\?\.structuredDraft/, "approve route must forward structuredDraft");
assert.match(approveRoute, /generationRunId: bodyRecord\?\.generationRunId/, "approve route must forward generationRunId");
assert.match(approveRoute, /requireCurrentProjectAccess\(user\)/, "approve route must require current project access");
assert.match(approveRoute, /projectId: projectContext\.project\.id/, "approve route must pass current projectId");

assert.equal(
  (postgresReview.match(/prisma\.\$transaction/g) ?? []).length,
  1,
  "postgres reviewKnowledgeCandidate must use one transaction",
);
assert.match(postgresReview, /tx\.assistantTaskRecord\.findUnique/, "postgres approval path must re-read inside transaction");
assert.match(
  postgresReview,
  /publishStructuredKnowledgeFromCandidate\(\{\s*[\s\S]*tx,/,
  "postgres approval path must pass tx to publishStructuredKnowledgeFromCandidate",
);
assertBefore(
  postgresReview,
  /publishStructuredKnowledgeFromCandidate\(\{/,
  /tx\.assistantTaskRecord\.updateMany/,
  "structured publish must happen before candidate metadata update in the same transaction",
);
assert.match(postgresReview, /tx\.assistantTaskRecord\.updateMany/, "candidate state update must use tx");
assert.match(
  postgresReview,
  /approvedKnowledgeItem: approvedKnowledgeItem \?\? currentRecord\.metadata\.approvedKnowledgeItem/,
  "approvedKnowledgeItem metadata must be preserved on non-approve paths",
);
assert.match(postgresReview, /knowledgeReview/, "knowledgeReview metadata update missing");
assert.doesNotMatch(
  postgresReview,
  /buildStructuredKnowledgeDraftFromLegacyCandidate/,
  "postgres repository must not preserve runtime legacy bodyMarkdown fallback",
);
assert.match(postgresReview, /currentRecord\.projectId !== input\.projectId/, "postgres repository must enforce project scope");
assert.match(postgresReview, /projectId: input\.projectId/, "postgres updateMany must include project scope");

assert.match(
  localReview,
  /assertStructuredKnowledgeDraftPublishable\(structuredDraft\)/,
  "local store must reject blocked structured drafts before writing",
);
assertBefore(
  localReview,
  /assertStructuredKnowledgeDraftPublishable\(structuredDraft\)/,
  /writeLocalStore/,
  "local blocked-readiness guard must run before local write",
);
assert.match(
  localReview,
  /createApprovedKnowledgeSnapshotFromStructuredDraft/,
  "local store must mirror structured legacy snapshot",
);
assert.match(localReview, /createStableKnowledgePublicId\(record\.id\)/, "local store must use stable public id");
assert.match(
  localReview,
  /createStableStructuredKnowledgeSyntheticId\("item", record\.id\)/,
  "local store must include stable synthetic structured item id",
);
assert.match(
  localReview,
  /createStableStructuredKnowledgeSyntheticId\(\s*"version"/,
  "local store must include stable synthetic structured version id",
);
assert.doesNotMatch(
  localReview,
  /input\.structuredDraft \?\?[\s\S]*buildStructuredKnowledgeDraftFromLegacyCandidate/,
  "local store must not preserve runtime fallback behavior",
);
assert.match(localReview, /record\.projectId !== input\.projectId/, "local store must enforce project scope");

assert.match(backfill, /const apply = args\.has\("--apply"\)/, "backfill must require explicit --apply");
assert.match(backfill, /args\.has\("--dry-run"\)/, "backfill must expose explicit --dry-run");
assert.match(backfill, /args\.has\("--preflight"\)/, "backfill must expose explicit --preflight");
assert.match(backfill, /args\.has\("--require-database"\)/, "backfill must expose --require-database");
assert.match(backfill, /args\.has\("--require-nonzero"\)/, "backfill must expose --require-nonzero");
assert.match(backfill, /where: \{ sourceRecordId: record\.id \}/, "backfill must skip existing sourceRecordId rows");
assert.match(backfill, /if \(!apply\)/, "backfill dry-run must avoid writes by default");
assert.match(backfill, /assertStructuredKnowledgeDraftPublishable\(draft\)/, "backfill dry-run must validate publishability before eligible");
assert.match(backfill, /draft: check\.draft/, "backfill apply must reuse the validated draft from preflight");
assert.match(
  backfill,
  /legacyPublicId: approvedKnowledgeItem\.id/,
  "backfill must preserve approvedKnowledgeItem.id as KnowledgeItem.publicId",
);
assert.match(backfill, /sourceReferences: item\.sourceReferences/, "backfill must preserve sourceReferences");
assert.match(
  backfill,
  /status: "structured-approved-wiki-backfill"/,
  "backfill must print structured summary status",
);
assert.match(backfill, /eligible: 0/, "backfill summary must include eligible count");
assert.match(backfill, /collisions: 0/, "backfill summary must include collision count");
assert.match(backfill, /assertStructuredKnowledgeSchemaReady/, "backfill must run schema readiness preflight");
assert.doesNotMatch(backfill, /JSON\.stringify\(approvedKnowledgeItem\)/);

console.log("structured-knowledge-approval-validate: ok");
