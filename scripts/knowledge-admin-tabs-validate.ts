import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`);
  }
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  if (haystack.includes(needle)) {
    throw new Error(`${label} must be removed: ${needle}`);
  }
}

function assertAfter(haystack: string, needle: string, marker: string, label: string) {
  const markerIndex = haystack.indexOf(marker);
  const needleIndex = haystack.indexOf(needle);
  if (markerIndex < 0 || needleIndex < 0 || needleIndex < markerIndex) {
    throw new Error(`${label} is not after ${marker}`);
  }
}

const page = read("src/app/admin/knowledge/page.tsx");
const shell = read("src/components/admin/knowledge-admin-shell.tsx");
const tabs = read("src/components/admin/knowledge-admin-tabs.ts");
const navigation = read("src/components/admin/use-knowledge-admin-navigation.ts");
const css = read("src/components/admin/knowledge-admin-shell.module.css");
const guide = read("사용자 가이드.md");
const localImport = read("src/components/admin/knowledge-local-import-placeholder-panel.tsx");

assertIncludes(tabs, 'candidates: "후보 관리"', "canonical work tab labels");
assertIncludes(tabs, 'approved: "승인 WIKI"', "canonical work tab labels");
assertIncludes(tabs, 'local_import: "로컬 WIKI 가져오기"', "canonical work tab labels");
assertIncludes(tabs, 'operations: "운영 점검"', "canonical work tab labels");
assertIncludes(tabs, 'evidence: "근거 확인"', "canonical candidate steps");
assertIncludes(tabs, 'draft: "초안 다듬기"', "canonical candidate steps");
assertIncludes(tabs, 'decision: "승인 결정"', "canonical candidate steps");
assertIncludes(tabs, "approvedFocus", "approved focus URL hint");
assertIncludes(tabs, "approvedSyncTarget", "approved sync target URL hint");
assertIncludes(tabs, "discoveryId", "discovery URL hint");
assertIncludes(tabs, "importPreviewId", "import preview URL hint");
assertIncludes(tabs, "rubricId", "rubric URL hint");
assertIncludes(page, "parseKnowledgeAdminNavigation", "server page query parsing");
assertIncludes(shell, "initialNavigation", "shell receives parsed navigation");
assertIncludes(navigation, "createKnowledgeAdminNavigationHref", "client navigation href helper");
assertIncludes(navigation, "serializeKnowledgeAdminNavigation", "navigation helper uses canonical serializer");
assertIncludes(shell, "createKnowledgeAdminNavigationHref", "shell delegates URL serialization");

assertNotIncludes(tabs, 'sync: "내보내기/동기화"', "top-level sync tab");
assertNotIncludes(tabs, 'overview: "개요"', "overview candidate tab");
assertNotIncludes(tabs, 'quality: "품질 점검"', "quality candidate tab");
assertNotIncludes(shell, 'tab="sync"', "top-level sync tab panel");
assertNotIncludes(shell, 'tab="overview"', "overview candidate tab panel");
assertNotIncludes(shell, 'tab="quality"', "quality candidate tab panel");
assertIncludes(shell, 'tab="candidates"', "candidate management work panel");
assertIncludes(shell, 'tab="local_import"', "local import work panel");
assertIncludes(shell, "syncNavigationFromSearchParams", "back/forward URL reconciliation");
assertIncludes(shell, "reconcileAuxiliaryNavigation", "auxiliary URL hint reconciliation");
assertIncludes(shell, "router.push", "user navigation creates browser history");
assertIncludes(shell, "router.replace", "invalid URL cleanup avoids extra history entries");
assertIncludes(shell, "beforeunload", "dirty draft unload guard");
assertIncludes(shell, "approved-wiki-export-sync", "approved export sync auxiliary surface");
assertIncludes(shell, "KnowledgeLocalImportPlaceholderPanel", "local import placeholder panel");
assertIncludes(shell, "runDiscoveryScan", "discovery scan action");
assertIncludes(shell, "createdRequestId", "discovery query stores request id");
assertIncludes(shell, "promoteDiscoveryRequest", "discovery promotion action");
assertIncludes(shell, "dismissDiscoveryRequest", "discovery dismissal action");
assertIncludes(shell, "createLocalImportPreview", "local import preview action");
assertIncludes(shell, "confirmLocalImportPreview", "local import confirmation action");
assertIncludes(shell, "importLocalImportPreview", "local import candidate creation action");
assertIncludes(shell, "localImportIncludedCount === 0", "local import requires included preview items");
assertIncludes(shell, "LLM 균형 선별 기준", "local import rubric explanation in UI");
assertAfter(shell, "<LegalBatchAuditStatusPanel", 'tab="operations"', "legal batch audit panel placement");
assertAfter(shell, "<LegalChangeMonitorPanel", 'tab="operations"', "legal change monitor panel placement");

assertIncludes(css, ".workTabList", "work tab styles");
assertIncludes(css, ".candidateDetailTabList", "candidate tab styles");
assertIncludes(css, ".tabPanel", "tabpanel styles");
assertIncludes(css, ".decisionSummary", "decision summary styles");
assertIncludes(css, ".approvedAuxiliarySurface", "approved export sync focus surface");

assertIncludes(localImport, "Phase 1에서는 로컬 파일을 스캔하지 않고", "local import non-mutating boundary");
assertIncludes(localImport, "후보를 생성하지 않습니다", "local import candidate creation boundary");
assertIncludes(localImport, "LLM은 차단 규칙을 통과한 항목만", "local import rubric explanation");

assertIncludes(guide, "`내보내기/동기화`는 상위 탭이 아니라 `승인 WIKI` 안의 보조 화면입니다.", "export sync IA boundary");
assertIncludes(guide, "Phase 1에서는 DB/API/schema/auth guard를 변경하지 않습니다", "phase boundary");
assertIncludes(guide, "전체 WIKI 단순화 완료는 Phase 2 이후 데이터/API/RBAC/audit까지 완료되어야 인정합니다", "full completion boundary");

console.log("knowledge-admin-tabs-validate: ok");
