import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStructuredKnowledgeSchemaUnavailable } from "../src/repositories/knowledge/schema-errors";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function blockAfter(source: string, needle: string) {
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `${needle} missing`);
  const bodyMatch = source.slice(start).match(/\{\r?\n/);
  assert.ok(bodyMatch && bodyMatch.index !== undefined, `${needle} body missing`);
  const braceStart = start + bodyMatch.index;
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
  assert.fail(`${needle} body not closed`);
}

function methodBody(source: string, name: string) {
  return blockAfter(source, `async ${name}(`);
}

function assertBefore(source: string, first: RegExp, second: RegExp, message: string) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.notEqual(firstIndex, -1, `${message}: first pattern missing`);
  assert.notEqual(secondIndex, -1, `${message}: second pattern missing`);
  assert.ok(firstIndex < secondIndex, message);
}

const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
const knowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const assistantContracts = read("src/repositories/assistant/contracts.ts");
const assistantPostgresStore = read("src/repositories/assistant/postgres-store.ts");
const assistantLocalStore = read("src/repositories/assistant/local-store.ts");
const knowledgeContracts = read("src/repositories/knowledge/contracts.ts");
const knowledgePostgresStore = read("src/repositories/knowledge/postgres-store.ts");
const knowledgeLocalStore = read("src/repositories/knowledge/local-store.ts");
const knowledgeIndex = read("src/repositories/knowledge/index.ts");

const serviceReadback = blockAfter(knowledgeService, "export async function listApprovedKnowledgeItems");
const serviceDedupe = blockAfter(knowledgeService, "function dedupeApprovedKnowledgeItems");
const assistantPostgresSearch = methodBody(assistantPostgresStore, "searchApprovedKnowledge");
const assistantPostgresLegacySearch = methodBody(assistantPostgresStore, "searchLegacyApprovedKnowledge");
const assistantLocalSearch = methodBody(assistantLocalStore, "searchApprovedKnowledge");
const assistantPostgresDedupe = blockAfter(assistantPostgresStore, "function dedupeApprovedKnowledgeItems");
const assistantLocalDedupe = blockAfter(assistantLocalStore, "function dedupeApprovedKnowledgeItems");
const knowledgePostgresList = blockAfter(knowledgePostgresStore, "private async listApprovedVersions");
const knowledgeLocalList = blockAfter(knowledgeLocalStore, "private listApprovedKnowledgeItemEntries");

assert.equal(isStructuredKnowledgeSchemaUnavailable({ code: "P2021" }), true, "P2021 must be schema-unavailable");
assert.equal(isStructuredKnowledgeSchemaUnavailable({ code: "P2022" }), true, "P2022 must be schema-unavailable");
assert.equal(
  isStructuredKnowledgeSchemaUnavailable(new Error('relation "knowledge_items" does not exist')),
  true,
  "missing structured relation must be schema-unavailable",
);
assert.equal(
  isStructuredKnowledgeSchemaUnavailable(new Error('column "source_ref_id" does not exist on relation "knowledge_source_references"')),
  true,
  "missing structured column must be schema-unavailable",
);
assert.equal(
  isStructuredKnowledgeSchemaUnavailable(new Error("permission denied for table knowledge_items")),
  false,
  "permission errors must not trigger legacy fallback",
);
assert.equal(
  isStructuredKnowledgeSchemaUnavailable(new Error('duplicate key value violates unique constraint "knowledge_items_public_id_key"')),
  false,
  "constraint errors must not trigger legacy fallback",
);
assert.equal(
  isStructuredKnowledgeSchemaUnavailable(new Error("query failed while reading knowledge_items column scope")),
  false,
  "generic query errors must not trigger legacy fallback",
);

assert.equal(
  packageJson.scripts?.["structured-knowledge:readback:validate"],
  "tsx scripts/structured-knowledge-readback-validate.ts",
  "package script structured-knowledge:readback:validate missing",
);

