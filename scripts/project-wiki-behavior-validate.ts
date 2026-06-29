import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectWikiItem } from "@/domains/project-wiki/types";
import {
  evidenceKindSourceBadge,
  matchesProjectWikiKeyword,
  normalizeProjectWikiKeyword,
  projectWikiStatusLabel,
  rankProjectWikiItems,
  suitabilityBadgeTone,
} from "@/domains/project-wiki/search";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const item: ProjectWikiItem = {
  id: "project-wiki-item-1",
  projectId: "project-1",
  sourceTaskId: "task-1",
  sourceReviewRecordId: "review-1",
  sourceWorkSummaryDraftId: "draft-1",
  commonCandidateRecordId: "candidate-1",
  commonCandidateStatus: "candidate",
  title: "방화 구획 검토 기록",
  summary: "피난층 인접 구획의 방화 성능을 확인했다.",
  bodyMarkdown: "## 결론\n건축법 검토 결과 주요 방화구획 기준은 충족한다.",
  tags: ["피난", "방화구획", "건축법"],
  supplementalNote: "현장 협의에서 샤프트 주변 보완 의견이 있었다.",
  aiSuitabilityState: "recommended",
  aiSuitabilityReason: "승인 결론과 근거가 있어 등록 가능하다.",
  commonizationCaution: "다른 프로젝트 적용 전 현장 조건을 확인한다.",
  status: "active",
  createdBy: "user-1",
  createdByDisplay: "User",
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
  disabledBy: null,
  disabledAt: null,
  restoredBy: null,
  restoredAt: null,
};

assert.equal(normalizeProjectWikiKeyword("  방화 구획  "), "방화 구획");
assert.equal(normalizeProjectWikiKeyword(""), "");

assert.equal(matchesProjectWikiKeyword(item, "방화 구획"), true);
assert.equal(matchesProjectWikiKeyword(item, "방화구획"), true);
assert.equal(matchesProjectWikiKeyword(item, "피난층"), true);
assert.equal(matchesProjectWikiKeyword(item, "건축법"), true);
assert.equal(matchesProjectWikiKeyword(item, "샤프트"), true);
assert.equal(matchesProjectWikiKeyword(item, "철골"), false);
assert.deepEqual(
  rankProjectWikiItems({
    items: [
      { ...item, id: "disabled-project-wiki-item", status: "disabled" },
      item,
    ],
    query: "방화구획",
    limit: 10,
  }).map((result) => result.item.id),
  ["project-wiki-item-1"],
);

assert.equal(projectWikiStatusLabel("active"), "활성");
assert.equal(projectWikiStatusLabel("disabled"), "비활성");
assert.equal(evidenceKindSourceBadge("project_wiki"), "프로젝트 WIKI");
assert.equal(evidenceKindSourceBadge("central_knowledge"), "공용 WIKI");
assert.equal(suitabilityBadgeTone("recommended"), "green");
assert.equal(suitabilityBadgeTone("caution"), "amber");
assert.equal(suitabilityBadgeTone("not_recommended"), "gray");

