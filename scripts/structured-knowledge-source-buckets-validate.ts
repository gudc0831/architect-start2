import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeKnowledgeResponse } from "../src/use-cases/admin/knowledge-response-sanitizer";

const service = readFileSync("src/use-cases/admin/knowledge-source-bucket-service.ts", "utf8");
const sanitizer = readFileSync("src/use-cases/admin/knowledge-response-sanitizer.ts", "utf8");
const route = readFileSync(
  "src/app/api/admin/knowledge/candidates/[recordId]/source-buckets/route.ts",
  "utf8",
);
const securityValidate = readFileSync("scripts/knowledge-wiki-security-validate.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

for (const sourceKind of [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
]) {
  assert.match(service, new RegExp(`${sourceKind}:`), `missing ${sourceKind} bucket mapping`);
}

assert.match(service, /export type KnowledgeSourceBucket = \{\s*kind: KnowledgeSourceKind;\s*label: string;\s*required: boolean;\s*items: KnowledgeSourceRef\[\];\s*warnings: string\[\];\s*\}/s);
assert.match(service, /evidence\.kind === "regulation" \|\| Boolean\(evidence\.legal\)/);
assert.match(service, /allowedUse: "legal_basis"/);
assert.match(service, /allowedUse: "context"/);
assert.match(service, /kind: "project_document"[\s\S]*?allowedUse: "context"/);
assert.match(service, /assistantRepository\.searchApprovedKnowledge\(\{\s*projectId,\s*query: buildApprovedKnowledgeQuery\(record\),\s*limit: 6,\s*\}\)/s);
assert.match(service, /record\.metadata\.knowledgeCandidateSource\?\.type === "local_wiki_import"/);
assert.match(service, /record\.metadata\.externalEvidence/);
assert.match(service, /item\.kind === "web_or_skill"/);
assert.match(service, /record\.projectId !== projectId/, "source bucket service must reject cross-project candidates");
assert.match(service, /법규 근거 확인 시점 누락/);
assert.match(service, /로컬 WIKI digest 누락/);
assert.match(service, /sanitizeKnowledgeResponse\(knowledgeSourceKinds\.map\(\(kind\) => buckets\[kind\]\)\)/);
assert.doesNotMatch(service, /LAW_OPEN_DATA_OC|process\.env/);
assert.doesNotMatch(service, /providerUsage|estimatedCostCents|inputTokens|outputTokens/);

assert.match(route, /assertRequestIntegrity\(request\)/);
assert.match(route, /requireKnowledgeAdmin\(\)/);
assert.match(route, /assertKnowledgeCapability\(user, "knowledge\.candidates\.review"\)/);
assert.match(route, /requireCurrentProjectAccess\(user\)/);
assert.match(route, /projectContext\.project\.id/);
assert.match(route, /getKnowledgeSourceBuckets\(\{ recordId, projectId: projectContext\.project\.id \}\)/);
assert.match(route, /NextResponse\.json\(\{\s*data\s*\}\)/);
assert.doesNotMatch(route, /providerUsage|estimatedCostCents|inputTokens|outputTokens|process\.env/);

assert.match(securityValidate, /source-buckets\/route\.ts", "knowledge\.candidates\.review", true/);

const sanitized = sanitizeKnowledgeResponse({
  path: "C:\\Users\\person\\repo\\.env.local and /home/person/app/.env",
  usageText: "inputTokens: 1200 estimatedCostCents=77 providerUsage={\"x\":1}",
  usageJsonText: "{\"providerUsage\":{\"openai\":{\"inputTokens\":1200},\"estimatedCostCents\":77},\"outputTokens\":30}",
  unc: "\\\\server\\share\\secret.txt",
  env: "OPENAI_API_KEY=redacted_api_key",
  rawPrompt: "do not serialize this",
  providerUsage: { inputTokens: 1 },
  estimatedCostCents: 77,
  nested: {
    token: "secret-token-value",
    providerCost: 12,
    text: "DATABASE_URL=redacted_database_url",
  },
});

const sanitizedJson = JSON.stringify(sanitized);
assert.doesNotMatch(sanitizedJson, /Users\\person|\/home\/person|\\\\server\\share|\.env\.local|redacted_api_key|do not serialize|secret-token-value|redacted_database_url/);
assert.doesNotMatch(sanitizedJson, /1200|77|30|\{"x":1\}|openai|providerCost/);
assert.match(sanitizedJson, /inputTokens=\[REDACTED_USAGE\]/);
assert.match(sanitizedJson, /estimatedCostCents=\[REDACTED_USAGE\]/);
assert.match(sanitizedJson, /providerUsage=\[REDACTED_USAGE\]/);
assert.match(sanitizedJson, /\\"providerUsage\\":\\"\[REDACTED_USAGE\]\\"/);
assert.match(sanitizedJson, /\\"outputTokens\\":\\"\[REDACTED_USAGE\]\\"/);
assert.match(sanitizedJson, /\[REDACTED/);
assert.match(sanitizer, /providerUsageOrCostKeyPattern/);
assert.match(sanitizer, /sensitiveKeyPattern/);

assert.equal(
  packageJson.scripts?.["structured-knowledge:source-buckets:validate"],
  "tsx scripts/structured-knowledge-source-buckets-validate.ts",
);

console.log("structured-knowledge-source-buckets-validate: ok");
