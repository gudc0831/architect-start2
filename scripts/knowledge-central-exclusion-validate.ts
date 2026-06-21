import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const postgresStore = readFileSync("src/repositories/assistant/postgres-store.ts", "utf8");
const localStore = readFileSync("src/repositories/assistant/local-store.ts", "utf8");
const assistantService = readFileSync("src/use-cases/assistant-service.ts", "utf8");
const discoveryService = readFileSync("src/use-cases/admin/knowledge-discovery-service.ts", "utf8");
const importService = readFileSync("src/use-cases/admin/knowledge-import-preview-service.ts", "utf8");

assert.match(postgresStore, /candidate_state = 'approved'/);
assert.match(postgresStore, /metadata \? 'approvedKnowledgeItem'/);
assert.match(postgresStore, /candidateState:\s*"approved"/);
assert.match(localStore, /record\.candidateState === "approved"/);
assert.match(localStore, /metadata\.approvedKnowledgeItem/);
assert.match(assistantService, /kind:\s*"central_knowledge"/);

assert.doesNotMatch(discoveryService, /approvedKnowledgeItem|central_knowledge|candidateState:\s*"approved"/);
assert.match(discoveryService, /candidateState:\s*"pending_review"/);
assert.doesNotMatch(importService, /approvedKnowledgeItem|central_knowledge|candidateState:\s*"approved"/);
assert.match(importService, /candidateState:\s*"pending_review"/);

console.log("knowledge-central-exclusion-validate: ok");
