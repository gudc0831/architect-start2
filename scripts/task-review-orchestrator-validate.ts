import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AssistantEvidence } from "../src/domains/assistant/types";
import type { StructuredTaskReviewSchema } from "../src/domains/assistant/task-review";
import {
  isCentralizedVerifiedLegalEvidence,
  requiresCentralizedLegalVerification,
} from "../src/domains/legal/legal-verification-intent";
import {
  attachGeneratedAnswerToStructuredReviewSchema,
  sanitizeTaskReviewEvidence,
  selectEvidenceForCentralizedLegalVerification,
  selectEvidenceForTaskReviewGeneration,
} from "../src/use-cases/task-review-service";

const verifiedRegulationEvidence: AssistantEvidence[] = [
  {
    id: "verified-legal-search:law:building-act:chunk:49",
    kind: "regulation",
    priority: 1,
    title: "건축법 제49조",
    excerpt: "건축법 제49조 피난시설 관련 verified legal evidence",
    sourceUrl: "https://www.law.go.kr/법령/건축법?JO=004900&OC=server-secret-oc",
    recordId: "law:building-act",
    confidenceWeight: 0.82,
    verificationStatus: "verified",
    legal: {
      sourceId: "law:building-act",
      chunkId: "chunk:49",
      sourceKind: "statute",
      authorityRank: "statute",
      stale: false,
      legalChangeWarnings: [],
    },
  },
];

const unverifiedRegulationSeedEvidence: AssistantEvidence[] = [
  {
    id: "regulation:generic-seed",
    kind: "regulation",
    priority: 2,
    title: "국토계획법 용도지역ㆍ건폐율ㆍ용적률 확인 seed",
    excerpt: "국토의 계획 및 이용에 관한 법률 및 시행령의 용도지역ㆍ건폐율ㆍ용적률 관련 조문",
    sourceUrl: "https://www.law.go.kr/법령/국토의계획및이용에관한법률",
    confidenceWeight: 0.46,
  },
];

async function main() {
  const checks: string[] = [];

  assert.equal(requiresCentralizedLegalVerification("건축법 제49조 피난시설 검토", []), true);
  assert.equal(requiresCentralizedLegalVerification("일반 task 진행 방법 검토", []), false);
  assert.equal(requiresCentralizedLegalVerification("일반 task 진행 방법 검토", unverifiedRegulationSeedEvidence), true);
  checks.push("legal/regulation prompts require centralized verified legal evidence");

  assert.equal(isCentralizedVerifiedLegalEvidence(verifiedRegulationEvidence[0]!), true);
  assert.equal(isCentralizedVerifiedLegalEvidence(unverifiedRegulationSeedEvidence[0]!), false);
  assert.deepEqual(selectEvidenceForCentralizedLegalVerification(verifiedRegulationEvidence).map((item) => item.id), [
    "verified-legal-search:law:building-act:chunk:49",
  ]);
  checks.push("centralized verified legal evidence is identified without a SaaS law.go.kr credential");

  const generationEvidence = selectEvidenceForTaskReviewGeneration([
    ...verifiedRegulationEvidence,
    ...unverifiedRegulationSeedEvidence,
    {
      id: "task:context",
      kind: "task",
      priority: 3,
      title: "Task context",
      excerpt: "Task context excerpt",
    },
  ], true);
  assert.deepEqual(generationEvidence.map((item) => item.id), [
    "verified-legal-search:law:building-act:chunk:49",
    "task:context",
  ]);
  checks.push("task-review excludes unverified regulation seeds while preserving nonlegal task evidence");

  const sanitized = sanitizeTaskReviewEvidence([
    {
      id: "regulation:absolute-oc",
      kind: "regulation",
      priority: 3,
      title: "건축법 absolute OC",
      excerpt: "absolute URL must be redacted",
      sourceUrl: "https://www.law.go.kr/법령/건축법?JO=004900&OC=server-secret-oc#article",
      confidenceWeight: 0.5,
    },
    {
      id: "regulation:relative-oc",
      kind: "regulation",
      priority: 4,
      title: "건축법 relative OC",
      excerpt: "relative URL must be redacted",
      sourceUrl: "/법령/건축법?JO=004900&OC=server-secret-oc",
      confidenceWeight: 0.5,
    },
  ]);
  assert.equal(sanitized.some((item) => item.sourceUrl?.includes("OC=")), false);
  assert.equal(sanitized.some((item) => item.sourceUrl?.includes("server-secret-oc")), false);
  assert.equal(sanitized[0]?.sourceUrl?.includes("JO=004900"), true);
  assert.equal(sanitized[0]?.sourceUrl?.endsWith("#article"), true);
  checks.push("task-review evidence URLs redact OC query params before save");

  assertGeneratedSchemaAttachment(checks);

  await assertSourceBoundaries(checks);

  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
}

