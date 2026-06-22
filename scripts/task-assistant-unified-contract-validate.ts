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
  const missing = requiredCollapsedStates.filter((stateName) => {
    const pattern = new RegExp(`const\\s*\\[\\s*${stateName}\\s*,[^\\]]+\\]\\s*=\\s*useState(?:<[^>]+>)?\\s*\\(\\s*false\\s*\\)`, "s");
    return !pattern.test(content);
  });

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
  const patterns = [
    new RegExp(`\\bfunction\\s+${escapeRegExp(functionName)}\\b`),
    new RegExp(`\\basync\\s+function\\s+${escapeRegExp(functionName)}\\b`),
    new RegExp(`\\bexport\\s+function\\s+${escapeRegExp(functionName)}\\b`),
    new RegExp(`\\bexport\\s+async\\s+function\\s+${escapeRegExp(functionName)}\\b`),
    new RegExp(`\\bconst\\s+${escapeRegExp(functionName)}\\b`),
    new RegExp(`\\bexport\\s+const\\s+${escapeRegExp(functionName)}\\b`),
  ];
  const index = patterns
    .map((pattern) => pattern.exec(content)?.index ?? -1)
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