const postgresStore = read("src/repositories/project-wiki/postgres-store.ts");
const projectWikiService = read("src/use-cases/project-wiki-service.ts");
const suitabilityService = read("src/use-cases/project-wiki-suitability-service.ts");
const registerProjectWikiSource = projectWikiService.slice(
  projectWikiService.indexOf("export async function registerProjectWiki"),
  projectWikiService.indexOf("export async function setProjectWikiStatus"),
);
const setProjectWikiStatusSource = projectWikiService.slice(
  projectWikiService.indexOf("export async function setProjectWikiStatus"),
  projectWikiService.indexOf("function readActionLogs"),
);
const postgresAssistantSearch = postgresStore.slice(postgresStore.indexOf("async searchProjectWikiForAssistant"));
const localStore = read("src/repositories/project-wiki/local-store.ts");
const localAssistantSearch = localStore.slice(localStore.indexOf("async searchProjectWikiForAssistant"));
const projectWikiPage = read("src/components/project-context/project-wiki-page.tsx");
const projectWikiRoute = read("src/app/api/projects/[projectId]/project-wiki/route.ts");
const projectWikiStatusRoute = read("src/app/api/projects/[projectId]/project-wiki/[itemId]/status/route.ts");
assert.match(
  postgresStore,
  /catch \(error\) \{[\s\S]*isUniqueConstraintError\(error\)[\s\S]*findProjectWikiBySourceReviewRecord[\s\S]*return existing;/,
);
assert.match(postgresStore, /Prisma\.PrismaClientKnownRequestError[\s\S]*error\.code === "P2002"/);
assert.match(
  postgresStore,
  /normalizeProjectWikiStatus\(current\.status\) === input\.status[\s\S]*actionLog: null/,
);

assert.match(localStore, /current\.status === input\.status[\s\S]*actionLog: null/);
assert.match(localStore, /searchProjectWikiForAssistant[\s\S]*status:\s*"active"/);
assert.match(postgresStore, /searchProjectWikiForAssistant[\s\S]*status:\s*"active"/);
assert.doesNotMatch(postgresAssistantSearch, /limit:\s*100/);
assert.doesNotMatch(localAssistantSearch, /limit:\s*100/);
assert.match(localStore, /withCurrentCommonCandidateStatus/);
assert.match(localStore, /assistantRepository\.findRecordById\(item\.commonCandidateRecordId\)/);
assert.match(projectWikiService, /persistProjectWikiPreviewState/);
assert.match(projectWikiService, /previewDraft:\s*input\.preview\.draft/);
assert.match(projectWikiService, /readSourceReviewAvailability/);
assert.match(projectWikiService, /assistantRepository\.findRecordById\(input\.sourceReviewRecordId\)/);
assert.match(projectWikiService, /available:\s*!sourceRecord\.reviewDeletedAt/);
assert.match(projectWikiService, /deletedAt:\s*sourceRecord\.reviewDeletedAt \?\? null/);
assert.match(registerProjectWikiSource, /readStoredProjectWikiRegistrationPreview/);
assert.doesNotMatch(registerProjectWikiSource, /buildProjectWikiRegistrationPreview/);
assert.match(registerProjectWikiSource, /isRegisterableProjectWikiState\(storedPreview\.state\)/);
assert.match(projectWikiRoute, /readOptionalDraft\(rawBody\)/);
assert.match(projectWikiRoute, /draft\?\.title/);
assert.match(projectWikiRoute, /draft\?\.summary/);
assert.match(projectWikiRoute, /draft\?\.bodyMarkdown/);
assert.match(projectWikiRoute, /draft\?\.tags/);
assert.match(registerProjectWikiSource, /applyProjectWikiDraftEdits\(storedPreview\.draft/);
assert.match(registerProjectWikiSource, /draft,\s*actorProfileId/s);
assert.doesNotMatch(registerProjectWikiSource, /draft: storedPreview\.draft/);
assert.match(setProjectWikiStatusSource, /projectWikiRepository\.getProjectWikiItem/);
assert.match(setProjectWikiStatusSource, /buildProjectWikiStatusControl/);
assert.match(setProjectWikiStatusSource, /forbidden\(statusControl\.reason, "PROJECT_WIKI_STATUS_FORBIDDEN"\)/);
assert.match(setProjectWikiStatusSource, /normalizeStatusReason\(action, input\.reason\)/);
assert.match(projectWikiService, /action === "disable" && !reason/);
assert.match(projectWikiService, /PROJECT_WIKI_DISABLE_REASON_REQUIRED/);
assert.match(projectWikiService, /input\.user\.role === "admin"/);
assert.match(projectWikiService, /input\.projectRole === "manager"/);
assert.match(projectWikiService, /input\.item\.createdBy === input\.user\.id/);
assert.match(projectWikiStatusRoute, /action: body\.action/);
assert.match(projectWikiStatusRoute, /reason: body\.reason/);
assert.match(projectWikiPage, /sourceReview:\s*\{\s*available:\s*boolean;\s*deletedAt:\s*string \| null;/);
assert.match(projectWikiPage, /임시 검토 기록 삭제됨/);
assert.match(projectWikiPage, /function approvedWorkRecordHref/);
assert.match(projectWikiPage, /if \(detail\.sourceReview\.available\) \{[\s\S]*assistantReviewSessionId/);
assert.match(projectWikiPage, /삭제된 임시 검토 기록과 별도 승인 기록/);
assert.match(projectWikiPage, /canChangeStatus:\s*boolean/);
assert.match(projectWikiPage, /if \(action === "disable" && !normalizedReason\)/);
assert.match(projectWikiPage, /비활성화 사유 필수/);
assert.match(projectWikiPage, /isStatusControlDisabled/);
assert.match(projectWikiPage, /복원 사유는 선택 입력입니다/);
assert.match(suitabilityService, /runAssistantProviderWithSaasGovernance/);
assert.match(suitabilityService, /auditEventType:\s*"project_wiki\.suitability\.success"/);
assert.match(suitabilityService, /!policy\.enabled \|\| policy\.provider !== "openai"/);
assert.match(suitabilityService, /policy\.provider !== "openai"/);
assert.doesNotMatch(suitabilityService, /catch\s*\{[\s\S]*return fallbackDraft;/);
assert.match(postgresStore, /canRegister\s*=\s*isRegisterableSuitabilityState\(draft\.aiSuitabilityState\)/);
assert.match(postgresStore, /commonCandidateRecord:\s*\{\s*select:\s*\{\s*candidateState:\s*true\s*\}/);

const contracts = read("src/repositories/project-wiki/contracts.ts");
assert.match(contracts, /actionLog: ProjectWikiActionLog \| null;/);

const jsonBody = read("src/app/api/projects/[projectId]/project-wiki/json-body.ts");
assert.match(jsonBody, /readJsonBody\(request: Request\)/);
assert.match(jsonBody, /badRequest\("Invalid JSON payload\.", "PROJECT_WIKI_PAYLOAD_INVALID"\)/);

for (const routePath of [
  "src/app/api/projects/[projectId]/project-wiki/route.ts",
  "src/app/api/projects/[projectId]/project-wiki/registration-preview/route.ts",
  "src/app/api/projects/[projectId]/project-wiki/[itemId]/status/route.ts",
]) {
  const route = read(routePath);
  assert.match(route, /readJsonBody\(request\)/, `${routePath} must parse JSON through readJsonBody`);
  assert.doesNotMatch(route, /request\.json\(/, `${routePath} must not call request.json directly`);
}

console.log("project-wiki-behavior-validate: ok");