function assertGeneratedSchemaAttachment(checks: string[]) {
  const baseSchema: StructuredTaskReviewSchema = {
    answerMarkdown: "",
    lawCitations: [],
    checklistItems: [
      {
        label: "blocked item",
        evidenceIds: [],
        status: "blocked",
      },
      {
        label: "todo item",
        evidenceIds: ["evidence:1"],
        status: "todo",
      },
      {
        label: "needs review item",
        evidenceIds: ["evidence:2"],
        status: "needs_review",
      },
    ],
    warnings: [],
    evidenceConflicts: [],
    confidence: {
      score: 64,
      reason: "preview confidence",
    },
    wikiCandidateDraft: {
      allowed: true,
      title: "Candidate title",
      summary: "Preview summary",
      tags: ["task-review", "existing"],
      sourceEvidenceIds: ["source:1", "source:2"],
    },
  };

  const generatedSchema = attachGeneratedAnswerToStructuredReviewSchema(
    baseSchema,
    "  Generated\n\nanswer markdown  ",
    {
      conclusion: "  Generated draft conclusion  ",
      tags: ["generated", "existing", "task-review"],
      scope: "task",
    },
    101.7,
    "  Saved confidence reason  ",
  );

  assert.equal(generatedSchema.answerMarkdown, "Generated answer markdown");
  checks.push("generated answer markdown is attached to structured review schema");

  assert.equal(generatedSchema.confidence.score, 100);
  assert.equal(generatedSchema.confidence.reason, "Saved confidence reason");
  checks.push("saved confidence score and reason are attached to structured review schema");

  assert.deepEqual(
    generatedSchema.checklistItems.map((item) => item.status),
    ["blocked", "needs_review", "needs_review"],
  );
  checks.push("generated structured review preserves blocked checklist items and marks reviewable items needs_review");

  assert.deepEqual(generatedSchema.wikiCandidateDraft, {
    allowed: true,
    title: "Candidate title",
    summary: "Generated draft conclusion",
    tags: ["task-review", "existing", "generated"],
    sourceEvidenceIds: ["source:1", "source:2"],
  });
  checks.push("generated draft summary augments wiki candidate summary, tags, and preserves source evidence ids");

  const nullWikiSchema = attachGeneratedAnswerToStructuredReviewSchema(
    {
      ...baseSchema,
      wikiCandidateDraft: null,
    },
    "Generated answer",
    {
      conclusion: "Generated draft conclusion",
      tags: ["generated"],
      scope: "task",
    },
    80,
    "Saved confidence reason",
  );
  assert.equal(nullWikiSchema.wikiCandidateDraft, null);
  checks.push("structured review keeps wikiCandidateDraft null when preview schema has no candidate");

  const longGeneratedSchema = attachGeneratedAnswerToStructuredReviewSchema(
    baseSchema,
    "a".repeat(12050),
    {
      conclusion: "s".repeat(650),
      tags: ["generated"],
      scope: "task",
    },
    80,
    "r".repeat(650),
  );
  assert.equal(longGeneratedSchema.answerMarkdown.length <= 12000, true);
  assert.equal(longGeneratedSchema.confidence.reason.length <= 500, true);
  assert.equal(longGeneratedSchema.wikiCandidateDraft?.summary.length, 500);
  checks.push("generated structured review hard-caps answer, confidence reason, and draft summary text");
}

