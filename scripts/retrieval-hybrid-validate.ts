import seedPackageJson from "../src/domains/regulation/seeds/foundation.kr.json";
import evaluationFixtureJson from "../src/domains/regulation/evaluation/foundation.kr.json";
import { buildFileAnalysisChunks, rankFileAnalyses } from "../src/domains/file/search";
import type { FileRecord } from "../src/domains/task/types";
import {
  evaluateRegulationSearchFixture,
  validateRegulationEvaluationFixture,
  validateRegulationSeedPackage,
  type RegulationEvaluationFixture,
  type RegulationSeedPackage,
} from "../src/domains/regulation/knowledge";

const seedPackage = seedPackageJson as RegulationSeedPackage;
const fixture = evaluationFixtureJson as RegulationEvaluationFixture;

const seedValidation = validateRegulationSeedPackage(seedPackage);
const fixtureValidation = validateRegulationEvaluationFixture(fixture);
const regulationReport = evaluateRegulationSearchFixture(seedPackage, fixture);
const projectDocumentReport = evaluateProjectDocumentRanking(seedPackage, fixture);
const chunkReport = evaluateProjectDocumentChunks(seedPackage);

for (const [label, validation] of [
  ["seed", seedValidation],
  ["fixture", fixtureValidation],
] as const) {
  for (const warning of validation.warnings) {
    console.warn(`[retrieval-hybrid:${label}] warning ${warning}`);
  }
  for (const error of validation.errors) {
    console.error(`[retrieval-hybrid:${label}] error ${error}`);
  }
}

for (const result of projectDocumentReport.queryResults) {
  const status = result.passed ? "ok" : "fail";
  console.log(
    `[retrieval-hybrid] ${status} ${result.id}: top=${result.topDocumentId ?? "none"} results=${result.resultDocumentIds.join(",")}`,
  );
}

if (!seedValidation.valid || !fixtureValidation.valid || !regulationReport.passed || !projectDocumentReport.passed || !chunkReport.passed) {
  console.error(
    `[retrieval-hybrid] failed regulation=${regulationReport.passedCount}/${regulationReport.queryCount} projectDocuments=${projectDocumentReport.passedCount}/${projectDocumentReport.queryCount} chunks=${chunkReport.chunkCount}`,
  );
  process.exit(1);
}

console.log(
  `[retrieval-hybrid] ok regulation=${regulationReport.passedCount}/${regulationReport.queryCount} projectDocuments=${projectDocumentReport.passedCount}/${projectDocumentReport.queryCount} chunks=${chunkReport.chunkCount}`,
);

function evaluateProjectDocumentRanking(seedPackage: RegulationSeedPackage, fixture: RegulationEvaluationFixture) {
  const files = seedPackage.documents.map((document) => ({
    id: `file-${document.id}`,
    taskId: "retrieval-eval-task",
    projectId: "retrieval-eval-project",
    fileGroupId: `group-${document.id}`,
    originalName: `${document.title}.md`,
    mimeType: "text/markdown",
    sizeBytes: document.bodyMarkdown.length,
    storageBucket: "retrieval-eval",
    objectPath: `${document.id}.md`,
    version: 1,
    versionNumber: 1,
    versionLabel: "v1",
    createdAt: document.collectedAt,
    updatedAt: document.collectedAt,
    uploadedBy: null,
    deletedAt: null,
    purgedAt: null,
    metadata: {
      analysis: [
        {
          id: document.id,
          sourceType: "document_text",
          extractedText: document.bodyMarkdown,
          summary: document.summary,
          tags: document.tags,
          confidenceWeight: 0.42,
          verificationState: "unverified",
          createdBy: null,
          createdAt: document.collectedAt,
          updatedAt: document.collectedAt,
        },
      ],
    },
  })) satisfies FileRecord[];

  const queryResults = fixture.queries.map((query) => {
    const results = rankFileAnalyses({
      files,
      query: query.question,
      limit: 4,
      mode: "text_hybrid",
    });
    const resultDocumentIds = results.map((result) => result.analysis.id);
    const matchedExpectedDocument = query.expectedDocumentIds.some((documentId) => resultDocumentIds.includes(documentId));

    return {
      id: query.id,
      resultDocumentIds,
      topDocumentId: resultDocumentIds[0] ?? null,
      passed: matchedExpectedDocument,
    };
  });
  const failures = queryResults.filter((result) => !result.passed);

  return {
    passed: failures.length === 0,
    queryCount: queryResults.length,
    passedCount: queryResults.length - failures.length,
    failures,
    queryResults,
  };
}

function evaluateProjectDocumentChunks(seedPackage: RegulationSeedPackage) {
  const first = seedPackage.documents[0];
  const file = {
    id: `file-${first.id}`,
    taskId: "retrieval-eval-task",
    projectId: "retrieval-eval-project",
    fileGroupId: `group-${first.id}`,
    originalName: `${first.title}.md`,
    mimeType: "text/markdown",
    sizeBytes: first.bodyMarkdown.length,
    storageBucket: "retrieval-eval",
    objectPath: `${first.id}.md`,
    version: 1,
    versionNumber: 1,
    versionLabel: "v1",
    createdAt: first.collectedAt,
    updatedAt: first.collectedAt,
    uploadedBy: null,
    deletedAt: null,
    purgedAt: null,
    metadata: {},
  } satisfies FileRecord;
  const analysis = {
    id: first.id,
    sourceType: "document_text",
    extractedText: first.bodyMarkdown.repeat(4),
    summary: first.summary,
    tags: first.tags,
    confidenceWeight: 0.42,
    verificationState: "unverified",
    createdBy: null,
    createdAt: first.collectedAt,
    updatedAt: first.collectedAt,
  } satisfies FileRecord["metadata"] extends { analysis?: Array<infer Entry> } ? Entry : never;
  const chunks = buildFileAnalysisChunks(file, analysis);
  const tokenHashes = new Set(chunks.map((chunk) => chunk.tokenHash));
  const passed = chunks.length > 0 && tokenHashes.size === chunks.length && chunks.every((chunk) => chunk.analysisId === first.id);
  if (!passed) {
    console.error(`[retrieval-hybrid] fail chunk generation count=${chunks.length} uniqueHashes=${tokenHashes.size}`);
  }

  return {
    passed,
    chunkCount: chunks.length,
  };
}
