import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const domain = readFileSync("src/domains/knowledge/structured-knowledge.ts", "utf8");
const assistantTypes = readFileSync("src/domains/assistant/types.ts", "utf8");

function exportedConstArrayBody(source: string, name: string) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `${name} const array missing`);
  return match[1];
}

function exportedTypeBody(source: string, name: string) {
  const match = source.match(new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `${name} type body missing`);
  return match[1];
}

const sourceKinds = exportedConstArrayBody(domain, "knowledgeSourceKinds");
for (const source of [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
]) {
  assert.match(sourceKinds, new RegExp(`"${source}"`), `missing source kind ${source}`);
}

const allowedUses = exportedConstArrayBody(domain, "knowledgeAllowedUseKinds");
for (const allowedUse of ["legal_basis", "context", "comparison", "citation", "do_not_publish"]) {
  assert.match(allowedUses, new RegExp(`"${allowedUse}"`), `missing allowed use ${allowedUse}`);
}

const draft = exportedTypeBody(domain, "StructuredKnowledgeDraft");
for (const field of [
  "title",
  "slug",
  "summary",
  "tags",
  "ontology",
  "toc",
  "sections",
  "reasoningSummary",
  "claimEvidenceMatrix",
  "approvalReadiness",
  "sourceRefs",
  "markdown",
  "warnings",
]) {
  assert.match(draft, new RegExp(`\\b${field}:`), `StructuredKnowledgeDraft missing ${field}`);
}

for (const typeName of ["KnowledgeSourceRef", "KnowledgeClaimEvidence", "KnowledgeReviewIssue", "KnowledgeApprovalReadiness"]) {
  assert.match(domain, new RegExp(`type ${typeName}\\b`), `missing ${typeName}`);
}

const reviewIssue = exportedTypeBody(domain, "KnowledgeReviewIssue");
for (const severity of ["blocking", "warning", "ready"]) {
  assert.match(reviewIssue, new RegExp(`"${severity}"`), `KnowledgeReviewIssue missing severity ${severity}`);
}

const approvalReadiness = exportedTypeBody(domain, "KnowledgeApprovalReadiness");
for (const status of ["blocked", "needs_review", "ready"]) {
  assert.match(approvalReadiness, new RegExp(`"${status}"`), `KnowledgeApprovalReadiness missing status ${status}`);
}

const approvedKnowledgeItem = exportedTypeBody(assistantTypes, "ApprovedKnowledgeItem");
assert.match(approvedKnowledgeItem, /structuredKnowledgeItemId\?: string/);
assert.match(approvedKnowledgeItem, /structuredKnowledgeVersionId\?: string/);
assert.match(approvedKnowledgeItem, /generationRunId\?: string/);

console.log("structured-knowledge-domain-validate: ok");