async function assertSourceBoundaries(checks: string[]) {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const taskReviewRoute = await readFile(new URL("../src/app/api/assistant/task-review/route.ts", import.meta.url), "utf8");
  const taskReviewService = await readFile(new URL("../src/use-cases/task-review-service.ts", import.meta.url), "utf8");
  const saasService = await readFile(new URL("../src/use-cases/assistant-saas-mode-service.ts", import.meta.url), "utf8");
  const assistantService = await readFile(new URL("../src/use-cases/assistant-service.ts", import.meta.url), "utf8");
  const legalSearchService = await readFile(new URL("../src/use-cases/verified-legal-search-service.ts", import.meta.url), "utf8");
  const taskAssistantPanel = await readFile(new URL("../src/components/tasks/task-assistant-panel.tsx", import.meta.url), "utf8");
  const candidateImportService = await readFile(
    new URL("../src/use-cases/admin/verified-legal-candidate-import-service.ts", import.meta.url),
    "utf8",
  );
  const candidateImportRoute = await readFile(
    new URL("../src/app/api/admin/knowledge/verified-legal-candidates/import/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(envExample, /^LAW_OPEN_DATA_OC=/m);
  assert.match(envExample, /^VERIFIED_LEGAL_SEARCH_API_URL=/m);
  assert.match(envExample, /^VERIFIED_LEGAL_EVIDENCE_BUNDLE_ENABLED=/m);
  assert.match(envExample, /^VERIFIED_LEGAL_EVIDENCE_API_URL=/m);
  assert.match(envExample, /^VERIFIED_LEGAL_EVIDENCE_API_SECRET=/m);
  assert.match(envExample, /^VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET=/m);
  checks.push("SaaS env example documents R2-backed verified legal search settings and not LAW_OPEN_DATA_OC");

  assert.match(taskReviewRoute, /requireCurrentProjectEditor/);
  assert.match(taskReviewRoute, /mode === "generate"/);
  assert.match(taskReviewRoute, /requireCurrentProjectAccess/);
  assert.doesNotMatch(taskReviewRoute, /reviewKnowledgeCandidate|\/approve/);
  checks.push("task-review route is project scoped and never calls WIKI approval");

  assert.match(taskReviewService, /assistantRepository\.createRecord/);
  assert.match(taskReviewService, /candidateState:\s*"not_candidate"/);
  assert.match(taskReviewService, /sanitizeTaskReviewEvidence/);
  assert.match(taskReviewService, /generateAssistantWithVerifiedEvidence/);
  assert.match(taskReviewService, /requiresCentralizedLegalVerification/);
  assert.doesNotMatch(taskReviewService, /from ["']@\/domains\/legal\/official-law-api["']/);
  assert.doesNotMatch(taskReviewService, /verifyOfficialLawEvidence|officialLawSourceToEvidence|lawService\.do|lawSearch\.do/);
  assert.doesNotMatch(taskReviewService, /process\.env\.LAW_OPEN_DATA_OC/);
  assert.doesNotMatch(taskReviewService, /reviewKnowledgeCandidate|\/approve/);
  checks.push("task-review service uses centralized verified legal evidence and no direct law.go.kr verifier");

  assert.match(saasService, /ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW/);
  assert.match(saasService, /requiresCentralizedLegalVerification/);
  assert.match(saasService, /generateAssistantWithVerifiedEvidence/);
  assert.match(saasService, /buildAssistantPromptText/);
  assert.match(saasService, /projectContextChunks/);
  assert.match(saasService, /appendLegalChangeReviewNotice/);
  assert.doesNotMatch(saasService, /from ["']@\/domains\/legal\/official-law-api["']/);
  checks.push("SaaS generation routes legal prompts through task-review and preserves context metadata");

  assert.match(assistantService, /VERIFIED_LEGAL_EVIDENCE_API_SECRET_MISSING/);
  assert.match(assistantService, /withVerifiedLegalServiceHeaders/);
  assert.match(assistantService, /isVerifiedLegalEvidenceBundleEnabled/);
  assert.match(assistantService, /VERIFIED_LEGAL_EVIDENCE_BUNDLE_ENABLED/);
  assert.match(assistantService, /fetchVerifiedLegalEvidenceBundle/);
  assert.match(assistantService, /sanitizeClientSubmittedAssistantEvidenceForStorage/);
  assert.match(assistantService, /candidateState:\s*removedLegalVerificationClaim \? "not_candidate" : undefined/);
  assert.match(legalSearchService, /withVerifiedLegalServiceHeaders/);
  assert.match(assistantService, /legalEvidence:\s*evidence\.filter/);
  assert.match(assistantService, /projectContextChunks:\s*projectContextRetrieval\.chunks/);
  assert.doesNotMatch(assistantService, /process\.env\.LAW_OPEN_DATA_OC/);
  assert.doesNotMatch(legalSearchService, /process\.env\.LAW_OPEN_DATA_OC/);
  checks.push("verified legal search is the default path and legacy bundle retrieval is explicit opt-in");
  checks.push("verified legal evidence/search services keep server secret and project-context separation boundaries");
  checks.push("generic assistant records strip client-submitted legal verification claims and skip WIKI candidacy");

  assert.match(taskAssistantPanel, /postTaskReviewJson/);
  assert.match(taskAssistantPanel, /legalEvidence:\s*review\.evidence\.filter/);
  assert.doesNotMatch(taskAssistantPanel, /verify-official-law|requestLocalOfficialLawVerification|checkOfficialLawPreflightWithExtension/);
  checks.push("Browser/local Codex path relies on server task-review and has no direct official-law bridge fallback");

  const candidateImportSource = `${candidateImportService}\n${candidateImportRoute}`;
  assert.match(candidateImportSource, /candidateState:\s*"pending_review"/);
  assert.match(candidateImportRoute, /requireKnowledgeAdmin/);
  assert.doesNotMatch(candidateImportSource, /reviewKnowledgeCandidate|\/approve|candidateState:\s*"approved"/);
  checks.push("verified legal candidate import remains pending_review with no approval shortcut");
}

void main();
