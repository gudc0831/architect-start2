import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guards = readFileSync("src/lib/auth/knowledge-guards.ts", "utf8");
const workflow = readFileSync("src/domains/admin/knowledge-workflow.ts", "utf8");
const service = readFileSync("src/use-cases/admin/knowledge-generation-profile-service.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260615090000_structured_approved_wiki/migration.sql", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

const profileRoutes: Array<[string, string]> = [
  ["src/app/api/admin/knowledge/generation-profiles/route.ts", "knowledge.generation.manage"],
  ["src/app/api/admin/knowledge/generation-profiles/[profileId]/activate/route.ts", "knowledge.generation.activate"],
  ["src/app/api/admin/knowledge/generation-profiles/[profileId]/rollback/route.ts", "knowledge.generation.activate"],
];

for (const capability of ["knowledge.generation.manage", "knowledge.generation.activate"]) {
  assert.match(guards, new RegExp(`\\| "${capability.replaceAll(".", "\\.")}"`), `${capability} missing from capability union`);
  assert.match(guards, new RegExp(`"${capability.replaceAll(".", "\\.")}"`), `${capability} missing from all admin capabilities`);
}

for (const [path, capability] of profileRoutes) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /assertRequestIntegrity\(request\)/, `${path} missing request integrity`);
  assert.match(source, /requireKnowledgeAdmin\(\)/, `${path} missing admin auth`);
  assert.match(source, new RegExp(`assertKnowledgeCapability\\(user, "${capability.replaceAll(".", "\\.")}"\\)`), `${path} missing exact capability`);
  assert.doesNotMatch(source, /rawPrompt|promptText|apiSecret|providerUsage|estimatedCost|inputTokens|outputTokens|process\.env/);
  assert.match(source, /NextResponse\.json\(\{\s*data\s*\}\)/, `${path} should return sanitized service data only`);
}

const generationProfilesRoute = readFileSync("src/app/api/admin/knowledge/generation-profiles/route.ts", "utf8");
assert.match(
  generationProfilesRoute,
  /await getOrCreateActiveKnowledgeGenerationProfile\(user\)/,
  "generation profile list route must bootstrap an active profile for fresh deployments",
);

assert.match(service, /export async function listKnowledgeGenerationProfiles/);
assert.match(service, /export async function getOrCreateActiveKnowledgeGenerationProfile/);
assert.match(service, /export async function createKnowledgeGenerationProfileDraft/);
assert.match(service, /export async function activateKnowledgeGenerationProfile/);
assert.match(service, /export async function rollbackKnowledgeGenerationProfile/);
assert.match(service, /const defaultProfileName = "approved-wiki-generation-profile"/);

const sourceKinds = [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
];

for (const sourceKind of sourceKinds) {
  assert.match(
    service,
    new RegExp(`${sourceKind}: \\{ required: (true|false), maxItems: \\d+ \\}`),
    `${sourceKind} missing explicit required/maxItems rule`,
  );
}

assert.match(service, /task_context: \{ required: true, maxItems: 4 \}/);

for (const title of ["요약", "적용 기준", "확인 절차", "근거", "예외 / 주의", "관련 WIKI"]) {
  assert.match(service, new RegExp(`title: "${title}"`), `${title} missing from default TOC template`);
}

for (const rule of [
  "common reusable knowledge",
  "Avoid task numbers, provider names, model names, token usage, cost, prompt, and execution metadata in markdown",
  "Cite specific legal provisions",
  "future ontology and reuse",
]) {
  assert.match(service, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${rule} missing from default profile rules`);
}

assert.match(service, /redactSensitiveValue/);
assert.match(service, /OPENAI_API_KEY|api\[_-\]\?key|LAW_OPEN_DATA_OC/);
assert.match(service, /prisma\.\$transaction/);
assert.match(service, /sourceKind === "task_context" \? true/, "task_context required invariant must not be weakened by draft input");
assert.match(service, /protectedTocPurposes/, "protected TOC purposes must be preserved for draft input");
assert.match(service, /items\.length > 0 \? items : fallback/, "empty citation\/section rules must fall back to defaults");
assert.match(service, /tx\.knowledgeGenerationProfile\.findFirst\(\{\s*where: \{ name: profile\.name, state: "active" \}/s);
assert.match(service, /tx\.knowledgeGenerationProfile\.findFirst\(\{\s*where: \{ name: restored\.name, state: "active" \}/s);
assert.match(service, /tx\.knowledgeGenerationProfile\.update\(\{\s*where: \{ id: previous\.id \}/s);
assert.match(service, /tx\.knowledgeGenerationProfile\.update\(\{\s*where: \{ id: current\.id \}/s);
assert.match(service, /tx\.assistantAuditEvent\.create\(\{\s*data:\s*\{[\s\S]*knowledgeAuditEventTypes\.generationProfileCreated/s);
assert.match(service, /tx\.assistantAuditEvent\.create\(\{\s*data:\s*\{[\s\S]*knowledgeAuditEventTypes\.generationProfileActivated/s);
assert.match(service, /tx\.assistantAuditEvent\.create\(\{\s*data:\s*\{[\s\S]*knowledgeAuditEventTypes\.generationProfileRolledBack/s);
assert.match(service, /Rollback reason is required\./);
assert.match(service, /knowledgeAuditEventTypes\.generationProfileRolledBack/);
assert.match(service, /metadata: \{ reason, restoredProfileId: activated\.id, restoredVersion: activated\.version \}/);

assert.match(workflow, /generationProfileCreated: "knowledge\.generation_profile\.created"/);
assert.match(workflow, /generationProfileActivated: "knowledge\.generation_profile\.activated"/);
assert.match(workflow, /generationProfileRolledBack: "knowledge\.generation_profile\.rolled_back"/);
assert.match(workflow, /"knowledge_generation_profile"/);
assert.match(schema, /partial unique index knowledge_generation_profiles_one_active/);
assert.match(
  migration,
  /create unique index "knowledge_generation_profiles_one_active"[\s\S]*on "knowledge_generation_profiles" \("name"\)[\s\S]*where "state" = 'active'/,
  "migration must enforce one active generation profile per name",
);

assert.equal(
  packageJson.scripts?.["structured-knowledge:profile:validate"],
  "tsx scripts/structured-knowledge-profile-validate.ts",
);

console.log("structured-knowledge-profile-validate: ok");
