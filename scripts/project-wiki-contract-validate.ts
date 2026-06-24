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