assert.match(
  knowledgeContracts,
  /listApprovedKnowledgeItems\(input: \{ projectId: string \}\): Promise<ApprovedKnowledgeItem\[]>/,
  "structured repository must expose ApprovedKnowledgeItem readback",
);
assert.match(
  knowledgeContracts,
  /searchApprovedKnowledge\(input: \{ projectId: string; query: string; limit\?: number \}\): Promise<ApprovedKnowledgeItem\[]>/,
  "structured repository must expose ApprovedKnowledgeItem search",
);
assert.match(knowledgeIndex, /listApprovedKnowledgeItems\(input\)/, "structured repository index must proxy DTO readback");
assert.match(knowledgeIndex, /searchApprovedKnowledge\(input\)/, "structured repository index must proxy search");

assertBefore(
  serviceReadback,
  /structuredKnowledgeRepository\.listApprovedKnowledgeItems\(\{ projectId \}\)/,
  /const records = useLegacyFallback/,
  "admin readback must prefer structured rows before legacy snapshots",
);
assert.match(serviceReadback, /try \{[\s\S]*structuredKnowledgeRepository\.listApprovedKnowledgeItems/, "admin readback must wrap structured readback");
assert.match(serviceReadback, /isStructuredKnowledgeSchemaUnavailable\(error\)/, "admin readback must tolerate missing structured schema only");
assert.match(serviceReadback, /record\.metadata\.approvedKnowledgeItem/, "legacy snapshot fallback must remain in readback");
assert.match(serviceReadback, /shouldUseLegacyApprovedKnowledgeFallback\(\{ schemaUnavailable \}\)/, "legacy snapshot fallback must be gated by schema missing or explicit flag");
assert.match(serviceReadback, /const records = useLegacyFallback[\s\S]*includeOrganizationApproved: true/, "legacy fallback records must only be queried when fallback is enabled");
assert.match(serviceReadback, /item\.sourceProjectId === projectId \|\| item\.scope === "organization"/, "legacy fallback scope must be same project plus organization");
assert.match(serviceReadback, /const items = \[\.\.\.structuredItems, \.\.\.legacyItems\]/, "readback must merge structured items before legacy fallback");
assert.match(serviceReadback, /return dedupeApprovedKnowledgeItems\(items\)/, "readback must dedupe merged items");
assert.match(serviceDedupe, /seenPublicIds\.has\(item\.id\)/, "readback dedupe must compare stable public ids");
assert.match(serviceDedupe, /seenSourceRecordIds\.has\(item\.sourceRecordId\)/, "readback dedupe must compare source record ids");

assert.match(knowledgePostgresStore, /id: version\.item\.publicId/, "postgres structured DTO must preserve publicId as ApprovedKnowledgeItem.id");
assert.match(knowledgeLocalStore, /id: item\.publicId/, "local structured DTO must preserve publicId as ApprovedKnowledgeItem.id");
assert.match(knowledgePostgresStore, /id: source\.sourceRefId \|\| source\.id/, "postgres structured DTO must preserve logical sourceRef ids");
assert.match(knowledgePostgresStore, /sourceRefId: string/, "postgres source ref type must include logical sourceRefId");
assert.match(
  knowledgePostgresStore,
  /sourceReferences: toApprovedKnowledgeSourceReferences\(version\.sourceRefs\.map\(toSourceRef\)\)/,
  "postgres structured DTO sourceReferences must come from structured source refs",
);
assert.match(
  knowledgeLocalStore,
  /sourceReferences: toApprovedKnowledgeSourceReferences\(sourceRefsForVersion\(version\)\)/,
  "local structured DTO sourceReferences must come from structured source refs",
);

assert.match(knowledgePostgresList, /state: "approved"/, "postgres structured readback must require approved versions");
assert.match(knowledgePostgresList, /state: "active"/, "postgres structured readback must require active items");
assert.match(
  knowledgePostgresList,
  /OR: \[\{ projectId: input\.projectId \}, \{ scope: "organization" \}\]/,
  "postgres structured readback must include same project plus organization scope",
);
assert.match(knowledgeLocalList, /item\.state === "active"/, "local structured readback must require active items");
assert.match(knowledgeLocalList, /version\.state === "approved"/, "local structured readback must require approved versions");
assert.match(
  knowledgeLocalList,
  /item\.projectId === input\.projectId \|\| item\.scope === "organization"/,
  "local structured readback must include same project plus organization scope",
);

assertBefore(
  assistantPostgresSearch,
  /structuredKnowledgeRepository\s*\.\s*searchApprovedKnowledge\(\{ projectId: input\.projectId, query: input\.query, limit \}\)/,
  /shouldUseLegacyApprovedKnowledgeFallback\(\{ schemaUnavailable \}\)/,
  "postgres assistant search must query structured approved versions before legacy snapshots",
);
assert.match(assistantPostgresSearch, /isStructuredKnowledgeSchemaUnavailable\(error\)/, "postgres assistant search must only swallow missing structured schema errors");
assert.match(assistantPostgresSearch, /dedupeApprovedKnowledgeItems\(\[\.\.\.structuredItems, \.\.\.legacyItems\]\)/, "postgres assistant search must dedupe structured plus legacy results");
assert.match(assistantPostgresLegacySearch, /candidate_state = 'approved'/, "postgres legacy search fallback must remain approved-only");
assert.match(assistantPostgresLegacySearch, /metadata \? 'approvedKnowledgeItem'/, "postgres legacy search fallback must require legacy approved snapshots");
assert.match(assistantPostgresLegacySearch, /project_id = \$\{input\.projectId\}::uuid/, "postgres legacy search must include same project");
assert.match(assistantPostgresLegacySearch, /metadata #>> '\{approvedKnowledgeItem,scope\}' = 'organization'/, "postgres legacy search must include organization scope");

assertBefore(
  assistantLocalSearch,
  /structuredKnowledgeRepository\s*\.\s*searchApprovedKnowledge\(\{ projectId: input\.projectId, query: input\.query, limit \}\)/,
  /shouldUseLegacyApprovedKnowledgeFallback\(\{ schemaUnavailable \}\)/,
  "local assistant search must query structured approved versions before legacy snapshots",
);
assert.match(assistantLocalSearch, /isStructuredKnowledgeSchemaUnavailable\(error\)/, "local assistant search must only swallow missing structured schema errors");
assert.match(assistantLocalSearch, /record\.candidateState === "approved"/, "local legacy search fallback must remain approved-only");
assert.match(assistantLocalSearch, /record\.projectId === input\.projectId/, "local legacy search must include same project");
assert.match(assistantLocalSearch, /record\.metadata\.approvedKnowledgeItem\?\.scope === "organization"/, "local legacy search must include organization scope");
assert.match(assistantLocalSearch, /dedupeApprovedKnowledgeItems\(\[\.\.\.structuredItems, \.\.\.legacyItems\]\)/, "local assistant search must dedupe structured plus legacy results");

for (const [label, body] of [
  ["postgres assistant search", assistantPostgresDedupe],
  ["local assistant search", assistantLocalDedupe],
] as const) {
  assert.match(body, /seenPublicIds\.has\(item\.id\)/, `${label} dedupe must compare stable public ids`);
  assert.match(body, /seenSourceRecordIds\.has\(item\.sourceRecordId\)/, `${label} dedupe must compare source record ids`);
}

assert.match(
  assistantContracts,
  /searchApprovedKnowledge\(input:\s*SearchApprovedKnowledgeInput\): Promise<ApprovedKnowledgeItem\[]>/,
  "AssistantRepository searchApprovedKnowledge public contract must still return ApprovedKnowledgeItem[]",
);
assert.match(knowledgeService, /sourceReferences \+= item\.sourceReferences\.length/, "export stats must count ApprovedKnowledgeItem.sourceReferences");

console.log("structured-knowledge-readback-validate: ok");
