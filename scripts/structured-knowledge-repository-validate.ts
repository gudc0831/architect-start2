import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const contracts = read("src/repositories/knowledge/contracts.ts");
const postgresStore = read("src/repositories/knowledge/postgres-store.ts");
const localStore = read("src/repositories/knowledge/local-store.ts");
const index = read("src/repositories/knowledge/index.ts");
const assistantContracts = read("src/repositories/assistant/contracts.ts");
const assistantPostgresStore = read("src/repositories/assistant/postgres-store.ts");
const assistantLocalStore = read("src/repositories/assistant/local-store.ts");
const knowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const approvedItemsRoute = read("src/app/api/admin/knowledge/items/route.ts");
const candidatesRoute = read("src/app/api/admin/knowledge/candidates/route.ts");
const knowledgeShell = read("src/components/admin/knowledge-admin-shell.tsx");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
const assistantPostgresListCandidates = methodBody(assistantPostgresStore, "listKnowledgeCandidateRecords");
const assistantLocalListCandidates = methodBody(assistantLocalStore, "listKnowledgeCandidateRecords");

assert.match(contracts, /export type StructuredKnowledgeRepository = \{/, "StructuredKnowledgeRepository export missing");
assert.match(contracts, /publicId: string/, "repository contract must preserve publicId");
assert.match(contracts, /sourceRecordId: string \| null/, "publish input sourceRecordId missing");
assert.match(contracts, /sourceTaskId: string \| null/, "publish input sourceTaskId missing");
assert.match(contracts, /sourceProjectId: string \| null/, "publish input sourceProjectId missing");
assert.match(
  contracts,
  /publishVersion\(input: PublishKnowledgeVersionInput\): Promise<\{ itemId: string; versionId: string; version: number \}>/,
  "publishVersion result contract missing",
);
assert.match(
  contracts,
  /listApprovedItems\(input: \{ projectId: string \}\): Promise<StructuredKnowledgeDraft\[]>/,
  "listApprovedItems must require projectId scope",
);

assert.match(postgresStore, /prisma\.\$transaction\(async \(tx\) =>/, "postgres publishVersion must use prisma.$transaction");
assert.match(postgresStore, /tx\.knowledgeItemVersion\.findFirst/, "postgres publish path must read latest version");
assert.match(postgresStore, /const version = \(latest\?\.version \?\? 0\) \+ 1/, "postgres publish path must increment versions");
assert.match(postgresStore, /tx\.knowledgeItemVersion\.create/, "postgres publish path must write knowledgeItemVersion");
assert.match(postgresStore, /tx\.knowledgeSourceReference\.createMany/, "postgres publish path must write knowledgeSourceReference rows");
assert.match(postgresStore, /versionId: created\.id/, "postgres source refs must write versionId");
assert.match(postgresStore, /sourceRefId: source\.id/, "postgres source refs must preserve logical sourceRefId");
assert.match(postgresStore, /id: source\.sourceRefId \|\| source\.id/, "postgres source refs must read logical sourceRefId before row id");
assert.match(postgresStore, /updateMany\(\{\s*[\s\S]*where: \{ itemId: input\.itemId, state: "approved" \}[\s\S]*state: "superseded"/, "postgres publish path must supersede prior approved versions");
assert.match(postgresStore, /supersedesId: latestApproved\?\.id \?\? null/, "postgres publish path must link latest approved predecessor");
assert.match(postgresStore, /tx\.knowledgeItem\.update/, "postgres publish path must update knowledgeItem");
assert.match(postgresStore, /slug: input\.structuredDraft\.slug/, "postgres publish path must update item slug from structured draft");
assert.match(postgresStore, /scope: normalizePublicationScope\(input\.structuredDraft\.ontology\.scope\)/, "postgres publish path must update item scope from structured draft");
assert.match(postgresStore, /tags: toInputJson\(input\.structuredDraft\.tags\)/, "postgres publish path must update item tags from structured draft");
assert.match(postgresStore, /ontology: toInputJson\(input\.structuredDraft\.ontology\)/, "postgres publish path must update item ontology from structured draft");
assert.match(postgresStore, /projectId: resolveKnowledgeItemProjectId\(input\.structuredDraft, input\.sourceProjectId, currentItem\.projectId\)/, "postgres publish path must update item project scope from structured draft");
assert.match(postgresStore, /sourceRecordId: input\.sourceRecordId/, "postgres publish path must preserve sourceRecordId");
assert.match(postgresStore, /sourceTaskId: input\.sourceTaskId/, "postgres publish path must preserve sourceTaskId");
assert.match(postgresStore, /sourceProjectId: input\.sourceProjectId/, "postgres publish path must preserve sourceProjectId");
assert.match(postgresStore, /publicId: input\.publicId/, "postgres createItem must preserve publicId");
assert.match(postgresStore, /OR: \[\{ projectId: input\.projectId \}, \{ scope: "organization" \}\]/, "postgres listApprovedItems must scope to project plus organization");
assert.match(postgresStore, /const seenItemIds = new Set<string>\(\)/, "postgres listApprovedItems must dedupe versions by item");
assert.match(postgresStore, /orderBy: \[\{ approvedAt: "desc" \}, \{ version: "desc" \}, \{ createdAt: "desc" \}\]/, "postgres listApprovedItems must order latest approved versions first");
assert.match(postgresStore, /getActiveGenerationProfile\(name: string\)/, "postgres active profile lookup missing");
assert.match(postgresStore, /where: \{ name, state: "active" \}/, "postgres active profile lookup must require active state");

assert.match(localStore, /const version = \(latest\?\.version \?\? 0\) \+ 1/, "local store must mirror version increment behavior");
assert.match(localStore, /versionId: created\.id/, "local source refs must be version-scoped");
assert.match(localStore, /state: "superseded" as const/, "local publish path must supersede prior approved versions");
assert.match(localStore, /supersedesId: latestApproved\?\.id \?\? null/, "local publish path must link latest approved predecessor");
assert.match(localStore, /slug: input\.structuredDraft\.slug/, "local publish path must update item slug from structured draft");
assert.match(localStore, /scope: normalizePublicationScope\(input\.structuredDraft\.ontology\.scope\)/, "local publish path must update item scope from structured draft");
assert.match(localStore, /tags: \[\.\.\.input\.structuredDraft\.tags\]/, "local publish path must update item tags from structured draft");
assert.match(localStore, /projectId: resolveKnowledgeItemProjectId\(input\.structuredDraft, input\.sourceProjectId, item\.projectId\)/, "local publish path must update item project scope from structured draft");
assert.match(localStore, /sourceRecordId: input\.sourceRecordId/, "local store must preserve sourceRecordId");
assert.match(localStore, /sourceTaskId: input\.sourceTaskId/, "local store must preserve sourceTaskId");
assert.match(localStore, /sourceProjectId: input\.sourceProjectId/, "local store must preserve sourceProjectId");
assert.match(localStore, /publicId: input\.publicId/, "local createItem must preserve publicId");
assert.match(localStore, /item\.projectId === input\.projectId \|\| item\.scope === "organization"/, "local listApprovedItems must scope to project plus organization");
assert.match(localStore, /sort\(\(left, right\) => right\.version - left\.version\)\[0\]/, "local listApprovedItems must pick latest approved version");
assert.match(localStore, /profile\.name === name && profile\.state === "active"/, "local active profile lookup missing");

assert.match(index, /backendMode === "cloud" \? postgresStructuredKnowledgeRepository : localStructuredKnowledgeRepository/);
assert.match(index, /export const structuredKnowledgeRepository: StructuredKnowledgeRepository/);

assert.match(
  assistantContracts,
  /includeOrganizationApproved\?: boolean/,
  "assistant candidate listing must separate current-project candidate review from organization approved fallback",
);
assert.match(
  assistantPostgresListCandidates,
  /includeOrganizationApproved/,
  "postgres candidate listing must gate organization fallback behind includeOrganizationApproved",
);
assert.match(
  assistantPostgresListCandidates,
  /\: \{ projectId: input\.projectId \}/,
  "postgres candidate listing must default projectId to exact current project",
);
assert.match(
  assistantPostgresListCandidates,
  /path: \["approvedKnowledgeItem", "scope"\][\s\S]*equals: "organization"/,
  "postgres candidate listing may include organization scope only for approved readback fallback",
);
assert.match(
  assistantPostgresListCandidates,
  /\{ projectId: input\.projectId \}/,
  "postgres candidate listing must include same project when projectId is provided",
);
assertBefore(
  assistantPostgresListCandidates,
  /OR:\s*\[\s*\{ projectId: input\.projectId \}/,
  /take:\s*100/,
  "postgres candidate listing must apply project scope before limiting",
);
assert.match(
  assistantLocalListCandidates,
  /includeOrganizationApproved/,
  "local candidate listing must gate organization fallback behind includeOrganizationApproved",
);
assert.match(
  assistantLocalListCandidates,
  /record\.projectId === input\.projectId[\s\S]*record\.metadata\.approvedKnowledgeItem\?\.scope === "organization"/,
  "local candidate listing must keep organization scope behind explicit fallback",
);
assert.match(
  knowledgeService,
  /export async function listApprovedKnowledgeItems\(input: \{ projectId: string \}\): Promise<ApprovedKnowledgeItem\[]>/,
  "approved WIKI service readback must require projectId",
);
assert.match(
  knowledgeService,
  /export async function listKnowledgeCandidates\(input\?: \{ projectId\?: string \}\)/,
  "candidate listing service must accept projectId scope",
);
assert.match(
  knowledgeService,
  /const records = useLegacyFallback[\s\S]*includeOrganizationApproved: true/,
  "approved WIKI service readback must only query organization legacy fallback when explicitly enabled",
);
assert.match(
  knowledgeService,
  /item\.sourceProjectId === projectId \|\| item\.scope === "organization"/,
  "approved WIKI service readback must scope to project plus organization",
);
assert.match(
  knowledgeService,
  /const projectId = normalizeRequiredText\(input\.projectId, "projectId"\)/,
  "export audit creation must require projectId",
);
assert.match(
  knowledgeService,
  /listApprovedKnowledgeItems\(\{ projectId \}\)/,
  "export audit creation must read project-scoped approved items",
);
assert.match(
  knowledgeService,
  /listApprovedKnowledgeItems\(\{ projectId: audit\.projectId \}\)/,
  "provider preview must read approved items from the audit project scope",
);
assert.match(approvedItemsRoute, /searchParams\.get\("projectId"\)/, "approved items route must read projectId");
assert.match(approvedItemsRoute, /assertKnowledgeCapability\(user, "knowledge\.approved_wiki\.export"\)/, "approved items route must require export capability");
assert.match(approvedItemsRoute, /requireCurrentProjectAccess\(user\)/, "approved items route must require current project access");
assert.match(approvedItemsRoute, /projectId !== projectContext\.project\.id/, "approved items route must block cross-project reads");
assert.match(approvedItemsRoute, /listApprovedKnowledgeItems\(\{ projectId \}\)/, "approved items route must pass projectId");
assert.match(candidatesRoute, /assertKnowledgeCapability\(user, "knowledge\.candidates\.review"\)/, "candidates route must require review capability");
assert.match(candidatesRoute, /requireCurrentProjectAccess\(user\)/, "candidates route must require current project access");
assert.match(candidatesRoute, /listKnowledgeCandidates\(\{ projectId: projectContext\.project\.id \}\)/, "candidates route must list current-project candidates only");
assert.match(
  knowledgeShell,
  /const approvedItemsUrl = useMemo\(\s*\(\) => currentProjectId \? `\/api\/admin\/knowledge\/items\?projectId=\$\{encodeURIComponent\(currentProjectId\)\}` : null,\s*\[currentProjectId\],\s*\)/s,
  "knowledge admin shell must build the approved-items URL from currentProjectId",
);
assert.match(
  knowledgeShell,
  /let active = true;\s*setApprovedItems\(\[\]\);\s*setApprovedItemsLoaded\(false\);\s*readJson<ApprovedKnowledgeItem\[]>\(approvedItemsUrl\)/,
  "knowledge admin shell must clear stale approved items when the project-scoped URL changes",
);
assert.match(knowledgeShell, /projectId,\s*\n\s*action,/s, "approved sync audit payload must include projectId");

assert.equal(
  packageJson.scripts?.["structured-knowledge:repository:validate"],
  "tsx scripts/structured-knowledge-repository-validate.ts",
  "package script structured-knowledge:repository:validate missing",
);

console.log("structured-knowledge-repository-validate: ok");
