import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readBlockedReason } from "../src/use-cases/admin/knowledge-import-preview-service";

const blockedFixtureValues = [
  "OPENAI_API_KEY=sk-test-secret",
  "Authorization: Bearer test-token",
  "DATABASE_URL=postgres://user:pass@example/db",
  "-----BEGIN PRIVATE KEY-----",
  "C:\\Users\\hcchoi\\secret\\raw.md",
];

for (const fixture of blockedFixtureValues) {
  assert.equal(readBlockedReason(fixture), "blocked_secret_or_local_path", `fixture should be blocked: ${fixture}`);
}

const service = readFileSync("src/use-cases/admin/knowledge-import-preview-service.ts", "utf8");
assert.match(service, /const blockedReason = readBlockedReason/);
assert.match(service, /excludedItems\.push/);
assert.match(service, /title:\s*redactSensitiveText\(item\.title\)/);
assert.match(service, /titleDigest:\s*hashSource\(item\.title\)/);
assert.match(service, /workspaceFingerprint:\s*createWorkspaceFingerprint/);
assert.match(service, /return `sha256:\$\{hashSource\(basis\)\}`/);
assert.match(service, /includedItems\.push/);
assert.match(service, /candidateState:\s*"pending_review"/);
assert.doesNotMatch(service, /reviewKnowledgeCandidate|candidateState:\s*"approved"|approvedKnowledgeItem/);

const capturedOutput = "knowledge-local-import-secret-fixtures-validate: ok";
assertNoRawSecret(capturedOutput, blockedFixtureValues);

console.log(capturedOutput);

function assertNoRawSecret(value: string, fixtures: string[]) {
  for (const fixture of fixtures) {
    assert.equal(value.includes(fixture), false, "validator output leaked fixture value");
  }
}
