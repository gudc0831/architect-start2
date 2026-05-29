import { readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = {
  name: string;
  passed: boolean;
};

const root = process.cwd();
const assistantServicePath = join(root, "src", "use-cases", "assistant-service.ts");
const retrieveRoutePath = join(root, "src", "app", "api", "assistant", "retrieve", "route.ts");
const envExamplePath = join(root, ".env.example");

const assistantService = readFileSync(assistantServicePath, "utf8");
const retrieveRoute = readFileSync(retrieveRoutePath, "utf8");
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
    name: "official_law maps to regulation before generation",
    passed:
      assistantService.includes('serviceKind === "official_law"') &&
      assistantService.includes('return officialLawVerified ? "regulation" : null'),
  },
  {
    name: "retrieve route does not accept sourceIds from browser body",
    passed: !retrieveRoute.includes("sourceIds"),
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
      assistantService.includes('url.searchParams.delete("OC")') &&
      assistantService.includes("process.env.LAW_OPEN_DATA_OC") &&
      assistantService.includes('includes(`OC${"="}`)'),
  },
  {
    name: "verified evidence adapter uses 5 second timeout",
    passed: assistantService.includes("setTimeout(() => controller.abort(), 5000)"),
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
