import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { StructuredKnowledgeDraft } from "../src/domains/knowledge/structured-knowledge";
import { renderStructuredKnowledgeMarkdown } from "../src/use-cases/admin/knowledge-structured-draft-service";

const service = readFileSync("src/use-cases/admin/knowledge-structured-draft-service.ts", "utf8");
const route = readFileSync(
  "src/app/api/admin/knowledge/candidates/[recordId]/structured-draft/route.ts",
  "utf8",
);
const securityValidate = readFileSync("scripts/knowledge-wiki-security-validate.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

for (const label of [
  "Legal evidence bucket:",
  "Task context bucket:",
  "Project document bucket:",
  "Approved WIKI bucket:",
  "Local WIKI bucket:",
  "External evidence bucket:",
  "Ontology requirements:",
  "TOC requirements:",
  "Citation requirements:",
  "Integrated reasoning requirements:",
]) {
  assert.match(service, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} missing`);
}

assert.match(service, /export function renderStructuredKnowledgeMarkdown\(draft: StructuredKnowledgeDraft\)/);
assert.match(service, /normalizeStructuredKnowledgeDraft\(draft\)/);
assert.match(service, /tocId: tocItem\.id/);
assert.match(service, /anchor: uniqueValue/);
assert.match(service, /findMatchingTocItem/);
assert.match(service, /assistantRepository\.findRecordById\(recordId\)/);
assert.match(service, /record\.projectId !== projectId/);
assert.match(service, /record\.candidateState === "not_candidate"/);
assert.match(service, /getOrCreateActiveKnowledgeGenerationProfile\(input\.user\)/);
assert.match(service, /getKnowledgeSourceBuckets\(\{ recordId, projectId \}\)/);
assert.match(service, /sourceBundleDigest = stableDigest/);
assert.match(service, /promptDigest = stableDigest\(generationPrompt\)/);

for (const field of [
  "ontology",
  "toc",
  "sections",
  "sourceRefs",
  "reasoningSummary",
  "claimEvidenceMatrix",
  "approvalReadiness",
  "markdown",
  "warnings",
]) {
  assert.match(service, new RegExp(`${field}:`), `${field} missing from generated draft`);
}

assert.match(service, /profileVersion: profile\.version/);
assert.match(service, /structuredDraft: toInputJson\(draft\)/);
assert.match(service, /warnings: toInputJson\(warnings\)/);
assert.match(service, /provider: "deterministic"/);
assert.match(service, /model: "deterministic"/);
assert.match(service, /sanitizeKnowledgeResponse\(\{\s*draft,[\s\S]*generationRunId/s);
assert.doesNotMatch(service, /rawPrompt|promptText|systemPrompt|userPrompt|apiSecret|providerUsage|estimatedCostCents|inputTokens|outputTokens/);
assert.doesNotMatch(route, /rawPrompt|promptText|systemPrompt|userPrompt|apiSecret|providerUsage|estimatedCost|inputTokens|outputTokens|process\.env/);

assert.match(route, /assertRequestIntegrity\(request\)/);
assert.match(route, /requireKnowledgeAdmin\(\)/);
assert.match(route, /assertKnowledgeCapability\(user, "knowledge\.candidates\.review"\)/);
assert.match(route, /requireCurrentProjectAccess\(user\)/);
assert.match(route, /projectId: projectContext\.project\.id/);
assert.match(route, /generateStructuredKnowledgeDraft\(\{\s*recordId,\s*projectId: projectContext\.project\.id,\s*user,\s*\}\)/s);
assert.match(route, /NextResponse\.json\(\{\s*data\s*\}\)/);
assert.match(securityValidate, /structured-draft\/route\.ts", "knowledge\.candidates\.review", true/);

const sampleDraft: StructuredKnowledgeDraft = {
  title: "Sample Knowledge",
  slug: "sample-knowledge",
  summary: "Summary",
  tags: ["sample"],
  ontology: {
    conceptId: "sample",
    label: "Sample Knowledge",
    category: "workflow",
    scope: "project_members",
    relations: [
      {
        kind: "related",
        targetId: "approved-item-1",
        reason: "related approved WIKI",
      },
    ],
  },
  toc: [
    { id: "summary", level: 2, title: "요약", purpose: "summary", required: true },
    { id: "related", level: 2, title: "관련 WIKI", purpose: "related", required: false },
  ],
  sections: [
    {
      tocId: "summary",
      anchor: "",
      heading: "요약",
      bodyMarkdown: "Reusable body.",
      sourceRefIds: ["task-context"],
    },
  ],
  reasoningSummary: "Reasoning",
  claimEvidenceMatrix: [
    {
      claim: "Claim",
      sourceRefIds: ["task-context"],
      confidence: "high",
      conflicts: [],
      gaps: [],
    },
  ],
  approvalReadiness: { status: "ready", issues: [] },
  sourceRefs: [
    {
      id: "task-context",
      sourceKind: "task_context",
      sourceId: "task-id-123",
      title: "Candidate context",
      locator: "task:123; assistant record:abc",
      excerpt: "Context",
      sourceUrl: null,
      digest: "digest",
      authorityRank: 30,
      verifiedAt: null,
      stale: false,
      legalChangeWarnings: [],
      allowedUse: "context",
    },
  ],
  markdown: "",
  warnings: [],
};

const markdown = renderStructuredKnowledgeMarkdown(sampleDraft);
assert.match(markdown, /^# Sample Knowledge/m);
assert.match(markdown, /## 목차/);
assert.match(markdown, /\[요약\]\(#summary\)/);
assert.match(markdown, /## 출처 범위/);
assert.match(markdown, /## 요약 \{#summary\}/);
assert.match(markdown, /## 관련 WIKI \{#related\}/);
assert.match(markdown, /approved-item-1/);
assert.doesNotMatch(markdown, /Provider|사용량|estimatedCost|assistant record:abc|task:123|task-id-123/);

assert.equal(
  packageJson.scripts?.["structured-knowledge:generation:validate"],
  "tsx scripts/structured-knowledge-generation-validate.ts",
);

console.log("structured-knowledge-generation-validate: ok");
