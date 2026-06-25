import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, needle: string, label: string) {
  assert.ok(source.includes(needle), `${label} missing: ${needle}`);
}

function assertNotPromotedBodyMetadata(source: string, label: string) {
  assert.doesNotMatch(source, /\bprovider\b|usage|cost/i, `${label} must not promote provider/usage/cost as draft body content`);
}

function assertBefore(source: string, first: string, second: string, label: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${label}: first marker missing: ${first}`);
  assert.notEqual(secondIndex, -1, `${label}: second marker missing: ${second}`);
  assert.ok(firstIndex < secondIndex, `${label}: ${first} must appear before ${second}`);
}

const requiredFiles = [
  "src/components/admin/knowledge-source-bucket-panel.tsx",
  "src/components/admin/knowledge-ontology-editor.tsx",
  "src/components/admin/knowledge-toc-editor.tsx",
  "src/components/admin/knowledge-structured-draft-panel.tsx",
  "src/components/admin/knowledge-generation-profile-panel.tsx",
  "src/components/admin/knowledge-admin-shell.tsx",
  "src/components/admin/knowledge-admin-tabs.ts",
  "src/components/admin/knowledge-admin-shell.module.css",
  "scripts/structured-knowledge-preview-smoke.ts",
];

for (const file of requiredFiles) {
  assert.ok(existsSync(join(root, file)), `${file} missing`);
}

const sourceBuckets = read("src/components/admin/knowledge-source-bucket-panel.tsx");
const ontology = read("src/components/admin/knowledge-ontology-editor.tsx");
const toc = read("src/components/admin/knowledge-toc-editor.tsx");
const structuredPanel = read("src/components/admin/knowledge-structured-draft-panel.tsx");
const generationProfilePanel = read("src/components/admin/knowledge-generation-profile-panel.tsx");
const shell = read("src/components/admin/knowledge-admin-shell.tsx");
const tabs = read("src/components/admin/knowledge-admin-tabs.ts");
const css = read("src/components/admin/knowledge-admin-shell.module.css");
const previewSmoke = read("scripts/structured-knowledge-preview-smoke.ts");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

assertIncludes(shell, "KnowledgeStructuredDraftPanel", "draft tab imports structured panel");
assertIncludes(shell, "KnowledgeGenerationProfilePanel", "operations tab imports generation profile panel");
assertIncludes(shell, "KnowledgeSourceBucketView", "shell owns source bucket loading contract");
assertIncludes(shell, "/source-buckets", "shell loads source buckets");
assertIncludes(shell, "/structured-draft", "shell generates structured draft");
assertIncludes(shell, "/generation-profiles", "shell loads generation profiles");
assertIncludes(shell, "generationProfiles", "shell owns generation profile state");
assertIncludes(shell, "setDraftSubview", "shell switches draftSubview through router state");
assertIncludes(shell, "router.push", "shell uses push for navigation changes");
assertIncludes(shell, "structuredDraftApprovalIssue", "shell blocks approval without synced structured draft");
assertIncludes(shell, "disabled={busy || Boolean(structuredDraftApprovalIssue)}", "approval button must be disabled by structured draft issue");
assertIncludes(shell, "structuredDraft: structuredDraftResult.draft", "approval payload must send structured draft");
assertIncludes(shell, "generationRunId: structuredDraftResult.generationRunId", "approval payload must send generation run id");
assertIncludes(shell, "원본 비활성화됨", "disabled source project wiki badge");
assertIncludes(shell, "sourceProjectWikiItemId", "project wiki source item id field");
assertIncludes(shell, "sourceTaskId", "project wiki source task id field");
assertIncludes(shell, "sourceReviewRecordId", "project wiki source review record id field");
assertIncludes(shell, "sourceWorkSummaryDraftId", "project wiki source work summary draft id field");
assertIncludes(shell, "프로젝트 WIKI 출처 상태", "project wiki source status in candidate detail");
assertIncludes(shell, "원본 프로젝트 WIKI", "project wiki source item link in candidate detail");
assertIncludes(shell, "원본 작업", "project wiki source task link in candidate detail");
assertIncludes(shell, "원본 임시 검토 기록", "project wiki source review link in candidate detail");
assertIncludes(shell, "승인 작업 기록", "project wiki approved work link in candidate detail");
assertIncludes(shell, "createProjectWikiSourceHref", "project wiki source item href builder");
assertIncludes(shell, "createTaskSourceHref", "project wiki source task href builder");
assertIncludes(shell, "createAssistantReviewSourceHref", "project wiki source daily href builder");
assertIncludes(shell, "projectWikiItemId", "project wiki source item id query param");
assertIncludes(shell, "assistantReviewSessionId", "project wiki source review query param");
assertIncludes(shell, "workSummaryDraftId", "project wiki source work summary query param");
assertIncludes(shell, "프로젝트 WIKI AI 적합성", "project wiki suitability in candidate detail");
assertIncludes(shell, "보완 메모", "project wiki supplemental note in candidate detail");
assertIncludes(shell, "공용화 주의사항", "project wiki commonization caution in candidate detail");
assertIncludes(css, "sourceDisabledBadge", "disabled source project wiki badge css");

assertIncludes(tabs, 'export type KnowledgeDraftSubview = "sources" | "reasoning" | "ontology" | "toc" | "sections" | "preview" | "metadata"', "KnowledgeDraftSubview union");
assertIncludes(tabs, "knowledgeDraftSubviews", "draftSubview allowed values");
assertIncludes(tabs, 'draftSubview: "sources"', "draftSubview default fallback");
assertIncludes(tabs, 'parseEnum(searchParams.get("draftSubview"), knowledgeDraftSubviews, defaultKnowledgeAdminNavigation.draftSubview)', "draftSubview parse fallback");
assertIncludes(tabs, 'writeParam(params, "draftSubview", merged.draftSubview, defaultKnowledgeAdminNavigation.draftSubview)', "draftSubview serialization");

for (const label of ["법규 근거", "Task 맥락", "프로젝트 자료", "기존 승인 WIKI", "로컬 WIKI", "외부 근거"]) {
  assertIncludes(sourceBuckets, label, `source bucket label ${label}`);
}

for (const label of ["concept label", "category", "scope", "relations", "relation reason"]) {
  assert.match(ontology.toLowerCase(), new RegExp(label), `ontology field label missing: ${label}`);
}

for (const label of ["요약", "적용 기준", "확인 절차", "근거", "예외 / 주의"]) {
  assertIncludes(toc, label, `required TOC label ${label}`);
}
assertIncludes(toc, "blocking / 필수 섹션 누락", "TOC missing required section blocking status");

assertIncludes(structuredPanel, "Integrated reasoning summary", "integrated reasoning summary label");
assertIncludes(structuredPanel, "통합 추론 요약", "integrated reasoning summary Korean label");
assertIncludes(structuredPanel, "Claim-evidence matrix", "claim-evidence matrix label");
assertIncludes(structuredPanel, "주장-근거 매트릭스", "claim-evidence matrix Korean label");
assertBefore(structuredPanel, '"sources"', '"reasoning"', "draftSubview hierarchy");
assertBefore(structuredPanel, '"reasoning"', '"ontology"', "draftSubview hierarchy");
assertBefore(structuredPanel, '"ontology"', '"toc"', "draftSubview hierarchy");
assertBefore(structuredPanel, '"toc"', '"sections"', "draftSubview hierarchy");
assertBefore(structuredPanel, '"sections"', '"preview"', "draftSubview hierarchy");
assertBefore(structuredPanel, '"preview"', '"metadata"', "draftSubview hierarchy");
assertBefore(shell, "<KnowledgeStructuredDraftPanel", "기본 승인 필드", "structured panel must appear before legacy approval fields");

for (const label of ["blocking / 차단", "warning / 주의", "ready / 준비됨"]) {
  assert.ok(
    sourceBuckets.includes(label) || structuredPanel.includes(label) || toc.includes(label),
    `status label missing: ${label}`,
  );
}

assertIncludes(structuredPanel, "<details className={styles.compactMetadata}>", "generation metadata collapsed details");
assertIncludes(structuredPanel, "<summary>생성 메타데이터</summary>", "generation metadata summary");
assertIncludes(structuredPanel, "readOnly", "legacy Markdown textarea must be read-only preview/compatibility UI");
assert.doesNotMatch(structuredPanel, /<details[^>]*\sopen\b/, "generation metadata must stay collapsed by default");

for (const label of [
  "active profile name",
  "version",
  "state",
  "TOC template count",
  "citation rule count",
  "section rule count",
  "last updated",
]) {
  assertIncludes(generationProfilePanel, label, `active profile summary label ${label}`);
}

for (const label of [
  "sourceBucketRules JSON editor",
  "tocTemplate JSON editor",
  "ontologySchema JSON editor",
  "citationRules JSON editor",
  "sectionRules JSON editor",
]) {
  assertIncludes(generationProfilePanel, label, `generation profile JSON editor label ${label}`);
}

assertIncludes(generationProfilePanel, "JSON parse error", "generation profile parse error label");
assertIncludes(generationProfilePanel, "before/after diff preview", "generation profile diff preview label");
assertIncludes(generationProfilePanel, "activationProfileFields = activationProfile ? pickProfileFields(activationProfile) : null", "generation profile activation preview must use selected draft fields");
assertIncludes(generationProfilePanel, "const diffTargetFields = activationProfileFields ?? draftFields", "generation profile diff must prefer selected activation draft");
assertIncludes(generationProfilePanel, "impact target", "generation profile impact target label");
assertIncludes(generationProfilePanel, "selected candidate sample dry-run", "generation profile sample dry-run control");
assertIncludes(generationProfilePanel, "/structured-draft", "generation profile sample dry-run route call");
assertIncludes(generationProfilePanel, "activation impact summary", "generation profile activation impact summary");
assertIncludes(generationProfilePanel, "source bucket rules", "generation profile source bucket impact");
assertIncludes(generationProfilePanel, "ontology schema keys", "generation profile ontology impact");
assertIncludes(generationProfilePanel, "activation confirmation", "generation profile activation confirmation control");
assertIncludes(generationProfilePanel, "rollback confirmation", "generation profile rollback confirmation control");
assertIncludes(generationProfilePanel, "rollback reason", "generation profile rollback reason control");
assertIncludes(generationProfilePanel, "/api/admin/knowledge/generation-profiles", "generation profile draft create route call");
assertIncludes(generationProfilePanel, "/activate", "generation profile activate route call");
assertIncludes(generationProfilePanel, "/rollback", "generation profile rollback route call");
assertIncludes(generationProfilePanel, "server route result audit status message", "generation profile route/audit status message");
assertIncludes(generationProfilePanel, "isRecord(payload.error) && typeof payload.error.message === \"string\"", "generation profile nested route error handling");
assertIncludes(
  generationProfilePanel,
  "Generation profiles are generation instructions for approved WIKI structure",
  "generation profile scope wording",
);

for (const [label, source] of [
  ["source bucket panel", sourceBuckets],
  ["ontology editor", ontology],
  ["TOC editor", toc],
  ["structured draft panel", structuredPanel],
  ["generation profile panel", generationProfilePanel],
] as const) {
  assertNotPromotedBodyMetadata(source, label);
}

assertIncludes(css, ".sourceBucketBlocking", "blocking bucket styles");
assertIncludes(css, ".sourceBucketWarning", "warning bucket styles");
assertIncludes(css, ".sourceBucketReady", "ready bucket styles");
assertIncludes(css, ".sourceBucketMuted", "muted bucket styles");
assertIncludes(css, ".draftSubviewList", "draftSubview navigation styles");
assertIncludes(css, ".generationProfilePanel", "generation profile panel styles");
assertIncludes(css, ".profileEditorGrid", "generation profile JSON editor styles");
assertIncludes(css, ".profileDiff", "generation profile diff preview styles");
assertIncludes(css, ".profileImpactGrid", "generation profile impact summary styles");

for (const route of [
  "/admin/knowledge?work=candidates&candidateTab=evidence",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sources",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=reasoning",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=ontology",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=toc",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sections",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=preview",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=metadata",
  "/admin/knowledge?work=candidates&candidateTab=decision",
  "/admin/knowledge?work=approved",
  "/admin/knowledge?work=local_import",
  "/admin/knowledge?work=operations",
]) {
  assertIncludes(previewSmoke, route, `preview smoke route ${route}`);
}

for (const label of [
  "pageerror",
  "console",
  "failed /api/admin/knowledge responses",
  "Claim-evidence matrix",
  "active profile name",
  "sourceBucketRules JSON editor",
  "before/after diff preview",
  "activation confirmation",
  "rollback reason",
  "--no-skip",
  "assertNoReleaseSkips",
  "STRUCTURED_KNOWLEDGE_SMOKE_NO_SKIP",
]) {
  assertIncludes(previewSmoke, label, `preview smoke coverage ${label}`);
}

assert.equal(
  packageJson.scripts?.["structured-knowledge:ui-contract:validate"],
  "tsx scripts/structured-knowledge-ui-contract-validate.ts",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:preview-smoke"],
  "tsx scripts/structured-knowledge-preview-smoke.ts",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:preview-smoke:release"],
  "tsx scripts/structured-knowledge-preview-smoke.ts --no-skip",
);

console.log("structured-knowledge-ui-contract-validate: ok");
