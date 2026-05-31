import { readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = {
  name: string;
  passed: boolean;
};

const root = process.cwd();
const assistantServicePath = join(root, "src", "use-cases", "assistant-service.ts");
const assistantSaasModeServicePath = join(root, "src", "use-cases", "assistant-saas-mode-service.ts");
const verifiedLegalSearchServicePath = join(root, "src", "use-cases", "verified-legal-search-service.ts");
const retrieveRoutePath = join(root, "src", "app", "api", "assistant", "retrieve", "route.ts");
const generateRoutePath = join(root, "src", "app", "api", "assistant", "generate", "route.ts");
const legalChangesRoutePath = join(root, "src", "app", "api", "legal-changes", "route.ts");
const legalChangeServicePath = join(root, "src", "use-cases", "legal-change-service.ts");
const legalChangeTypesPath = join(root, "src", "domains", "legal", "change-events.ts");
const envExamplePath = join(root, ".env.example");

const assistantService = readFileSync(assistantServicePath, "utf8");
const assistantSaasModeService = readFileSync(assistantSaasModeServicePath, "utf8");
const verifiedLegalSearchService = readFileSync(verifiedLegalSearchServicePath, "utf8");
const retrieveRoute = readFileSync(retrieveRoutePath, "utf8");
const generateRoute = readFileSync(generateRoutePath, "utf8");
const legalChangesRoute = readFileSync(legalChangesRoutePath, "utf8");
const legalChangeService = readFileSync(legalChangeServicePath, "utf8");
const legalChangeTypes = readFileSync(legalChangeTypesPath, "utf8");
const envExample = readFileSync(envExamplePath, "utf8");

const checks: CheckResult[] = [
  {
    name: "assistant-service does not import reviewKnowledgeCandidate",
    passed: !/import\s+.*reviewKnowledgeCandidate|from\s+["']@\/use-cases\/admin\/knowledge-service["']/.test(assistantService),
  },
  {
    name: "assistant-service does not call Knowledge admin approve routes",
    passed: !assistantService.includes("/approve"),
  },
  {
    name: "verified evidence URL is documented as server-only env",
    passed:
      envExample.includes("VERIFIED_LEGAL_EVIDENCE_API_URL=http://localhost:4100") &&
      envExample.includes("VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS=") &&
      envExample.includes("Browser clients must never call this URL directly."),
  },
  {
    name: "verified evidence URL is read only in server use-case",
    passed:
      assistantService.includes("process.env.VERIFIED_LEGAL_EVIDENCE_API_URL") &&
      !retrieveRoute.includes("VERIFIED_LEGAL_EVIDENCE_API_URL"),
  },
  {
    name: "task-review path continues when VERIFIED_LEGAL_EVIDENCE_API_URL is unset",
    passed:
      /const serviceUrl = process\.env\.VERIFIED_LEGAL_EVIDENCE_API_URL\?\.trim\(\);[\s\S]*?if \(!serviceUrl\) \{[\s\S]*?return \{ evidence: \[\], warnings: \[\] \};[\s\S]*?\}/.test(assistantService) &&
      assistantService.includes("mergeRetrievedAssistantEvidence") &&
      assistantService.includes("evidenceReadinessWarnings: mergedEvidence.evidenceReadinessWarnings"),
  },
  {
    name: "official_law maps to regulation before generation",
    passed:
      assistantService.includes('serviceKind === "official_law"') &&
      assistantService.includes('return officialLawVerified ? "regulation" : null'),
  },
  {
    name: "retrieve route does not accept legal-search override fields from browser body",
    passed: rejectsBrowserOverrideTokens(retrieveRoute),
  },
  {
    name: "generate route does not accept legal-search override fields from browser body",
    passed: rejectsBrowserOverrideTokens(generateRoute) && rejectsBrowserOverrideTokens(extractGenerateAssistantInputBlock(assistantSaasModeService)),
  },
  {
    name: "server adapter does not request unscoped all-source bundle",
    passed:
      !assistantService.includes("sourceIds: []") &&
      assistantService.includes("selectVerifiedLegalEvidenceSourceIds") &&
      assistantService.includes("VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS") &&
      assistantService.includes("VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS_MISSING"),
  },
  {
    name: "server adapter strips official-law OC credentials before persistence",
    passed:
      assistantService.includes('key.toLowerCase() === "oc"') &&
      assistantService.includes("process.env.LAW_OPEN_DATA_OC") &&
      assistantService.includes("/[?&]oc=/i.test(sanitized)"),
  },
  {
    name: "verified evidence adapter uses 5 second timeout",
    passed: assistantService.includes("setTimeout(() => controller.abort(), 5000)"),
  },
  {
    name: "verified legal search is disabled when search env is unset",
    passed:
      verifiedLegalSearchService.includes("process.env.VERIFIED_LEGAL_SEARCH_API_URL") &&
      verifiedLegalSearchService.includes('process.env.VERIFIED_LEGAL_SEARCH_ENABLED === "1"') &&
      verifiedLegalSearchService.includes("return \"\";"),
  },
  {
    name: "legal change monitor API is Knowledge Admin gated",
    passed: legalChangesRoute.includes("requireKnowledgeAdmin()") && legalChangesRoute.includes("requireCurrentProjectAccess(user)"),
  },
  {
    name: "legal change rows are scoped to visible project tasks",
    passed:
      legalChangeService.includes("visibleTaskIds") &&
      legalChangeService.includes("affectedTaskCount") &&
      legalChangeService.includes(".filter((event) => !visibleTaskIds || event.affectedTaskCount > 0)"),
  },
  {
    name: "legal change review state is acknowledgement-only",
    passed:
      legalChangeTypes.includes('export type LegalChangeReviewState = "new" | "acknowledged"') &&
      !/dismissed|not_required/.test(legalChangeTypes),
  },
  {
    name: "SaaS generate response appends legal-change requires-review notice server-side",
    passed:
      assistantSaasModeService.includes("answer: appendLegalChangeReviewNotice(providerResult.answer, retrievalSnapshot)") &&
      assistantSaasModeService.includes("Confidence is lowered and the answer requires review."),
  },
  {
    name: "saved assistant records force legal-change confidence reason",
    passed:
      assistantService.includes("normalizeLegalChangeConfidence") &&
      assistantService.includes("hasLegalChangeEvidenceImpact(evidence)") &&
      /confidenceReason:\s*hasLegalChangeEvidenceImpact\(evidence\)\s*\?\s*buildConfidenceReason/.test(assistantService),
  },
];

const failures = checks.filter((check) => !check.passed);
const report = {
  status: failures.length === 0 ? "passed" : "failed",
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

function assertBrowserOverrideSelfChecks() {
  const maliciousSamples = [
    "const { sourceIds } = body;",
    "const diagnosticMode = body['diagnosticMode'];",
    'const url = body["serviceUrl"];',
    "const { legalSearchApiUrl: url } = await request.json();",
  ];
  if (maliciousSamples.some(rejectsBrowserOverrideTokens)) {
    throw new Error("Browser override detector failed to reject a malicious sample.");
  }
}

function rejectsBrowserOverrideTokens(source: string): boolean {
  const forbiddenFields = [
    "sourceIds",
    "diagnosticMode",
    "authority",
    "serviceUrl",
    "evidence",
    "queryEmbedding",
    "chunkEmbeddings",
    "legalSearchApiUrl",
  ];
  return !new RegExp(`\\b(?:${forbiddenFields.join("|")})\\b`).test(source);
}

function extractGenerateAssistantInputBlock(source: string): string {
  return /type GenerateAssistantInput = \{[\s\S]*?\};/.exec(source)?.[0] ?? "";
}

assertBrowserOverrideSelfChecks();
