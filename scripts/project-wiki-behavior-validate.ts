import assert from "node:assert/strict";
import type { ProjectWikiItem } from "@/domains/project-wiki/types";
import {
  matchesProjectWikiKeyword,
  normalizeProjectWikiKeyword,
  projectWikiStatusLabel,
  suitabilityBadgeTone,
} from "@/domains/project-wiki/search";

const item: ProjectWikiItem = {
  id: "project-wiki-item-1",
  projectId: "project-1",
  sourceTaskId: "task-1",
  sourceReviewRecordId: "review-1",
  sourceWorkSummaryDraftId: "draft-1",
  commonCandidateRecordId: "candidate-1",
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

assert.equal(projectWikiStatusLabel("active"), "활성");
assert.equal(projectWikiStatusLabel("disabled"), "비활성");
assert.equal(suitabilityBadgeTone("recommended"), "green");
assert.equal(suitabilityBadgeTone("caution"), "amber");
assert.equal(suitabilityBadgeTone("not_recommended"), "gray");

console.log("project-wiki-behavior-validate: ok");
