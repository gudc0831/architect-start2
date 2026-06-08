import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAssistantPromptText, type ProjectContextTraceSnapshot } from "../src/domains/assistant/saas-api-mode";

const root = process.cwd();
const saasModeSource = readFileSync(join(root, "src", "domains", "assistant", "saas-api-mode.ts"), "utf8");
const assistantServiceSource = readFileSync(join(root, "src", "use-cases", "assistant-service.ts"), "utf8");
const assistantSaasServiceSource = readFileSync(join(root, "src", "use-cases", "assistant-saas-mode-service.ts"), "utf8");
const taskPanelSource = readFileSync(join(root, "src", "components", "tasks", "task-assistant-panel.tsx"), "utf8");
const retrieveRouteSource = readFileSync(join(root, "src", "app", "api", "assistant", "retrieve", "route.ts"), "utf8");
const taskReviewServiceSource = readFileSync(join(root, "src", "use-cases", "task-review-service.ts"), "utf8");

const trace: ProjectContextTraceSnapshot = {
  corpusType: "project_context",
  status: "chunks_found",
  traceId: "trace-1",
  fallbackMode: "none",
  activeVersionIds: ["version-1"],
  candidateChunkIds: ["chunk-1"],
  matchedChunkIds: ["chunk-1"],
  includedChunkIds: ["chunk-1"],
  noRelevantChunkReason: null,
  searchErrorCode: null,
};
const prompt = buildAssistantPromptText({
  taskTitle: "Task",
  question: "Question",
  instruction: "Instruction",
  evidence: [
    {
      id: "legal-1",
      kind: "regulation",
      priority: 1,
      title: "Legal item",
      excerpt: "legal excerpt",
      legal: {
        sourceId: "source",
        sourceKind: "law",
        authorityRank: "statute",
        stale: false,
        legalChangeWarnings: [],
      },
    },
    {
      id: "other-1",
      kind: "project_document",
      priority: 2,
      title: "Other",
      excerpt: "other excerpt",
    },
  ],
  legalEvidence: [
    {
      id: "legal-1",
      kind: "regulation",
      priority: 1,
      title: "Legal item",
      excerpt: "legal excerpt",
      legal: {
        sourceId: "source",
        sourceKind: "law",
        authorityRank: "statute",
        stale: false,
        legalChangeWarnings: [],
      },
    },
  ],
  projectContextChunks: [
    {
      chunkId: "chunk-1",
      sourceId: "source-1",
      versionId: "version-1",
      sourceDocumentTitle: "Upload",
      normalizedText: "project uploaded condition",
      sourceQuote: "project uploaded condition",
      location: { locationType: "line_range", lineStart: 1, lineEnd: 1 },
      contextType: "project_material",
      chunkQualityScore: 0.9,
      injectionRisk: "none",
      score: 0.8,
    },
  ],
  projectContextTrace: trace,
});

assert.match(prompt, /Legal evidence:/);
assert.match(prompt, /Project upload context:/);
assert.match(prompt, /Project context trace:/);
assert.match(prompt, /untrusted user-provided project context, not legal basis/);
assert.match(prompt, /sourceQuote: project uploaded condition/);
assert.match(prompt, /status: chunks_found/);
assert.doesNotMatch(prompt, /Project upload context:[\s\S]*Legal metadata:/);

assert.match(saasModeSource, /legalEvidence: AssistantEvidence\[\]/);
assert.match(saasModeSource, /projectContextChunks: ProjectContextChunkForReview\[\]/);
assert.match(saasModeSource, /projectContextTrace: ProjectContextTraceSnapshot/);
assert.match(assistantServiceSource, /retrieveProjectContextForTaskReview/);
assert.match(assistantServiceSource, /projectContextChunks: projectContextRetrieval\.chunks/);
assert.match(assistantSaasServiceSource, /projectContextChunks: retrieved\.projectContextChunks/);
assert.match(
  retrieveRouteSource,
  /retrieveAssistantEvidence\(\{[\s\S]*?taskId:\s*String\(body\.taskId \?\? ""\),[\s\S]*?question:\s*String\(body\.question \?\? ""\),[\s\S]*?user,?[\s\S]*?\}\)/,
  "assistant retrieve route must pass the authenticated user into retrieval",
);
assert.match(
  taskReviewServiceSource,
  /retrieveAssistantEvidence\(\{[\s\S]*?taskId:\s*input\.taskId,[\s\S]*?question:\s*input\.question,[\s\S]*?user,?[\s\S]*?\}\)/,
  "task-review orchestrator must pass the authenticated user into retrieval",
);
assert.doesNotMatch(
  retrieveRouteSource,
  /retrieveAssistantEvidence\(\{[\s\S]*?question:\s*String\(body\.question \?\? ""\),\s*\}\)/,
  "assistant retrieve route must not fall back to unauthenticated project_context retrieval",
);
assert.doesNotMatch(
  taskReviewServiceSource,
  /retrieveAssistantEvidence\(\{[\s\S]*?question:\s*input\.question,\s*\}\)/,
  "task-review orchestrator must not fall back to unauthenticated project_context retrieval",
);
assert.match(taskPanelSource, /법적 근거/);
assert.match(taskPanelSource, /프로젝트 업로드 자료 반영/);
assert.match(taskPanelSource, /프로젝트 업로드 자료 검토 상태/);
assert.match(taskPanelSource, /projectContextChunks/);

console.log(JSON.stringify({ status: "passed", reviewContract: "project_context" }));
