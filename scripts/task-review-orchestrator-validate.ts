import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  officialLawSourceToEvidence,
  verifyOfficialLawEvidence,
} from "../src/domains/legal/official-law-api";
import type { AssistantEvidence } from "../src/domains/assistant/types";

const regulationEvidence: AssistantEvidence[] = [
  {
    id: "regulation:fixture",
    kind: "regulation",
    priority: 1,
    title: "건축법 제49조",
    excerpt: "건축법 제49조 피난시설 관련 검토 seed",
    confidenceWeight: 0.74,
  },
];

const fetchImpl: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/lawSearch.do")) {
    assert.equal(url.searchParams.get("OC"), "server-secret-oc");
    return jsonResponse({
      LawSearch: {
        law: [
          {
            법령명한글: "건축법",
            법령ID: "001760",
            시행일자: "20260529",
            법령상세링크: "/법령/건축법",
          },
        ],
      },
    });
  }

  if (url.pathname.endsWith("/lawService.do")) {
    assert.equal(url.searchParams.get("OC"), "server-secret-oc");
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

  throw new Error(`Unexpected URL ${url.toString()}`);
};

void main();

async function main() {
  const report = await verifyOfficialLawEvidence({
    question: "건축법 제49조 피난시설 검토",
    evidence: regulationEvidence,
    oc: "server-secret-oc",
    fetchImpl,
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });

  assert.equal(report.status, "verified");
  assert.equal(report.sources[0].status, "verified");
  assert.match(report.sources[0].apiUrl, /lawService\.do/);
  assert.equal(report.sources[0].apiUrl.includes("OC="), false);
  assert.equal(report.sources[0].searchApiUrl?.includes("OC="), false);

  const officialEvidence = officialLawSourceToEvidence(report.sources[0]);
  assert.equal(officialEvidence?.kind, "regulation");
  assert.equal(officialEvidence?.priority, 0);

  const partialReport = await verifyOfficialLawEvidence({
    question: "건축법 제49조와 건축법 제999조 검토",
    evidence: [
      ...regulationEvidence,
      {
        id: "regulation:missing-article",
        kind: "regulation",
        priority: 1,
        title: "건축법 제999조",
        excerpt: "건축법 제999조 존재하지 않는 조문 검토 seed",
        confidenceWeight: 0.74,
      },
    ],
    oc: "server-secret-oc",
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/lawSearch.do")) {
        return jsonResponse({
          LawSearch: {
            law: [
              {
                법령명한글: "건축법",
                법령ID: "001760",
                시행일자: "20260529",
                법령상세링크: "/법령/건축법",
              },
            ],
          },
        });
      }

      if (url.pathname.endsWith("/lawService.do")) {
        const articleNumber = url.searchParams.get("JO");
        return jsonResponse({
          법령: {
            조문: {
              조문단위:
                articleNumber === "004900"
                  ? [
                      {
                        조문번호: "49",
                        조문내용: "제49조 건축물의 피난시설 및 용도제한 등에 관한 기준.",
                      },
                    ]
                  : [
                      {
                        조문번호: "1",
                        조문내용: "제1조 목적.",
                      },
                    ],
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url.toString()}`);
    },
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });

  assert.equal(partialReport.status, "failed");
  assert.equal(partialReport.sources.some((source) => source.status === "verified"), true);
  assert.equal(partialReport.sources.some((source) => source.status !== "verified"), true);
  assert.equal(partialReport.sources.some((source) => source.articleNumber === "099900" && source.status === "not_found"), true);

  const previousOc = process.env.LAW_OPEN_DATA_OC;
  delete process.env.LAW_OPEN_DATA_OC;
  const blockedReport = await verifyOfficialLawEvidence({
    question: "건축법 제49조 피난시설 검토",
    evidence: regulationEvidence,
    fetchImpl,
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });
  process.env.LAW_OPEN_DATA_OC = previousOc;

  assert.equal(blockedReport.status, "failed");
  assert.match(blockedReport.failures.join(" "), /LAW_OPEN_DATA_OC/);

  const serviceSource = await readFile(new URL("../src/use-cases/task-review-service.ts", import.meta.url), "utf8");
  const taskReviewSource = await readFile(new URL("../src/use-cases/task-review-service.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../src/app/api/assistant/task-review/route.ts", import.meta.url), "utf8");
  const taskReviewRouteSource = await readFile(
    new URL("../src/app/api/assistant/task-review/route.ts", import.meta.url),
    "utf8",
  );
  const saasServiceSource = await readFile(
    new URL("../src/use-cases/assistant-saas-mode-service.ts", import.meta.url),
    "utf8",
  );
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const combinedSource = `${serviceSource}\n${routeSource}`;
  assert.match(envExample, /^LAW_OPEN_DATA_OC=/m);
  assert.match(envExample, /National Law Information Center|국가법령정보센터|LAW OPEN DATA/);
  assert.match(taskReviewRouteSource, /requireCurrentProjectEditor/);
  assert.match(taskReviewRouteSource, /mode === "generate"/);
  assert.match(taskReviewRouteSource, /requireCurrentProjectAccess/);
  assert.match(taskReviewSource, /candidateState:\s*"not_candidate"/);
  assert.match(taskReviewSource, /assistantRepository\.createRecord/);
  assert.doesNotMatch(taskReviewSource, /reviewKnowledgeCandidate/);
  assert.doesNotMatch(taskReviewRouteSource, /reviewKnowledgeCandidate/);
  assert.doesNotMatch(taskReviewRouteSource, /\/approve/);
  assert.equal(combinedSource.includes("reviewKnowledgeCandidate"), false);
  assert.equal(combinedSource.includes("/approve"), false);
  assert.equal(combinedSource.includes("requireKnowledgeAdmin"), false);
  assert.match(combinedSource, /approvalAttempted:\s*false/);
  assert.match(saasServiceSource, /ASSISTANT_LEGAL_GENERATION_REQUIRES_TASK_REVIEW/);
  assert.match(saasServiceSource, /requiresOfficialLawVerification/);
  assert.match(saasServiceSource, /requiresOfficialLawVerification\(question,\s*retrieved\.evidence\)/);
  assert.match(saasServiceSource, /item\.kind === "regulation"/);
  assert.equal(
    /if\s*\(\s*retrieved\.evidence\.some\(\(item\) => item\.kind === "regulation"\)\s*\)/.test(saasServiceSource),
    false,
  );

  console.log(
    JSON.stringify({
      status: "passed",
      checks: [
        "official law verification succeeds with mocked law.go.kr responses",
        "recorded official API URLs redact OC",
        "missing LAW_OPEN_DATA_OC blocks verification",
        "task-review orchestrator does not call WIKI approve/admin routes",
      ],
    }),
  );
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
