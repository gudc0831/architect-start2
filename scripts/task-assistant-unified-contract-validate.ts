import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type Check = {
  name: string;
  passed: boolean;
  detail: string;
};

const repoRoot = process.cwd();
const legalRepoRoot = resolveLegalRepoRoot();
const checks: Check[] = [];

checkFileContains({
  name: "service default instruction version",
  filePath: appPath("src/domains/assistant/review-instruction.ts"),
  required: [
    "TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION",
    "TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION",
  ],
});

checkLegalApiAnchors();

checkFileContains({
  name: "unified review verdict and candidate impact fields",
  filePath: appPath("src/domains/assistant/review-session.ts"),
  required: [
    "UnifiedReviewVerdict",
    "candidateImpact",
    "candidateFactsMissing",
    "conclusionMayChange",
  ],
});

checkNoNormalGenerateRecordPost();
checkNoServerGenerateAutoSave();
checkReviewSessionRoutes();
checkTemporaryReviewAutoSaveContract();
checkReviewSessionDeleteRestoreContract();
checkTemporaryReviewUiCopyReadiness();
checkTaskAssistantAutoSaveProjectWikiUx();
checkReviewSessionExecutionModePersistence();
checkTaskAssistantBasicAdvancedMode();
checkTaskAssistantChromeSidePanelBridge();
checkTaskAssistantEvidenceUiDisclosure();
checkTaskAssistantVisibleAnswerUx();
checkTaskAssistantSummaryEditorCollapsedUx();
checkTaskAssistantClosureDetailHover();
checkCollapsedSecondaryPanelDefaults();
checkAnswerContractVerdicts();
checkCandidateImpactRule();
checkOfficialVerifiedLegalMatchContract();
checkReviewSessionRenameSupport();
checkFollowUpEvidenceSeparation();

for (const check of checks) {
  const status = check.passed ? "PASS" : "FAIL";
  console.log(`${status} ${check.name} - ${check.detail}`);
}

