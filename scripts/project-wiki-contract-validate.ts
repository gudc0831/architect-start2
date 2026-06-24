import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/202606240001_add_project_wiki/migration.sql");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

assert.match(schema, /model ProjectWikiItem\s+\{/);
assert.match(schema, /model ProjectWikiActionLog\s+\{/);
assert.match(schema, /reviewDeletedAt\s+DateTime\?/);
assert.match(schema, /sourceReviewRecordId\s+String\s+@unique/);
assert.match(schema, /commonCandidateRecordId\s+String\?\s+@unique/);
assert.match(schema, /@@index\(\[projectId, status, updatedAt\]\)/);
assert.match(migration, /constraint "project_wiki_action_logs_action_check"\s+check \("action" in \('disable', 'restore'\)\)/);

const types = read("src/domains/project-wiki/types.ts");
assert.match(types, /export type ProjectWikiStatus = "active" \| "disabled"/);
assert.match(types, /export type ProjectWikiSuitabilityState = "recommended" \| "caution" \| "not_recommended"/);
assert.match(
  types,
  /export type ProjectWikiRegistrationState = "not_evaluated" \| "recommended" \| "caution" \| "not_recommended" \| "registered"/,
);
assert.match(
  types,
  /export type ProjectWikiSourceBadge = "프로젝트 WIKI" \| "공용 WIKI" \| "task" \| "도면\/문서" \| "법규" \| "외부"/,
);
assert.match(
  types,
  /export type ProjectWikiDraft = \{\s+title: string;\s+summary: string;\s+bodyMarkdown: string;\s+tags: string\[\];\s+aiSuitabilityState: ProjectWikiSuitabilityState;\s+aiSuitabilityReason: string;\s+commonizationCaution: string;\s+\};/,
);
assert.match(types, /createdByDisplay: string/);
assert.match(types, /action: "disable" \| "restore"/);

const contracts = read("src/repositories/project-wiki/contracts.ts");
for (const name of [
  "listProjectWikiItems",
  "getProjectWikiItem",
  "findProjectWikiBySourceReviewRecord",
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
