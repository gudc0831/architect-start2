import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  officialLawSourceToEvidence,
  requiresOfficialLawVerification,
  verifyOfficialLawEvidence,
} from "../src/domains/legal/official-law-api";
import type { AssistantEvidence } from "../src/domains/assistant/types";
import {
  sanitizeTaskReviewEvidence,
  selectEvidenceForOfficialLawVerification,
  selectEvidenceForTaskReviewGeneration,
} from "../src/use-cases/task-review-service";

const regulationEvidence: AssistantEvidence[] = [
  {
    id: "regulation:fixture",
    kind: "regulation",
    priority: 1,
    title: "건축법 제49조",
    excerpt: "건축법 제49조 피난시설 관련 검토 seed",
    sourceUrl: "https://www.law.go.kr/법령/건축법?JO=004900&OC=server-secret-oc",
    confidenceWeight: 0.74,
  },
];

const lawNameOnlySeedEvidence: AssistantEvidence[] = [
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

  assert.equal(requiresOfficialLawVerification("건축법 제49조 피난시설 검토", []), true);
  checks.push("keyword-only legal prompts require official law verification");

  const report = await verifyOfficialLawEvidence({
    question: "건축법 제49조 피난시설 검토",
    evidence: regulationEvidence,
    oc: "server-secret-oc",
    fetchImpl: mockLawFetch,
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });

  assert.equal(report.status, "verified");
  assert.equal(report.sources[0].status, "verified");
  assert.match(report.sources[0].apiUrl, /lawService\.do/);
  assert.equal(report.sources[0].apiUrl.includes("OC="), false);
  assert.equal(report.sources[0].searchApiUrl?.includes("OC="), false);
  assert.equal(report.locators[0].sourceUrl?.includes("server-secret-oc"), false);
  assert.equal(report.sources[0].sourceUrl?.includes("server-secret-oc"), false);
  checks.push("official law verification succeeds and redacts OC values");

  const officialEvidence = officialLawSourceToEvidence(report.sources[0]);
  assert.equal(officialEvidence?.kind, "regulation");
  assert.equal(officialEvidence?.priority, 0);
  assert.equal(officialEvidence?.sourceUrl?.includes("OC="), false);
  assert.equal(officialEvidence?.sourceUrl?.includes("server-secret-oc"), false);
  checks.push("verified official law sources convert to sanitized regulation evidence");

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
  assert.equal(sanitized[0].sourceUrl?.includes("JO=004900"), true);
  assert.equal(sanitized[0].sourceUrl?.endsWith("#article"), true);
  checks.push("task-review evidence URLs redact official law credentials before save");

  const lawNameOnlyReport = await verifyOfficialLawEvidence({
    question: "건축법 기준 검토",
    evidence: [],
    oc: "server-secret-oc",
    fetchImpl: async (input) => {
      throw new Error(`law-name-only query must not call official API: ${String(input)}`);
    },
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });
  assert.equal(lawNameOnlyReport.status, "failed");
  assert.equal(lawNameOnlyReport.sources.some((source) => source.status === "verified"), false);
  checks.push("law-name-only prompts do not verify arbitrary first articles");

  assert.deepEqual(selectEvidenceForOfficialLawVerification("일반 task 완료 기준 검토", lawNameOnlySeedEvidence), []);
  assert.equal(selectEvidenceForOfficialLawVerification("국토계획법 기준 검토", lawNameOnlySeedEvidence).length, 1);
  assert.deepEqual(selectEvidenceForTaskReviewGeneration(lawNameOnlySeedEvidence, new Set()), []);
  checks.push("task-review excludes law-name-only regulation seeds unless the prompt explicitly requires law verification");

  await assertSourceBoundaries(checks);

  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
}

