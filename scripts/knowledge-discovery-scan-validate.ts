import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scanService = readFileSync("src/use-cases/admin/knowledge-discovery-scan-service.ts", "utf8");
const scanRoute = readFileSync("src/app/api/admin/knowledge/discovery-requests/scan/route.ts", "utf8");
const discoveryService = readFileSync("src/use-cases/admin/knowledge-discovery-service.ts", "utf8");

assert.match(scanService, /createKnowledgeDiscoveryRequest/);
assert.doesNotMatch(scanService, /createRecord|reviewKnowledgeCandidate|approvedKnowledgeItem|central_knowledge/);
assert.match(scanRoute, /assertRequestIntegrity\(request\)/);
assert.match(scanRoute, /requireKnowledgeAdmin\(\)/);
assert.match(scanRoute, /assertKnowledgeCapability\(user, "knowledge\.discovery\.scan"\)/);
assert.match(scanRoute, /requireCurrentProjectAccess\(user\)/);
assert.match(discoveryService, /candidateState:\s*"pending_review"/);
assert.doesNotMatch(discoveryService, /candidateState:\s*"approved"|central_knowledge/);

console.log("knowledge-discovery-scan-validate: ok");
