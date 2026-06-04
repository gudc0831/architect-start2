import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertProjectContextRuleSet,
  defaultProjectContextRuleSet,
  getActiveProjectContextRuleSet,
  projectContextVersionPinningRules,
} from "../src/domains/project-context/policy";

const root = process.cwd();
const policyPath = join(root, "src", "domains", "project-context", "policy.ts");
const routePath = join(root, "src", "app", "api", "admin", "project-context", "policies", "route.ts");
const schemaPath = join(root, "prisma", "schema.prisma");

const policySource = readFileSync(policyPath, "utf8");
const routeSource = readFileSync(routePath, "utf8");
const schemaSource = readFileSync(schemaPath, "utf8");

const activePolicy = getActiveProjectContextRuleSet();
assert.equal(activePolicy.id, "project-context-md@2026-06-02");
assert.equal(activePolicy.status, "active");
assert.equal(activePolicy.rawRetentionDays, 7);
assert.equal(activePolicy.chunking.requireSourceQuote, true);
assert.equal(activePolicy.chunking.requireLocation, true);
assert.ok(activePolicy.retrieval.finalTopK >= 3 && activePolicy.retrieval.finalTopK <= 5);
assert.equal(activePolicy.retrieval.maxChunksPerSource, 2);
assert.equal(activePolicy.retrieval.minVectorCosine, 0.72);
assert.equal(activePolicy.retrieval.minBm25, 0.2);
assert.equal(activePolicy.retrieval.minRerank, 0.65);
assertProjectContextRuleSet(activePolicy);
assertProjectContextRuleSet(defaultProjectContextRuleSet);

assert.ok(activePolicy.supportedMimeTypes.length > 0);
assert.ok(activePolicy.supportedExtensions.length > 0);
assert.ok(activePolicy.promptInjection.blockedPatterns.length > 0);
assert.ok(activePolicy.promptInjection.warningPatterns.length > 0);
assert.match(activePolicy.normalizationRulesMarkdown, /untrusted project_context/i);
assert.match(activePolicy.normalizationRulesMarkdown, /never as verified legal evidence/i);
assert.match(activePolicy.normalizationRulesMarkdown, /sourceQuote/i);
assert.match(activePolicy.normalizationRulesMarkdown, /typed location/i);

for (const rule of [
  "Each upload version stores normalizationRuleVersion.",
  "Each upload version stores parserVersion.",
  "New active policy applies only to new uploads.",
  "Existing normalized_draft and active versions are not automatically reprocessed.",
  "Rollback creates or reactivates a policy version, not silent mutation of old version metadata.",
]) {
  assert.ok(projectContextVersionPinningRules.includes(rule as (typeof projectContextVersionPinningRules)[number]));
}

assert.match(policySource, /export type ProjectContextRuleSet = \{/);
assert.match(policySource, /requireSourceQuote: true/);
assert.match(policySource, /requireLocation: true/);
assert.match(policySource, /defaultProjectContextRuleSet/);
assert.match(policySource, /projectContextVersionPinningRules/);
assert.doesNotMatch(policySource, /EvidenceBundle/);
assert.doesNotMatch(policySource, /legalEvidence/i);

assert.match(routeSource, /requireRole\("admin"\)/);
assert.match(routeSource, /getActiveProjectContextRuleSet/);
assert.match(routeSource, /listProjectContextRuleSets/);
assert.match(routeSource, /versionPinningRules/);

assert.match(schemaSource, /normalizationRuleVersion\s+String\s+@default\("v1"\)\s+@map\("normalization_rule_version"\)/);
assert.match(schemaSource, /parserVersion\s+String\s+@default\("v1"\)\s+@map\("parser_version"\)/);

console.log(JSON.stringify({ status: "passed", policy: activePolicy.id }));