async function assertSourceBoundaries(checks: string[]) {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const taskReviewRoute = await readFile(new URL("../src/app/api/assistant/task-review/route.ts", import.meta.url), "utf8");
  const taskReviewService = await readFile(new URL("../src/use-cases/task-review-service.ts", import.meta.url), "utf8");
  const saasService = await readFile(new URL("../src/use-cases/assistant-saas-mode-service.ts", import.meta.url), "utf8");
  const assistantService = await readFile(new URL("../src/use-cases/assistant-service.ts", import.meta.url), "utf8");
  const candidateImportService = await readFile(
    new URL("../src/use-cases/admin/verified-legal-candidate-import-service.ts", import.meta.url),
    "utf8",
  );
  const candidateImportRoute = await readFile(
    new URL("../src/app/api/admin/knowledge/verified-legal-candidates/import/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(envExample, /^LAW_OPEN_DATA_OC=/m);
  assert.match(envExample, /National Law Information Center|국가법령정보센터|LAW OPEN DATA/);
  checks.push("official law server credential is documented as an environment variable");

  assert.match(taskReviewRoute, /requireCurrentProjectEditor/);
  assert.match(taskReviewRoute, /mode === "generate"/);
  assert.match(taskReviewRoute, /requireCurrentProjectAccess/);
  assert.doesNotMatch(taskReviewRoute, /reviewKnowledgeCandidate|\/approve/);
  checks.push("task-review route is project scoped and never calls WIKI approval");

  assert.match(taskReviewService, /assistantRepository\.createRecord/);
  assert.match(taskReviewService, /candidateState:\s*"not_candidate"/);
  assert.match(taskReviewService, /sanitizeTaskReviewEvidence/);
  assert.match(taskReviewService, /generateAssistantWithVerifiedEvidence/);
  assert.doesNotMatch(taskReviewService, /reviewKnowledgeCandidate|\/approve/);
  checks.push("task-review service saves not_candidate records without approval bypass");

  assert.match(saasService, /ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW/);
  assert.match(saasService, /requiresOfficialLawVerification/);
  assert.match(saasService, /generateAssistantWithVerifiedEvidence/);
  assert.match(saasService, /buildAssistantPromptText/);
  assert.match(saasService, /projectContextChunks/);
  assert.match(saasService, /appendLegalChangeReviewNotice/);
  assert.match(saasService, /officialLawDigest/);
  checks.push("SaaS generation routes legal prompts through task-review and preserves context metadata");

  assert.match(assistantService, /VERIFIED_LEGAL_EVIDENCE_API_SECRET_MISSING/);
  assert.match(assistantService, /"x-verified-legal-evidence-api-secret": apiSecret/);
  assert.doesNotMatch(assistantService, /sourceIds:\s*\[\]/);
  checks.push("verified legal evidence service keeps server secret and source scoping boundaries");

  const candidateImportSource = `${candidateImportService}\n${candidateImportRoute}`;
  assert.match(candidateImportSource, /candidateState:\s*"pending_review"/);
  assert.match(candidateImportRoute, /requireKnowledgeAdmin/);
  assert.doesNotMatch(candidateImportSource, /reviewKnowledgeCandidate|\/approve|candidateState:\s*"approved"/);
  checks.push("verified legal candidate import remains pending_review with no approval shortcut");
}

const mockLawFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("OC"), "server-secret-oc");

  if (url.pathname.endsWith("/lawSearch.do")) {
    return jsonResponse({
      LawSearch: {
        law: [
          {
            법령명한글: "건축법",
            법령ID: "001760",
            시행일자: "20260529",
            법령상세링크: "/법령/건축법?OC=server-secret-oc",
          },
        ],
      },
    });
  }

  if (url.pathname.endsWith("/lawService.do")) {
    assert.equal(url.searchParams.get("JO"), "004900");
    return jsonResponse({
      법령: {
        조문: {
          조문단위: [
            {
              조문번호: "49",
              조문내용: "제49조 건축물의 피난시설 및 용도제한 등에 관한 기준.",
            },
          ],
        },
      },
    });
  }

  throw new Error(`Unexpected official law API URL: ${url.toString()}`);
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

void main();