const failedCount = checks.filter((check) => !check.passed).length;
if (failedCount > 0) {
  console.log(`FAIL task-assistant unified contract guardrails - ${failedCount} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("PASS task-assistant unified contract guardrails - all checks passed.");
}

function checkLegalApiAnchors() {
  const root = legalRepoRoot;
  if (!root) {
    addCheck("legal API repo resolved", false, "verified-legal-evidence-api repo was not found");
    addCheck("LLM extraction provider and Graph RAG invocation", false, "legal API repo is unavailable");
    return;
  }

  addCheck("legal API repo resolved", true, root);
  const hasExpectedMarkers = existsSync(join(root, "package.json")) &&
    existsSync(join(root, "src", "retrieval", "legal-hybrid-search.ts")) &&
    existsSync(join(root, "src", "api", "server.ts"));
  if (!hasExpectedMarkers) {
    addCheck("LLM extraction provider and Graph RAG invocation", false, "resolved legal API repo is missing expected project markers");
    return;
  }

  const extractionProviderPath = join(root, "src", "legal-graph", "llm-extraction-provider.ts");
  const hybridSearchPath = join(root, "src", "retrieval", "legal-hybrid-search.ts");
  const serverPath = join(root, "src", "api", "server.ts");
  const rankerPath = join(root, "src", "legal-graph", "graph-rag-ranker.ts");
  const extractionProvider = stripComments(readOptionalFile(extractionProviderPath));
  const hybridSearch = stripComments(readOptionalFile(hybridSearchPath));
  const server = stripComments(readOptionalFile(serverPath));
  const ranker = stripComments(readOptionalFile(rankerPath));
  const fallbackExtractionBody = extractFunctionBody(extractionProvider, "createFallbackLegalGraphRagExtraction");
  const hasLlmExtractionProvider = existsSync(extractionProviderPath) &&
    extractionProvider.includes("buildLegalGraphRagExtractionPrompt") &&
    extractionProvider.includes("llmExtractionStatus") &&
    /llmExtractionStatus\s*:\s*["'`]fallback["'`]/.test(fallbackExtractionBody);
  const searchBody = extractFunctionBody(hybridSearch, "searchLegalCorpus");
  const graphRagInvocationOrder = orderedAnchorsExist(searchBody, [
    "collect",
    "extractTaskFacts",
    "extractApplicabilityRules",
    "rankLegalGraphRag",
  ]);
  const serverBody = extractFunctionBody(server, "normalizeLegalSearchBody");
  const searchHandlerBody = extractFunctionBody(server, "handleLegalSearchRequest");
  const hasGraphRagInvocation = existsSync(rankerPath) &&
    graphRagInvocationOrder &&
    /applicability\s*:/.test(searchBody) &&
    /taskContext/.test(serverBody) &&
    /graphRagMode/.test(serverBody) &&
    /taskContext\s*:\s*input\.taskContext/.test(searchHandlerBody) &&
    /graphRagMode\s*:\s*input\.graphRagMode/.test(searchHandlerBody) &&
    /export\s+function\s+rankLegalGraphRag/.test(ranker) &&
    /LegalApplicabilityBundle/.test(ranker);

  addCheck(
    "LLM extraction provider and Graph RAG invocation",
    hasLlmExtractionProvider && hasGraphRagInvocation,
    hasLlmExtractionProvider && hasGraphRagInvocation
      ? "legal API source contains extraction provider and Graph RAG invocation anchors"
      : "missing legal API extraction provider or actual Graph RAG invocation anchor",
  );
}

function checkNoNormalGenerateRecordPost() {
  const filePath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const content = stripComments(readRequiredFile(filePath));
  if (!content) {
    addCheck("no automatic assistant record POST in normal generate click flow", false, "task assistant panel missing");
    return;
  }

  const generateFunctions = extractFunctionBodies(content, [
    "runAssistant",
    "handleGenerate",
    "handleTaskReviewGenerate",
    "generateReview",
    "runTaskReview",
    "runAssistantReview",
  ]).join("\n");
  if (!generateFunctions) {
    addCheck("no automatic assistant record POST in normal generate click flow", false, "could not locate task assistant generate handler");
    return;
  }
  const bodyToInspect = generateFunctions;
  const recordsEndpointPost = /(?:fetch|postJson|requestJson|apiClient|mutate)\s*\([^)]*["'`]\/api\/assistant\/records["'`]/s.test(bodyToInspect) ||
    /\/api\/assistant\/records/.test(bodyToInspect) && /(?:method\s*:\s*["'`]POST["'`]|postJson)/s.test(bodyToInspect);
  const helperAutoSaveCall = /\b(?:saveAssistantRecord|createAssistantRecord|persistAssistantRecord)\s*\(/.test(bodyToInspect);
  const hasRecordPost = recordsEndpointPost || helperAutoSaveCall;

  addCheck(
    "no automatic assistant record POST in normal generate click flow",
    !hasRecordPost,
    hasRecordPost
      ? "normal generate flow still appears to POST /api/assistant/records"
      : "normal generate flow has no direct /api/assistant/records POST anchor",
  );
}

function checkNoServerGenerateAutoSave() {
  const filePath = appPath("src/use-cases/task-review-service.ts");
  const content = stripComments(readRequiredFile(filePath));
  if (!content) {
    addCheck("no server-side auto-save in task review generate path", false, "task-review-service.ts missing");
    return;
  }

  const orchestratorBody = extractFunctionBody(content, "reviewTaskWithServerOrchestrator");
  const generateBranch = extractIfBlockContaining(orchestratorBody, '(input.mode ?? "preview") === "generate"') ||
    extractIfBlockContaining(orchestratorBody, "mode === \"generate\"") ||
    extractIfBlockContaining(orchestratorBody, "mode === 'generate'");
  if (!generateBranch) {
    addCheck("no server-side auto-save in task review generate path", false, "could not locate task review generate branch");
    return;
  }
  const suspiciousAutoSave = /saveGeneratedTaskReviewRecord\s*\(/.test(generateBranch) ||
    /assistantRepository\.createRecord\s*\(/.test(generateBranch) ||
    /savedByOrchestrator\s*:\s*true/.test(generateBranch);

  addCheck(
    "no server-side auto-save in task review generate path",
    !suspiciousAutoSave,
    suspiciousAutoSave
      ? "generate path still contains saveGeneratedTaskReviewRecord or savedByOrchestrator"
      : "generate path has no server-side auto-save anchor",
  );
}

function checkReviewSessionRoutes() {
  const base = appPath("src/app/api/assistant/review-sessions");
  const requiredFiles = [
    join(base, "route.ts"),
    join(base, "[sessionId]", "route.ts"),
  ];
  const missing = requiredFiles.filter((filePath) => !existsSync(filePath));
  addCheck(
    "review session routes",
    missing.length === 0,
    missing.length === 0
      ? "review session route files exist"
      : `missing route file(s): ${missing.map((filePath) => filePath.replace(repoRoot, "")).join(", ")}`,
  );
}

function checkTemporaryReviewAutoSaveContract() {
  const servicePath = appPath("src/use-cases/task-review-service.ts");
  const typePath = appPath("src/domains/assistant/types.ts");
  const serviceContent = stripComments(readRequiredFile(servicePath));
  const typeContent = stripComments(readRequiredFile(typePath));
  const saveRecordBody = extractFunctionBody(serviceContent, "saveTaskReviewSessionRecord");
  const listBody = extractFunctionBody(serviceContent, "listTaskReviewSessions");
  const summaryBody = extractFunctionBody(serviceContent, "toTaskReviewSessionSummary");
  const activePredicateBody = extractFunctionBody(serviceContent, "isSavedTaskReviewRecord");
  const includingDeletedBody = extractFunctionBody(serviceContent, "isSavedTaskReviewRecordIncludingDeleted");

  const hasTemporaryMetadata = /savedBy\s*:\s*["'`]auto["'`]/.test(saveRecordBody) &&
    /reviewRecordKind\s*:\s*["'`]temporary["'`]/.test(saveRecordBody);
  const activePredicateAcceptsTemporary = /savedBy\s*===\s*["'`]auto["'`]/.test(activePredicateBody) &&
    /savedBy\s*===\s*["'`]user["'`]/.test(activePredicateBody) &&
    /!record\.reviewDeletedAt/.test(activePredicateBody);
  const includingDeletedLookupAcceptsTemporary = serviceContent.includes("findSavedTaskReviewRecordIncludingDeleted") &&
    /savedBy\s*===\s*["'`]auto["'`]/.test(includingDeletedBody) &&
    /savedBy\s*===\s*["'`]user["'`]/.test(includingDeletedBody) &&
    !/!record\.reviewDeletedAt/.test(includingDeletedBody);
  const limitsNewestSix = /\.slice\(0,\s*6\)/.test(listBody);
  const exposesProjectWikiState = typeContent.includes("ProjectWikiReviewState") &&
    typeContent.includes("projectWikiState?: ProjectWikiReviewState") &&
    typeContent.includes("registrationState") &&
    summaryBody.includes("projectWikiState") &&
    summaryBody.includes("taskReview?.projectWikiState ?? defaultProjectWikiReviewState()") &&
    summaryBody.includes("defaultProjectWikiReviewState");

  addCheck(
    "temporary review auto-save service contract",
    hasTemporaryMetadata && activePredicateAcceptsTemporary && includingDeletedLookupAcceptsTemporary && limitsNewestSix && exposesProjectWikiState,
    hasTemporaryMetadata && activePredicateAcceptsTemporary && includingDeletedLookupAcceptsTemporary && limitsNewestSix && exposesProjectWikiState
      ? "temporary records use auto metadata, active lists exclude deleted records, including-deleted lookup exists, newest six are returned, and projectWikiState is exposed"
      : "missing temporary auto-save metadata, deleted-record filtering, including-deleted lookup, newest-six limit, or projectWikiState summary field",
  );
}

function checkReviewSessionDeleteRestoreContract() {
  const contractPath = appPath("src/repositories/assistant/contracts.ts");
  const postgresPath = appPath("src/repositories/assistant/postgres-store.ts");
  const localPath = appPath("src/repositories/assistant/local-store.ts");
  const indexPath = appPath("src/repositories/assistant/index.ts");
  const servicePath = appPath("src/use-cases/task-review-service.ts");
  const routePath = appPath("src/app/api/assistant/review-sessions/[sessionId]/route.ts");
  const restoreRoutePath = appPath("src/app/api/assistant/review-sessions/[sessionId]/restore/route.ts");
  const contractContent = stripComments(readRequiredFile(contractPath));
  const postgresContent = stripComments(readRequiredFile(postgresPath));
  const localContent = stripComments(readRequiredFile(localPath));
  const indexContent = stripComments(readRequiredFile(indexPath));
  const serviceContent = stripComments(readRequiredFile(servicePath));
  const routeContent = stripComments(readRequiredFile(routePath));
  const restoreRouteContent = stripComments(readOptionalFile(restoreRoutePath));

  const repositoryFiles = [contractContent, postgresContent, localContent, indexContent];
  const repositoryMethodsExist = repositoryFiles.every((content) =>
    ["softDeleteReviewSession", "restoreReviewSession", "updateReviewSessionProjectWikiState"].every((methodName) =>
      content.includes(methodName),
    ),
  );
  const updateProjectWikiBodies = [
    sourceWindowAround(postgresContent, "async updateReviewSessionProjectWikiState", 200, 1600),
    sourceWindowAround(localContent, "async updateReviewSessionProjectWikiState", 200, 1600),
  ];
  const mergeHelperBodies = [
    extractFunctionBody(postgresContent, "mergeReviewSessionProjectWikiState"),
    extractFunctionBody(localContent, "mergeReviewSessionProjectWikiState"),
  ];
  const narrowProjectWikiStateMethod = contractContent.includes("ProjectWikiReviewState") &&
    /updateReviewSessionProjectWikiState\s*\(\s*input\s*:\s*\{[\s\S]*projectWikiState\s*:\s*ProjectWikiReviewState[\s\S]*\}/.test(contractContent) &&
    !contractContent.includes("updateReviewSessionMetadata");
  const mergeSafeProjectWikiStateUpdate = updateProjectWikiBodies.every((body) =>
    body.includes("input.recordId") &&
    body.includes("input.projectId") &&
    body.includes("mergeReviewSessionProjectWikiState") &&
    body.includes("input.projectWikiState"),
  ) &&
    mergeHelperBodies.every((body) =>
      body.includes('taskReview?.source !== "assistant-task-review"') &&
      body.includes("...metadata") &&
      body.includes("...taskReview") &&
      body.includes("projectWikiState"),
    );
  const noWholeObjectMetadataReplacement = !repositoryFiles.some((content) => content.includes("updateReviewSessionMetadata")) &&
    !updateProjectWikiBodies.some((content) =>
      /metadata\s*:\s*input\.metadata/.test(content) ||
      /metadata\s*:\s*toInputJson\(input\.metadata\)/.test(content),
    );
  const postgresScopesUpdates = /reviewDeletedAt\s*:\s*new Date\(\)/.test(postgresContent) &&
    /reviewDeletedBy\s*:\s*input\.profileId/.test(postgresContent) &&
    /reviewDeletedAt\s*:\s*null/.test(postgresContent) &&
    /reviewRestoredAt\s*:\s*new Date\(\)/.test(postgresContent) &&
    /id\s*:\s*input\.recordId/.test(postgresContent) &&
    /projectId\s*:\s*input\.projectId/.test(postgresContent);
  const serviceMethodsExist = serviceContent.includes("export async function deleteTaskReviewSession") &&
    serviceContent.includes("export async function restoreTaskReviewSession") &&
    serviceContent.includes("assistantRepository.softDeleteReviewSession") &&
    serviceContent.includes("assistantRepository.restoreReviewSession");
  const deleteRouteExists = /export\s+async\s+function\s+DELETE/.test(routeContent) &&
    routeContent.includes("assertRequestIntegrity(request)") &&
    routeContent.includes("requireCurrentProjectEditor(user)") &&
    routeContent.includes("deleteTaskReviewSession(sessionId, user)");
  const restoreRouteExists = existsSync(restoreRoutePath) &&
    /export\s+async\s+function\s+POST/.test(restoreRouteContent) &&
    restoreRouteContent.includes("assertRequestIntegrity(request)") &&
    restoreRouteContent.includes("requireCurrentProjectEditor(user)") &&
    restoreRouteContent.includes("restoreTaskReviewSession(sessionId, user)");

  addCheck(
    "review session delete and restore API contract",
    repositoryMethodsExist &&
      narrowProjectWikiStateMethod &&
      mergeSafeProjectWikiStateUpdate &&
      noWholeObjectMetadataReplacement &&
      postgresScopesUpdates &&
      serviceMethodsExist &&
      deleteRouteExists &&
      restoreRouteExists,
    repositoryMethodsExist &&
      narrowProjectWikiStateMethod &&
      mergeSafeProjectWikiStateUpdate &&
      noWholeObjectMetadataReplacement &&
      postgresScopesUpdates &&
      serviceMethodsExist &&
      deleteRouteExists &&
      restoreRouteExists
      ? "repository methods, narrow merge-safe projectWikiState update, scoped store updates, service methods, DELETE route, and restore route exist"
      : "missing repository soft-delete/restore/projectWikiState methods, narrow merge-safe metadata update, scoped update fields, service methods, DELETE route, or restore route",
  );
}

function checkTemporaryReviewUiCopyReadiness() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const servicePath = appPath("src/use-cases/task-review-service.ts");
  const routePath = appPath("src/app/api/assistant/review-sessions/[sessionId]/route.ts");
  const restoreRoutePath = appPath("src/app/api/assistant/review-sessions/[sessionId]/restore/route.ts");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const serviceContent = stripComments(readRequiredFile(servicePath));
  const routeContent = stripComments(readRequiredFile(routePath));
  const restoreRouteContent = stripComments(readOptionalFile(restoreRoutePath));
  const requiredTemporaryCopy = [
    "임시 검토 기록",
    "임시 기록 자동저장됨",
    "저장 실패 · 다시 시도",
  ];
  const hasTemporaryCopy = requiredTemporaryCopy.every((anchor) => panelContent.includes(anchor));
  const manualPrimaryRemoved = !panelContent.includes("검토기록저장");
  const task2ApiReady = /savedBy\s*:\s*["'`]auto["'`]/.test(serviceContent) &&
    /reviewRecordKind\s*:\s*["'`]temporary["'`]/.test(serviceContent) &&
    /export\s+async\s+function\s+DELETE/.test(routeContent) &&
    /export\s+async\s+function\s+POST/.test(restoreRouteContent);

  addCheck(
    "temporary review UI copy and manual save removal readiness",
    (manualPrimaryRemoved && hasTemporaryCopy) || (!manualPrimaryRemoved && task2ApiReady),
    manualPrimaryRemoved && hasTemporaryCopy
      ? "temporary review copy exists and manual primary save action is removed"
      : !manualPrimaryRemoved && task2ApiReady
        ? "manual 검토기록저장 UI remains for Task 5, but temporary auto-save API anchors are ready"
        : "missing temporary UI copy anchors, manual save removal, or Task 2 temporary API readiness anchors",
  );
}

function checkTaskAssistantAutoSaveProjectWikiUx() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const workspacePath = appPath("src/components/tasks/task-workspace.tsx");
  const previewPath = appPath("src/app/preview/assistant/preview-client.tsx");
  const cssPath = appPath("src/app/globals.css");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const workspaceContent = stripComments(readRequiredFile(workspacePath));
  const previewContent = stripComments(readRequiredFile(previewPath));
  const cssContent = stripComments(readRequiredFile(cssPath));

  const hasAutoSaveStateMachine = panelContent.includes("type AutoSaveState") &&
    panelContent.includes('status: "saving"') &&
    panelContent.includes('status: "saved"; sessionId: string') &&
    panelContent.includes("retryPayload: SaveReviewSessionPayload") &&
    panelContent.includes("autoSaveLabel") &&
    panelContent.includes("autoSaveReviewSession") &&
    panelContent.includes("retryAutoSaveReviewSession");
  const autoSaveTriggeredAfterGenerate = sourceWindowAroundContains(panelContent, "setOutput(generatedOutput)", [
      "buildSaveReviewSessionPayload",
      "autoSaveReviewSession",
    ], 0, 900) &&
    sourceWindowAroundContains(panelContent, "setOutput(generated);", [
      "buildSaveReviewSessionPayload",
      "autoSaveReviewSession",
    ], 0, 900);
  const manualPrimaryRemoved = !panelContent.includes("검토기록저장") &&
    !panelContent.includes("saveReviewSession") &&
    !panelContent.includes("canSaveReviewSession");
  const hasDeleteUndo = panelContent.includes("임시 검토 기록 삭제") &&
    panelContent.includes('method: "DELETE"') &&
    panelContent.includes('"x-architect-request-intent": "mutate"') &&
    panelContent.includes("showUndoToast") &&
    panelContent.includes("되돌리기") &&
    panelContent.includes("/restore");
  const hasProjectWikiPreviewRegister = panelContent.includes("type ProjectWikiPreviewState") &&
    panelContent.includes("ProjectWikiRegistrationPreview") &&
    panelContent.includes("ProjectWikiItem") &&
    panelContent.includes("/project-wiki/registration-preview") &&
    panelContent.includes("프로젝트wiki로 등록") &&
    panelContent.includes("프로젝트wiki 등록 취소") &&
    panelContent.includes("프로젝트wiki 등록 재시도") &&
    panelContent.includes("canRetryProjectWikiRegistration") &&
    panelContent.includes("보완 메모 추가") &&
    panelContent.includes("프로젝트wiki로 즉시 등록되고, 공용wiki 후보 검토에도 올라갑니다.") &&
    panelContent.includes("commonizationCaution") &&
    panelContent.includes("commonCandidateRecordId") &&
    panelContent.includes('state === "recommended" || state === "caution"');
  const hasHistoryStatusChips = panelContent.includes("작업기록 승인됨") &&
    panelContent.includes("프로젝트wiki 등록됨") &&
    panelContent.includes("savedRecord.cleanupState") &&
    panelContent.includes("projectWikiState?.registrationState");
  const historyIndex = panelContent.indexOf('aria-label="임시 검토 기록: 생성 후 자동저장된 최근 임시 검토 기록입니다."');
  const advancedIndex = panelContent.indexOf('{assistantPanelMode === "advanced" ? (');
  const hasBasicHistoryAccess = historyIndex >= 0 && advancedIndex >= 0 && historyIndex < advancedIndex;
  const hasReviewSessionRestore = panelContent.includes("restoreReviewSessionToActiveFlow") &&
    panelContent.includes("buildReviewSessionRetrieval") &&
    panelContent.includes("openReviewSessionById") &&
    panelContent.includes("includeSessionId") &&
    panelContent.includes("includeWorkSummaryDraftId") &&
    panelContent.includes("initialReviewSessionId") &&
    panelContent.includes("initialWorkSummaryDraftId") &&
    panelContent.includes("프로젝트 WIKI 열기") &&
    panelContent.includes("공용wiki 후보 열기") &&
    workspaceContent.includes("assistantReviewSessionId") &&
    workspaceContent.includes("initialWorkSummaryDraftId={focusWorkSummaryDraftId}");
  const previewMocksUpdated = [
    "/api/assistant/review-sessions",
    "registration-preview",
    "project-wiki",
    "restore",
    'requestMethod(init) === "DELETE"',
    "deletedReviewSessions",
    "createProjectWikiItem",
  ].every((anchor) => previewContent.includes(anchor));
  const cssUpdated = /\.task-assistant__actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(cssContent) &&
    cssContent.includes(".task-assistant__autosave-badge") &&
    cssContent.includes(".task-assistant__project-wiki-badge") &&
    cssContent.includes(".task-assistant__toast") &&
    cssContent.includes(".task-assistant__icon-button") &&
    cssContent.includes(".task-assistant__subtle-link");

  addCheck(
    "task assistant auto-save, delete undo, and project WIKI UX",
    hasAutoSaveStateMachine &&
      autoSaveTriggeredAfterGenerate &&
      manualPrimaryRemoved &&
      hasDeleteUndo &&
      hasProjectWikiPreviewRegister &&
      hasHistoryStatusChips &&
      hasBasicHistoryAccess &&
      hasReviewSessionRestore &&
      previewMocksUpdated &&
      cssUpdated,
    hasAutoSaveStateMachine &&
      autoSaveTriggeredAfterGenerate &&
      manualPrimaryRemoved &&
      hasDeleteUndo &&
      hasProjectWikiPreviewRegister &&
      hasHistoryStatusChips &&
      hasBasicHistoryAccess &&
      hasReviewSessionRestore &&
      previewMocksUpdated &&
      cssUpdated
      ? "Task 5 UI anchors exist for auto-save, retry, delete/restore undo, basic temporary history, project WIKI preview/register, preview mocks, and compact styling"
      : "missing Task 5 auto-save, retry, delete/restore undo, basic temporary history, project WIKI preview/register, preview mock, history chip, or CSS anchor",
  );
}

function checkReviewSessionExecutionModePersistence() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const routePath = appPath("src/app/api/assistant/review-sessions/route.ts");
  const servicePath = appPath("src/use-cases/task-review-service.ts");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const routeContent = stripComments(readRequiredFile(routePath));
  const serviceContent = stripComments(readRequiredFile(servicePath));
  const saveReviewSessionBody = [
    extractFunctionBody(panelContent, "buildSaveReviewSessionPayload"),
    extractFunctionBody(panelContent, "autoSaveReviewSession"),
    extractFunctionBody(panelContent, "toSaveReviewSessionRequestBody"),
  ].join("\n");
  const localCodexGenerateBody = extractFunctionBody(panelContent, "generateLocalCodexReview");
  const saveRecordBody = extractFunctionBody(serviceContent, "saveTaskReviewSessionRecord");

  const clientSendsMode = (
    /executionMode\s*:\s*(?:input\.)?output\.executionMode/.test(saveReviewSessionBody) ||
    /executionMode\s*:\s*payload\.executionMode/.test(saveReviewSessionBody)
  ) && (
    /runtimeMode\s*:\s*(?:input\.)?output\.runtimeMode/.test(saveReviewSessionBody) ||
    /runtimeMode\s*:\s*payload\.runtimeMode/.test(saveReviewSessionBody)
  );
  const localOutputHasMode = /executionMode\s*:\s*["'`]local-chatgpt-codex["'`]/.test(localCodexGenerateBody) &&
    /runtimeMode\s*:\s*["'`]extension-native-bridge-in-page["'`]/.test(localCodexGenerateBody);
  const routeAcceptsMode = /isAssistantExecutionMode\(rawBody\.executionMode\)/.test(routeContent) &&
    /runtimeMode:\s*rawBody\.runtimeMode/.test(routeContent);
  const servicePersistsMode = /normalizeTaskReviewSessionExecutionMode/.test(serviceContent) &&
    /normalizeTaskReviewSessionRuntimeMode/.test(serviceContent) &&
    /assistantRepository\.createRecord\(\{[\s\S]*\bexecutionMode,[\s\S]*\bruntimeMode,/.test(saveRecordBody);

  addCheck(
    "review-session save preserves Local Codex execution and runtime modes",
    clientSendsMode && localOutputHasMode && routeAcceptsMode && servicePersistsMode,
    clientSendsMode && localOutputHasMode && routeAcceptsMode && servicePersistsMode
      ? "save payload, route parser, and service persistence preserve Local Codex mode"
      : "missing Local Codex execution/runtime mode preservation in panel, route, or service",
  );
}

function checkTaskAssistantBasicAdvancedMode() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const cssPath = appPath("src/app/globals.css");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const cssContent = stripComments(readRequiredFile(cssPath));
  const requiredAdvancedLabels = [
    "임시 검토 기록",
    "파일 근거",
    "외부 웹/스킬 근거",
    "실행 모드",
    "로컬 Codex 로그인",
    "기본 검토지침",
  ];
  const hasModeState = panelContent.includes("assistantPanelMode") &&
    panelContent.includes('"basic" | "advanced"') &&
    panelContent.includes('setAssistantPanelMode("basic")') &&
    panelContent.includes('setAssistantPanelMode("advanced")');
  const hasModeButtons = panelContent.includes("기본 모드") &&
    panelContent.includes("고급 모드") &&
    panelContent.includes('aria-label="AI 검토 표시 모드"');
  const hasAdvancedWrapper = panelContent.includes('assistantPanelMode === "advanced"') &&
    panelContent.includes('className="task-assistant__advanced"');
  const hasAdvancedLabels = requiredAdvancedLabels.every((label) => panelContent.includes(label));
  const hasColoredAdvancedCss = /\.task-assistant__advanced\s*\{[\s\S]*background:\s*rgba\(44,\s*94,\s*98,\s*0\.1\)/.test(cssContent) &&
    /\.task-assistant__mode-button--advanced\.task-assistant__mode-button--active\s*\{[\s\S]*background:\s*rgba\(44,\s*94,\s*98,\s*0\.16\)/.test(cssContent);
  const hasCompactActionGridCss = /\.task-assistant__panel\s*\{[\s\S]*width:\s*min\(30rem,\s*calc\(100vw - 2rem\)\)/.test(cssContent) &&
    /\.task-assistant__actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(cssContent) &&
    /\.task-assistant__actions\s+\.primary-button,[\s\S]*\.task-assistant__actions\s+\.secondary-button\s*\{[\s\S]*height:\s*2\.36rem[\s\S]*font-size:\s*0\.75rem[\s\S]*white-space:\s*normal/.test(cssContent);
  const removedDeferredSummaryAction = !panelContent.includes("보류 저장") &&
    !panelContent.includes('saveSummary("deferred")') &&
    !panelContent.includes("canDeferSummary");
  const advancedHoverHintAnchors = [
    'data-hint="생성 후 자동저장된 최근 임시 검토 기록입니다."',
    'data-hint="파일 분석, OCR, 이미지 영역 근거는 필요할 때만 열어 추가합니다."',
    'data-hint="일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다."',
    'data-hint="로컬 연결 세부 상태는 필요할 때만 펼쳐 확인합니다."',
    'data-hint="답변 기준은 서비스 기본 검토지침을 사용하며, 사용자는 질문만 조정합니다."',
  ];
  const removedAlwaysVisibleAdvancedHints = [
    '<p className="task-assistant__hint">생성 후 자동저장된 최근 임시 검토 기록입니다.</p>',
    '<p className="task-assistant__hint">파일 분석, OCR, 이미지 영역 근거는 필요할 때만 열어 추가합니다.</p>',
    '<p className="task-assistant__hint">일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다.</p>',
    '<p className="task-assistant__hint">로컬 연결 세부 상태는 필요할 때만 펼쳐 확인합니다.</p>',
    '<p className="task-assistant__hint">답변 기준은 서비스 기본 검토지침을 사용하며, 사용자는 질문만 조정합니다.</p>',
  ];
  const removedNativeAdvancedTitles = [
    'title="생성 후 자동저장된 최근 임시 검토 기록입니다."',
    'title="파일 분석, OCR, 이미지 영역 근거는 필요할 때만 열어 추가합니다."',
    'title="일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다."',
    'title="로컬 연결 세부 상태는 필요할 때만 펼쳐 확인합니다."',
    'title="답변 기준은 서비스 기본 검토지침을 사용하며, 사용자는 질문만 조정합니다."',
  ];
  const hasAdvancedHoverHints = advancedHoverHintAnchors.every((anchor) => panelContent.includes(anchor)) &&
    removedAlwaysVisibleAdvancedHints.every((anchor) => !panelContent.includes(anchor)) &&
    removedNativeAdvancedTitles.every((anchor) => !panelContent.includes(anchor)) &&
    !/title=\{\s*assistantPolicy\?\.enabled/.test(panelContent) &&
    panelContent.includes('aria-label="임시 검토 기록: 생성 후 자동저장된 최근 임시 검토 기록입니다."') &&
    !panelContent.includes("최근 검토 기록") &&
    /\.task-assistant__advanced\s+\.task-assistant__section-header\[data-hint\]::after\s*\{[\s\S]*content:\s*attr\(data-hint\)[\s\S]*opacity:\s*0[\s\S]*visibility:\s*hidden/.test(cssContent) &&
    /\.task-assistant__advanced\s+\.task-assistant__section-header\[data-hint\]:hover::after,[\s\S]*\.task-assistant__advanced\s+\.task-assistant__section-header\[data-hint\]:focus-visible::after,[\s\S]*\.task-assistant__advanced\s+\.task-assistant__section-header\[data-hint\]:focus-within::after\s*\{[\s\S]*opacity:\s*1[\s\S]*visibility:\s*visible/.test(cssContent);

  addCheck(
    "task assistant basic/advanced mode grouping",
    hasModeState && hasModeButtons && hasAdvancedWrapper && hasAdvancedLabels && hasColoredAdvancedCss && hasCompactActionGridCss && hasAdvancedHoverHints && removedDeferredSummaryAction,
    hasModeState && hasModeButtons && hasAdvancedWrapper && hasAdvancedLabels && hasColoredAdvancedCss && hasCompactActionGridCss && hasAdvancedHoverHints && removedDeferredSummaryAction
      ? "basic/advanced mode controls, colored advanced grouping, compact two-action row anchors, advanced title hover hints, and no deferred summary action exist"
      : "missing basic/advanced mode state, controls, requested advanced labels, non-white advanced styling, compact two-action row styling, advanced title hover hints, or deferred-summary removal",
  );
}

function checkTaskAssistantChromeSidePanelBridge() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const cssPath = appPath("src/app/globals.css");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const cssContent = stripComments(readRequiredFile(cssPath));
  const contextBuilderBody = extractFunctionBody(panelContent, "buildSidePanelContextSnapshot");
  const pageContextBody = extractFunctionBody(panelContent, "readSidePanelPageContext");
  const dispatchContextUpdateBody = extractFunctionBody(panelContent, "dispatchSidePanelContextUpdate");
  const dispatchContextUpdatedBody = extractFunctionBody(panelContent, "dispatchSidePanelContextUpdated");
  const openSidePanelBody = extractFunctionBody(panelContent, "openExtensionSidePanel");
  const selectionChangeSource = sourceWindowAround(panelContent, 'reason: "selection-change"', 700, 700);
  const questionChangeSource = sourceWindowAround(panelContent, 'dispatchSidePanelContextUpdate("question-change")', 900, 900);
  const modeChangeSource = sourceWindowAround(panelContent, 'dispatchSidePanelContextUpdate("mode-change")', 700, 700);
  const sidePanelContextSource = [
    contextBuilderBody,
    pageContextBody,
    dispatchContextUpdateBody,
    dispatchContextUpdatedBody,
    selectionChangeSource,
    questionChangeSource,
    modeChangeSource,
    openSidePanelBody,
  ].join("\n");
  const hasSidePanelRequest = panelContent.includes('"architect:page-side-panel-response"') &&
    panelContent.includes("data-architect-side-panel-launch") &&
    panelContent.includes("data-architect-side-panel-request-id") &&
    panelContent.includes("waitForAssistantSidePanelResponse") &&
    panelContent.includes("makeSidePanelRequestId") &&
    panelContent.includes("openExtensionSidePanel");
  const keepsSaasFallback = panelContent.includes("현재 SaaS 패널은 그대로 사용할 수 있습니다.") &&
    panelContent.includes("Architect Browser Assistant 확장 패널 응답이 없습니다") &&
    panelContent.includes("extension_context_invalidated") &&
    panelContent.includes("scheduleSidePanelPageRefresh") &&
    panelContent.includes("window.location.reload");
  const hasHeaderButton = panelContent.includes("task-assistant__side-panel-button") &&
    panelContent.includes("오른쪽 패널") &&
    panelContent.includes("sidePanelOpening");
  const hasScopedCss = /\.task-assistant__header-actions\s*\{[\s\S]*display:\s*inline-flex/.test(cssContent) &&
    /\.task-assistant__side-panel-button\s*\{[\s\S]*border-radius:\s*999px/.test(cssContent);
  const hasContextUpdatedEvent = panelContent.includes('SIDE_PANEL_CONTEXT_UPDATED_EVENT = "architect:side-panel-context-updated"') &&
    panelContent.includes("buildSidePanelContextSnapshot") &&
    panelContent.includes("dispatchSidePanelContextUpdated") &&
    panelContent.includes("SIDE_PANEL_CONTEXT_QUESTION_DEBOUNCE_MS = 300");
  const dispatchesContextCustomEvent = panelContent.includes("new CustomEvent(SIDE_PANEL_CONTEXT_UPDATED_EVENT");
  const hasLiveContextReasons = sourceWindowAroundContains(panelContent, 'reason: "selection-change"', [
    "dispatchSidePanelContextUpdated(",
    "buildSidePanelContextSnapshot({",
  ]) &&
    sourceWindowAroundContains(panelContent, 'dispatchSidePanelContextUpdate("question-change")', [
      "window.setTimeout",
      "SIDE_PANEL_CONTEXT_QUESTION_DEBOUNCE_MS",
      "scheduledTaskId",
    ], 700, 700) &&
    sourceWindowAroundContains(panelContent, 'dispatchSidePanelContextUpdate("mode-change")', [
      "nextModeKey",
    ]) &&
    openSidePanelBody.includes('dispatchSidePanelContextUpdate("launch")');
  const hasOnlySaasEmittedReasons = !panelContent.includes("health-refresh");
  const hasSafeContextBuilderFields = [
    "taskId",
    "projectId",
    "displayId",
    "title",
    "status",
    "question",
    "executionMode",
    "assistantMode",
    "page",
    "reason",
    "selectedAt",
    "source",
  ].every((anchor) => contextBuilderBody.includes(anchor));
  const alwaysEmitsQuestionString = contextBuilderBody.includes("const question = sanitizeSidePanelContextText(input.question) ??") &&
    contextBuilderBody.includes("question,") &&
    !contextBuilderBody.includes("...(question ? { question } : {})");
  const builderUsesPageContextHelper = contextBuilderBody.includes("page: readSidePanelPageContext()");
  const hasScrubbedPageContext = Boolean(pageContextBody) &&
    pageContextBody.includes("window.location.origin") &&
    pageContextBody.includes("window.location.pathname") &&
    !pageContextBody.includes("window.location.href") &&
    !pageContextBody.includes("window.location.search") &&
    !pageContextBody.includes("window.location.hash") &&
    !pageContextBody.includes("search:") &&
    !pageContextBody.includes("hash:");
  const forbiddenContextBuilderAnchors = [
    "cookie",
    "localStorage",
    "sessionStorage",
    "access_token",
    "projectContextChunks",
    "evidenceReadinessWarnings",
    "localCodexTranscript",
    "window.location.href",
    "window.location.search",
    "window.location.hash",
  ];
  const keepsContextBuilderUiSafe = Boolean(sidePanelContextSource) &&
    forbiddenContextBuilderAnchors.every((anchor) => !sidePanelContextSource.includes(anchor)) &&
    !sidePanelContextSource.includes("search:") &&
    !sidePanelContextSource.includes("hash:");

  addCheck(
    "task assistant Chrome side panel bridge keeps SaaS fallback and live context sync",
    hasSidePanelRequest &&
      keepsSaasFallback &&
      hasHeaderButton &&
      hasScopedCss &&
      hasContextUpdatedEvent &&
      dispatchesContextCustomEvent &&
      hasLiveContextReasons &&
      hasOnlySaasEmittedReasons &&
      hasSafeContextBuilderFields &&
      alwaysEmitsQuestionString &&
      builderUsesPageContextHelper &&
      hasScrubbedPageContext &&
      keepsContextBuilderUiSafe,
    hasSidePanelRequest &&
      keepsSaasFallback &&
      hasHeaderButton &&
      hasScopedCss &&
      hasContextUpdatedEvent &&
      dispatchesContextCustomEvent &&
      hasLiveContextReasons &&
      hasOnlySaasEmittedReasons &&
      hasSafeContextBuilderFields &&
      alwaysEmitsQuestionString &&
      builderUsesPageContextHelper &&
      hasScrubbedPageContext &&
      keepsContextBuilderUiSafe
      ? "SaaS panel exposes side-panel launch plus UI-safe task context events for actual launch, selection, question, and mode sync"
      : "missing side-panel launch bridge, fallback, scoped button styling, context event dispatch, actual live sync reason dispatch, SaaS-only reasons, always-emitted question, builder page helper use, scrubbed page URL, safe builder fields, or combined forbidden-source guardrail",
  );
}

function checkTaskAssistantEvidenceUiDisclosure() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const hidesEvidenceMetadata = !panelContent.includes("externalSourceTypeLabel(item.sourceType)") &&
    !panelContent.includes("evidenceKindLabel(item.kind)} / 우선순위") &&
    !panelContent.includes("<p>{item.excerpt}</p>");
  const keepsEvidenceTitleAndSourceLink = panelContent.includes("<strong>{item.title}</strong>") &&
    panelContent.includes("출처 열기") &&
    panelContent.includes("item.sourceUrl");
  const hasCollapsedEvidenceSection = panelContent.includes("evidenceExpanded") &&
    panelContent.includes("setEvidenceExpanded(false)") &&
    panelContent.includes("aria-expanded={evidenceExpanded}") &&
    panelContent.includes("setEvidenceExpanded((current) => !current)") &&
    panelContent.includes("근거 세부 항목은 필요할 때만 펼쳐 확인합니다.");

  addCheck(
    "task assistant evidence UI hides system-only details",
    hidesEvidenceMetadata && keepsEvidenceTitleAndSourceLink && hasCollapsedEvidenceSection,
    hidesEvidenceMetadata && keepsEvidenceTitleAndSourceLink && hasCollapsedEvidenceSection
      ? "evidence cards keep title/source link visible and default the evidence detail section closed"
      : "evidence cards must hide kind, priority, and excerpt details while preserving title/source link rendering and a default-closed evidence section",
  );
}

function checkTaskAssistantVisibleAnswerUx() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const formatterBody = extractFunctionBody(panelContent, "formatVisibleReviewAnswer");
  const hidesInstructionAndEvidence = panelContent.includes("HIDDEN_REVIEW_ANSWER_LINE_PREFIXES") &&
    panelContent.includes('"사용자 지침:"') &&
    panelContent.includes('"주요 근거:"') &&
    panelContent.includes("isExplicitUserFacingReviewBlock") &&
    panelContent.includes("extractVisibleReviewAnswerMarkdownSections");
  const keepsGeneratedAnswerRawForSave = panelContent.includes("answer: input.output.answer") &&
    panelContent.includes("answer: payload.answer");
  const formatsCurrentAndSavedAnswer = panelContent.includes("<p>{formatVisibleReviewAnswer(output.answer)}</p>") &&
    panelContent.includes("<p>{formatVisibleReviewAnswer(selectedReviewSession.answer)}</p>");
  const noRawAnswerRendering = !panelContent.includes("<p>{output.answer}</p>") &&
    !panelContent.includes("<p>{selectedReviewSession.answer}</p>");
  const keepsExplicitOpinionAndFollowUp = formatterBody.includes("isExplicitUserFacingReviewBlock") &&
    panelContent.includes("의견:") &&
    panelContent.includes("후속 조치:");

  addCheck(
    "task assistant visible answer hides generation metadata",
    hidesInstructionAndEvidence &&
      keepsGeneratedAnswerRawForSave &&
      formatsCurrentAndSavedAnswer &&
      noRawAnswerRendering &&
      keepsExplicitOpinionAndFollowUp,
    hidesInstructionAndEvidence &&
      keepsGeneratedAnswerRawForSave &&
      formatsCurrentAndSavedAnswer &&
      noRawAnswerRendering &&
      keepsExplicitOpinionAndFollowUp
      ? "visible answer uses a display formatter that hides instruction/evidence metadata while preserving raw saved answer payloads"
      : "visible answer must format current and saved answers, hide user-instruction/evidence metadata, keep opinion/follow-up blocks, and preserve raw save payloads",
  );
}

function checkTaskAssistantSummaryEditorCollapsedUx() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const cssPath = appPath("src/app/globals.css");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const cssContent = stripComments(readRequiredFile(cssPath));
  const hasCollapsedState = hasCollapsedUseStateDefault(panelContent, "summaryEditorExpanded") &&
    panelContent.includes("setSummaryEditorExpanded(false)") &&
    panelContent.includes("aria-expanded={summaryEditorExpanded}");
  const hasUserOpenActions = panelContent.includes("작업 기록 승인 준비") &&
    panelContent.includes("요약 수정") &&
    panelContent.includes("요약 접기") &&
    panelContent.includes("setSummaryEditorExpanded((current) => !current)");
  const gatesEditorFields = panelContent.includes("summaryEditorExpanded ? (") &&
    panelContent.includes("task-assistant__summary-preview") &&
    panelContent.includes("승인용 입력은 접혀 있습니다");
  const keepsApprovalFields = ["결론", "태그", "적용 범위", "후속 조치"].every((label) => panelContent.includes(label));
  const hasCollapsedSummaryCss = /\.task-assistant__summary-actions\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*justify-content:\s*flex-end/.test(cssContent) &&
    /\.task-assistant__summary-preview\s*\{[\s\S]*background:\s*var\(--theme-surface-field\)/.test(cssContent);

  addCheck(
    "task assistant summary editor is collapsed by default",
    hasCollapsedState && hasUserOpenActions && gatesEditorFields && keepsApprovalFields && hasCollapsedSummaryCss,
    hasCollapsedState && hasUserOpenActions && gatesEditorFields && keepsApprovalFields && hasCollapsedSummaryCss
      ? "summary approval fields are hidden until the user opens approval preparation or summary editing"
      : "summary approval fields must default closed, expose open/edit/collapse actions, preserve approval fields, and include collapsed summary styling",
  );
}

function checkTaskAssistantClosureDetailHover() {
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const cssPath = appPath("src/app/globals.css");
  const panelContent = stripComments(readRequiredFile(panelPath));
  const cssContent = stripComments(readRequiredFile(cssPath));
  const hasFocusableClosureCards = panelContent.includes("task-assistant__closure-item task-assistant__closure-item--${item.status}") &&
    panelContent.includes("tabIndex={0}") &&
    panelContent.includes("aria-label={`${item.label}: ${item.detail}`}") &&
    !panelContent.includes("title={item.detail}");
  const keepsClosureGateSystemOnly = panelContent.includes("visibleClosureGate") &&
    panelContent.includes('closureGate.filter((item) => item.id === "confidence")') &&
    panelContent.includes("approvalBlockers = closureGate.filter") &&
    panelContent.includes("visibleClosureGate.map((item)");
  const hidesDetailByDefault = /\.task-assistant__closure-item\s+p\s*\{[\s\S]*max-height:\s*0[\s\S]*opacity:\s*0/.test(cssContent);
  const revealsDetailOnHoverOrFocus = /\.task-assistant__closure-item:hover\s+p,[\s\S]*\.task-assistant__closure-item:focus-visible\s+p,[\s\S]*\.task-assistant__closure-item:focus-within\s+p\s*\{[\s\S]*max-height:\s*4rem[\s\S]*opacity:\s*1/.test(cssContent);
  const hasCompactClosureGrid = /\.task-assistant__closure-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(5\.8rem,\s*1fr\)\)[\s\S]*gap:\s*0\.3rem/.test(cssContent) &&
    /\.task-assistant__closure-item\s*\{[\s\S]*padding:\s*0\.38rem\s+0\.42rem/.test(cssContent) &&
    /\.task-assistant__closure-item\s+span\s*\{[\s\S]*font-size:\s*0\.56rem/.test(cssContent);
  const keepsClosureTitlesUnclipped = /\.task-assistant__closure-item\s+strong\s*\{[^}]*white-space:\s*normal/.test(cssContent) &&
    /\.task-assistant__closure-item\s+strong\s*\{[^}]*overflow-wrap:\s*anywhere/.test(cssContent) &&
    !/\.task-assistant__closure-item\s+strong\s*\{[^}]*text-overflow:\s*ellipsis/.test(cssContent) &&
    !/\.task-assistant__closure-item\s+strong\s*\{[^}]*overflow:\s*hidden/.test(cssContent);

  addCheck(
    "task assistant closure details show on hover or focus",
    hasFocusableClosureCards && keepsClosureGateSystemOnly && hidesDetailByDefault && revealsDetailOnHoverOrFocus && hasCompactClosureGrid && keepsClosureTitlesUnclipped,
    hasFocusableClosureCards && keepsClosureGateSystemOnly && hidesDetailByDefault && revealsDetailOnHoverOrFocus && hasCompactClosureGrid && keepsClosureTitlesUnclipped
      ? "closure checklist detail text is hidden by default, confidence-only in UI, full gate system-only, and uses a compact unclipped grid"
      : "closure checklist UI must show confidence only while preserving full system gate checks, hover/focus detail reveal, compact grid, and unclipped titles",
  );
}

function checkCollapsedSecondaryPanelDefaults() {
  const filePath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const content = stripComments(readRequiredFile(filePath));
  if (!content) {
    addCheck("collapsed defaults for secondary panels", false, "task assistant panel missing");
    return;
  }

  const requiredCollapsedStates = [
    "externalExpanded",
    "historyExpanded",
    "filesExpanded",
    "diagnosticsExpanded",
  ];
  const missing = requiredCollapsedStates.filter((stateName) => !hasCollapsedUseStateDefault(content, stateName));

  addCheck(
    "collapsed defaults for secondary panels",
    missing.length === 0,
    missing.length === 0
      ? "secondary panel state defaults are collapsed"
      : `missing collapsed default state(s): ${missing.join(", ")}`,
  );
}

function checkAnswerContractVerdicts() {
  const filePath = appPath("src/domains/assistant/review-answer-contract.ts");
  const content = readRequiredFile(filePath);
  const requiredVerdicts = ["가능", "불가", "조건부", "추가확인필요", "판단보류"];
  const missing = requiredVerdicts.filter((verdict) => !content.includes(verdict));

  addCheck(
    "answer contract required verdict vocabulary",
    missing.length === 0,
    missing.length === 0
      ? "answer contract includes all required Korean verdicts"
      : `missing verdict(s): ${missing.join(", ")}`,
  );
}

function checkCandidateImpactRule() {
  const reviewSession = stripComments(readOptionalFile(appPath("src/domains/assistant/review-session.ts")));
  const ruleBody = extractFunctionBody(reviewSession, "enforceCandidateImpactVerdict");
  const hasRule = ruleBody.includes("추가확인필요") &&
    /canChangeConclusion/.test(ruleBody) &&
    /(missingFacts|candidateFactsMissing)/.test(ruleBody) &&
    /(highRisk|highRiskConcepts)/.test(ruleBody) &&
    /return\s+["'`]추가확인필요["'`]/.test(ruleBody);

  addCheck(
    "candidate-impact missing-facts verdict rule",
    hasRule,
    hasRule
      ? "candidate-impact rule anchors force 추가확인필요 when high-risk facts are missing"
      : "missing candidate-impact rule anchors for 추가확인필요, missing facts, or conclusion change",
  );
}

function checkOfficialVerifiedLegalMatchContract() {
  const files = [
    appPath("src/domains/assistant/review-session.ts"),
    appPath("src/use-cases/task-review-service.ts"),
    appPath("src/domains/assistant/task-review.ts"),
  ];
  const combined = files.map((filePath) => readOptionalFile(filePath)).join("\n");
  const hasLawName = combined.includes("lawName");
  const hasArticleLabel = combined.includes("articleLabel");
  const hasNormalizedArticleNumber = combined.includes("normalizedArticleNumber");

  addCheck(
    "official verified legal match locator fields",
    hasLawName && hasArticleLabel && hasNormalizedArticleNumber,
    hasLawName && hasArticleLabel && hasNormalizedArticleNumber
      ? "official verified legal matches include law name, article label, and normalized article number"
      : "missing lawName, articleLabel, or normalizedArticleNumber anchor",
  );
}

function checkReviewSessionRenameSupport() {
  const routePath = appPath("src/app/api/assistant/review-sessions/[sessionId]/route.ts");
  const panelPath = appPath("src/components/tasks/task-assistant-panel.tsx");
  const routeContent = readOptionalFile(routePath);
  const panelContent = readOptionalFile(panelPath);
  const hasRoute = existsSync(routePath) && routeContent.includes("PATCH");
  const hasUiAction = panelContent.includes("renameReviewSession") ||
    panelContent.includes("reviewSessionTitle") ||
    panelContent.includes("이름 변경") ||
    panelContent.includes("제목 변경");

  addCheck(
    "review session title rename route and UI action",
    hasRoute && hasUiAction,
    hasRoute && hasUiAction
      ? "rename route and task assistant UI action anchors exist"
      : "missing review session title rename route or UI action anchor",
  );
}

function checkFollowUpEvidenceSeparation() {
  const panelContent = readOptionalFile(appPath("src/components/tasks/task-assistant-panel.tsx"));
  const serviceContent = readOptionalFile(appPath("src/use-cases/task-review-service.ts"));
  const combined = `${panelContent}\n${serviceContent}`;
  const hasSavedEvidence = combined.includes("savedWikiEvidence") ||
    combined.includes("savedHistoryEvidence") ||
    combined.includes("savedEvidenceSnapshot");
  const hasLatestEvidence = combined.includes("latestWikiEvidence") ||
    combined.includes("latestHistoryEvidence") ||
    combined.includes("latestEvidenceSnapshot");
  const hasFollowUp = combined.includes("followUp") || combined.includes("FollowUp");

  addCheck(
    "follow-up evidence separates saved and latest WIKI/history",
    hasFollowUp && hasSavedEvidence && hasLatestEvidence,
    hasFollowUp && hasSavedEvidence && hasLatestEvidence
      ? "follow-up generation has saved/latest WIKI/history evidence anchors"
      : "missing saved/latest WIKI/history evidence separation anchors for follow-up generation",
  );
}

function checkFileContains(input: { name: string; filePath: string; required: string[] }) {
  const content = readRequiredFile(input.filePath);
  if (!content) {
    addCheck(input.name, false, `missing file ${input.filePath}`);
    return;
  }
  const missing = input.required.filter((anchor) => !content.includes(anchor));
  addCheck(
    input.name,
    missing.length === 0,
    missing.length === 0 ? "required anchors exist" : `missing anchor(s): ${missing.join(", ")}`,
  );
}

function resolveLegalRepoRoot() {
  const candidates = [
    process.env.VERIFIED_LEGAL_EVIDENCE_API_REPO,
    "D:\\architect-workspace\\worktrees\\verified-legal-evidence-api-task-assistant-unified-upgrade",
    "D:\\architect-workspace\\verified-legal-evidence-api",
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(resolved) && statSync(resolved).isDirectory() && isLegalApiRepoRoot(resolved)) {
      return resolved;
    }
  }
  return "";
}

function isLegalApiRepoRoot(root: string) {
  const packageJson = readOptionalFile(join(root, "package.json"));
  return packageJson.includes('"name": "verified-legal-evidence-api"') &&
    existsSync(join(root, "src", "api", "server.ts")) &&
    existsSync(join(root, "src", "retrieval", "legal-hybrid-search.ts"));
}

function extractFunctionBodies(content: string, functionNames: string[]) {
  return functionNames
    .map((functionName) => {
      return extractFunctionBody(content, functionName);
    })
    .filter(Boolean);
}

function extractFunctionBody(content: string, functionName: string) {
  const declarations = [
    `function ${functionName}`,
    `async function ${functionName}`,
    `export function ${functionName}`,
    `export async function ${functionName}`,
    `const ${functionName}`,
    `export const ${functionName}`,
  ];
  const index = declarations
    .map((declaration) => findDeclarationIndex(content, declaration))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (index < 0) {
    return "";
  }
  const braceIndex = findFunctionBodyBrace(content, index);
  if (braceIndex < 0) {
    return "";
  }
  return extractBraceBlock(content, braceIndex, index);
}

function hasCollapsedUseStateDefault(content: string, stateName: string) {
  const normalized = content.replace(/\s+/g, "");
  const declarationStart = normalized.indexOf(`const[${stateName},`);
  if (declarationStart < 0) {
    return false;
  }
  const declarationSegment = normalized.slice(declarationStart, declarationStart + 260);
  return declarationSegment.includes("]=useState") && declarationSegment.includes("(false)");
}

function sourceWindowAroundContains(
  content: string,
  anchor: string,
  requiredAnchors: string[],
  beforeLength = 500,
  afterLength = 500,
) {
  const segment = sourceWindowAround(content, anchor, beforeLength, afterLength);
  if (!segment) {
    return false;
  }

  return requiredAnchors.every((requiredAnchor) => segment.includes(requiredAnchor));
}

function sourceWindowAround(
  content: string,
  anchor: string,
  beforeLength = 500,
  afterLength = 500,
) {
  const anchorIndex = content.indexOf(anchor);
  if (anchorIndex < 0) {
    return "";
  }

  return content.slice(
    Math.max(0, anchorIndex - beforeLength),
    Math.min(content.length, anchorIndex + anchor.length + afterLength),
  );
}

function findDeclarationIndex(content: string, declaration: string) {
  let cursor = 0;
  while (cursor < content.length) {
    const index = content.indexOf(declaration, cursor);
    if (index < 0) {
      return -1;
    }
    if (hasIdentifierBoundary(content, index, declaration.length)) {
      return index;
    }
    cursor = index + declaration.length;
  }
  return -1;
}

function hasIdentifierBoundary(content: string, startIndex: number, declarationLength: number) {
  const previous = startIndex > 0 ? content[startIndex - 1] : "";
  const next = content[startIndex + declarationLength] ?? "";
  return !isIdentifierChar(previous) && !isIdentifierChar(next);
}

function isIdentifierChar(value: string) {
  return Boolean(value) && (
    value === "_" ||
    value === "$" ||
    value >= "0" && value <= "9" ||
    value >= "A" && value <= "Z" ||
    value >= "a" && value <= "z"
  );
}

function findFunctionBodyBrace(content: string, declarationIndex: number) {
  const declarationHead = content.slice(declarationIndex, declarationIndex + 120);
  const isFunctionDeclaration = /^(?:export\s+)?(?:async\s+)?function\b/.test(declarationHead);
  const nameParenIndex = content.indexOf("(", declarationIndex);

  if (!isFunctionDeclaration) {
    const arrowIndex = content.indexOf("=>", declarationIndex);
    if (arrowIndex >= 0 && arrowIndex < declarationIndex + 3000) {
      return content.indexOf("{", arrowIndex);
    }
  }

  if (nameParenIndex < 0) {
    return -1;
  }
  const closingParenIndex = findMatchingDelimiter(content, nameParenIndex, "(", ")");
  if (closingParenIndex < 0) {
    return -1;
  }
  return content.indexOf("{", closingParenIndex);
}

function findNextDeclarationBoundary(content: string, fromIndex: number) {
  const rest = content.slice(fromIndex);
  const match = /\b(?:export\s+)?(?:async\s+)?function\s+\w+|\b(?:export\s+)?const\s+\w+/g.exec(rest);
  return match?.index === undefined ? -1 : fromIndex + match.index;
}

function findMatchingDelimiter(content: string, openIndex: number, open: string, close: string) {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function extractIfBlockContaining(content: string, anchor: string) {
  const anchorIndex = content.indexOf(anchor);
  if (anchorIndex < 0) {
    return "";
  }
  const ifIndex = findNearestIfBefore(content, anchorIndex);
  const braceIndex = content.indexOf("{", ifIndex);
  if (ifIndex < 0 || braceIndex < 0) {
    return content.slice(anchorIndex, Math.min(content.length, anchorIndex + 6000));
  }
  return extractBraceBlock(content, braceIndex, ifIndex);
}

function findNearestIfBefore(content: string, anchorIndex: number) {
  const prefix = content.slice(0, anchorIndex);
  const matches = [...prefix.matchAll(/\bif\b/g)];
  return matches.length > 0 ? matches[matches.length - 1]!.index ?? -1 : -1;
}

function extractBraceBlock(content: string, braceIndex: number, startIndex: number) {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = braceIndex; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }
  return "";
}

function orderedAnchorsExist(content: string, anchors: string[]) {
  let cursor = 0;
  for (const anchor of anchors) {
    const next = content.indexOf(anchor, cursor);
    if (next < 0) {
      return false;
    }
    cursor = next + anchor.length;
  }
  return true;
}

function stripComments(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readRequiredFile(filePath: string) {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function readOptionalFile(filePath: string) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function appPath(relativePath: string) {
  return join(repoRoot, relativePath);
}

function addCheck(name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
}
