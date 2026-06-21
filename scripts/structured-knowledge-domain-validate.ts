import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const domain = readFileSync("src/domains/knowledge/structured-knowledge.ts", "utf8");
const assistantTypes = readFileSync("src/domains/assistant/types.ts", "utf8");

function exportedConstArrayBody(source: string, name: string) {
  const prefix = `export const ${name} = [`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} const array missing`);
  const bodyStart = start + prefix.length;
  const end = source.indexOf("] as const;", bodyStart);
  assert.notEqual(end, -1, `${name} const array end missing`);
  return source.slice(bodyStart, end);
}

function exportedTypeBody(source: string, name: string) {
  const prefix = `export type ${name} = {`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} type body missing`);
  const bodyStart = start + prefix.length;
  const end = source.indexOf("\n};", bodyStart);
  assert.notEqual(end, -1, `${name} type body end missing`);
  return source.slice(bodyStart, end);
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
  assert.ok(sourceKinds.includes(JSON.stringify(source)), `missing source kind ${source}`);
}

const allowedUses = exportedConstArrayBody(domain, "knowledgeAllowedUseKinds");
for (const allowedUse of ["legal_basis", "context", "comparison", "citation", "do_not_publish"]) {
  assert.ok(allowedUses.includes(JSON.stringify(allowedUse)), `missing allowed use ${allowedUse}`);
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
  assert.ok(draft.includes(`${field}:`), `StructuredKnowledgeDraft missing ${field}`);
}

for (const typeName of ["KnowledgeSourceRef", "KnowledgeClaimEvidence", "KnowledgeReviewIssue", "KnowledgeApprovalReadiness"]) {
  assert.ok(domain.includes(`type ${typeName}`), `missing ${typeName}`);
}

const reviewIssue = exportedTypeBody(domain, "KnowledgeReviewIssue");
for (const severity of ["blocking", "warning", "ready"]) {
  assert.ok(reviewIssue.includes(JSON.stringify(severity)), `KnowledgeReviewIssue missing severity ${severity}`);
}

const approvalReadiness = exportedTypeBody(domain, "KnowledgeApprovalReadiness");
for (const status of ["blocked", "needs_review", "ready"]) {
  assert.ok(approvalReadiness.includes(JSON.stringify(status)), `KnowledgeApprovalReadiness missing status ${status}`);
}

const approvedKnowledgeItem = exportedTypeBody(assistantTypes, "ApprovedKnowledgeItem");
assert.match(approvedKnowledgeItem, /structuredKnowledgeItemId\?: string/);
assert.match(approvedKnowledgeItem, /structuredKnowledgeVersionId\?: string/);
assert.match(approvedKnowledgeItem, /generationRunId\?: string/);

console.log("structured-knowledge-domain-validate: ok");
