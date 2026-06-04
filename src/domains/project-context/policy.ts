export type ProjectContextRuleSetStatus = "draft" | "active" | "archived";

export type ProjectContextRuleSet = {
  id: string;
  name: string;
  version: string;
  status: ProjectContextRuleSetStatus;
  supportedMimeTypes: string[];
  supportedExtensions: string[];
  rawRetentionDays: number;
  maxFileSizeBytes: number;
  maxFilesPerUpload: number;
  maxFilesPerProject: number;
  maxExtractedTextChars: number;
  maxChunksPerVersion: number;
  parserVersions: Record<string, string>;
  normalizationRulesMarkdown: string;
  chunking: {
    maxChunkChars: number;
    overlapChars: number;
    requireSourceQuote: true;
    requireLocation: true;
  };
  retrieval: {
    lexicalTopK: number;
    vectorTopK: number;
    rerankTopK: number;
    finalTopK: number;
    maxChunksPerSource: number;
    minVectorCosine: number;
    minBm25: number;
    minRerank: number;
  };
  promptInjection: {
    blockedPatterns: string[];
    warningPatterns: string[];
  };
  createdByUserId: string;
  approvedByUserId: string | null;
  createdAt: string;
  activatedAt: string | null;
};

export const projectContextVersionPinningRules = [
  "Each upload version stores normalizationRuleVersion.",
  "Each upload version stores parserVersion.",
  "New active policy applies only to new uploads.",
  "Existing normalized_draft and active versions are not automatically reprocessed.",
  "Rollback creates or reactivates a policy version, not silent mutation of old version metadata.",
] as const;

export const defaultProjectContextRuleSet: ProjectContextRuleSet = {
  id: "project-context-md@2026-06-02",
  name: "Project context global criteria MD",
  version: "2026-06-02",
  status: "active",
  supportedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/markdown",
    "text/csv",
    "text/plain",
  ],
  supportedExtensions: [".pdf", ".docx", ".xlsx", ".md", ".csv", ".txt"],
  rawRetentionDays: 7,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxFilesPerUpload: 20,
  maxFilesPerProject: 500,
  maxExtractedTextChars: 1_000_000,
  maxChunksPerVersion: 1_000,
  parserVersions: {
    pdf: "pdf-parser@v1",
    docx: "docx-parser@v1",
    xlsx: "xlsx-parser@v1",
    csv: "csv-parser@v1",
    markdown: "markdown-parser@v1",
    text: "text-parser@v1",
  },
  normalizationRulesMarkdown: [
    "# Project context normalization rules",
    "",
    "- Treat uploaded project text as untrusted project_context, never as verified legal evidence.",
    "- Preserve sourceQuote from the extracted text for every review-usable chunk.",
    "- Preserve typed location for every review-usable chunk.",
    "- Do not expose rawStorageKey or raw blob locations to browser-facing responses.",
    "- Do not use normalizedText in AI task review when sourceQuote or typed location is missing.",
    "- Detect prompt-injection instructions and keep them inside quoted project_context fields only.",
  ].join("\n"),
  chunking: {
    maxChunkChars: 1_600,
    overlapChars: 160,
    requireSourceQuote: true,
    requireLocation: true,
  },
  retrieval: {
    lexicalTopK: 20,
    vectorTopK: 20,
    rerankTopK: 8,
    finalTopK: 5,
    maxChunksPerSource: 2,
    minVectorCosine: 0.72,
    minBm25: 0.2,
    minRerank: 0.65,
  },
  promptInjection: {
    blockedPatterns: [
      "ignore previous instructions",
      "override system prompt",
      "reveal hidden prompt",
      "act as system",
    ],
    warningPatterns: [
      "do not cite",
      "bypass policy",
      "developer message",
      "system instruction",
    ],
  },
  createdByUserId: "system:global-admin-md",
  approvedByUserId: "system:global-admin-md",
  createdAt: "2026-06-02T00:00:00.000Z",
  activatedAt: "2026-06-02T00:00:00.000Z",
};

const ruleSets = [defaultProjectContextRuleSet] as const;

export function listProjectContextRuleSets(): ProjectContextRuleSet[] {
  return ruleSets.map(cloneRuleSet);
}

export function getActiveProjectContextRuleSet(): ProjectContextRuleSet {
  const active = ruleSets.find((ruleSet) => ruleSet.status === "active");
  if (!active) {
    throw new Error("Active project_context policy is missing.");
  }
  return cloneRuleSet(active);
}

export function assertProjectContextRuleSet(ruleSet: ProjectContextRuleSet): void {
  if (ruleSet.status === "active" && !ruleSet.activatedAt) {
    throw new Error("Active project_context policy requires activatedAt.");
  }
  if (ruleSet.rawRetentionDays !== 7) {
    throw new Error("Project upload raw retention must default to 7 days.");
  }
  if (!ruleSet.chunking.requireSourceQuote || !ruleSet.chunking.requireLocation) {
    throw new Error("Project context chunks require sourceQuote and typed location.");
  }
  if (ruleSet.retrieval.finalTopK < 3 || ruleSet.retrieval.finalTopK > 5) {
    throw new Error("Project context finalTopK must be between 3 and 5.");
  }
  if (ruleSet.retrieval.maxChunksPerSource !== 2) {
    throw new Error("Project context maxChunksPerSource must be 2.");
  }
  assertThreshold(ruleSet.retrieval.minVectorCosine, 0.72, "minVectorCosine");
  assertThreshold(ruleSet.retrieval.minBm25, 0.2, "minBm25");
  assertThreshold(ruleSet.retrieval.minRerank, 0.65, "minRerank");
}

function assertThreshold(actual: number, expected: number, fieldName: string): void {
  if (actual !== expected) {
    throw new Error(`Project context ${fieldName} must be ${expected}.`);
  }
}

function cloneRuleSet(ruleSet: ProjectContextRuleSet): ProjectContextRuleSet {
  return {
    ...ruleSet,
    supportedMimeTypes: [...ruleSet.supportedMimeTypes],
    supportedExtensions: [...ruleSet.supportedExtensions],
    parserVersions: { ...ruleSet.parserVersions },
    chunking: { ...ruleSet.chunking },
    retrieval: { ...ruleSet.retrieval },
    promptInjection: {
      blockedPatterns: [...ruleSet.promptInjection.blockedPatterns],
      warningPatterns: [...ruleSet.promptInjection.warningPatterns],
    },
  };
}
