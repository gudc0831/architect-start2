import type { AssistantEvidence, AssistantThreadMessageRole, AssistantThreadSummaryProvenance } from "@/domains/assistant/types";

const CURRENT_QUESTION_LIMIT = 900;
const THREAD_SUMMARY_LIMIT = 1200;
const RECENT_MESSAGE_LIMIT = 700;
const THREAD_MEMORY_LIMIT = 4200;

export type AssistantThreadMemoryMessage = {
  id?: string;
  role: AssistantThreadMessageRole;
  content: string;
  evidenceSnapshot?: AssistantEvidence[];
};

export function buildThreadMemory(input: {
  currentQuestion: string;
  threadSummary: string;
  recentMessages: AssistantThreadMemoryMessage[];
  maxRecentMessages: number;
}): string {
  const sections: string[] = [];
  const currentQuestion = truncateText(sanitizeMemoryText(input.currentQuestion), CURRENT_QUESTION_LIMIT);
  const threadSummary = truncateText(sanitizeMemoryText(input.threadSummary), THREAD_SUMMARY_LIMIT);

  sections.push(["Current question:", currentQuestion].filter(Boolean).join("\n"));

  if (threadSummary) {
    sections.push(["Thread summary:", threadSummary].join("\n"));
  }

  const maxRecentMessages = normalizeRecentMessageLimit(input.maxRecentMessages);
  const recentMessages = input.recentMessages
    .slice(-maxRecentMessages)
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: roleLabel(message.role),
      content: memoryMessageContent(message),
    }))
    .filter((message) => message.content.length > 0);

  if (recentMessages.length > 0) {
    sections.push([
      "Recent messages:",
      ...recentMessages.map((message) => `${message.role}: ${message.content}`),
    ].join("\n"));
  }

  return truncateText(sections.filter((section) => section.trim().length > 0).join("\n\n").trim(), THREAD_MEMORY_LIMIT);
}

export function shouldRefreshThreadSummary(input: {
  threadSummary: string;
  recentMessages: Array<AssistantThreadMemoryMessage & { id: string }>;
  provenance: AssistantThreadSummaryProvenance | null;
}): boolean {
  const summary = sanitizeMemoryText(input.threadSummary);
  if (summary.length > 1800) {
    return true;
  }

  const conversationMessages = input.recentMessages.filter((message) => message.role === "user" || message.role === "assistant");
  if (!summary && conversationMessages.length >= 8) {
    return true;
  }

  const summarizedMessageIds = new Set(input.provenance?.sourceMessageIds ?? []);
  const unsummarizedCount = conversationMessages.filter((message) => !summarizedMessageIds.has(message.id)).length;
  return Boolean(summary) && unsummarizedCount >= 6;
}

export function normalizeThreadSummaryUpdate(input: {
  summary: string;
  provenance: AssistantThreadSummaryProvenance;
}): { summary: string; provenance: AssistantThreadSummaryProvenance } {
  return {
    summary: truncateSummary(sanitizeMemoryText(input.summary)),
    provenance: normalizeSummaryProvenance(input.provenance),
  };
}

function normalizeRecentMessageLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 6;
  }

  return Math.max(1, Math.min(20, Math.floor(value)));
}

function roleLabel(role: AssistantThreadMessageRole): string {
  switch (role) {
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "user":
    default:
      return "User";
  }
}

function sanitizeMemoryText(value: string): string {
  return redactSecretValues(removeStaleEvidenceExcerptLines(normalizeLineEndings(value))).trim();
}

function memoryMessageContent(message: AssistantThreadMemoryMessage): string {
  const staleLegalEvidence = (message.evidenceSnapshot ?? []).filter((evidence) => evidence.legal?.stale);
  if (message.role === "assistant" && staleLegalEvidence.length > 0) {
    const warnings = staleLegalEvidence.flatMap((evidence) => evidence.legal?.legalChangeWarnings ?? []);
    return [
      "[stale legal evidence omitted]",
      ...Array.from(new Set(warnings)).map((warning) => `[${warning}]`),
    ].join(" ");
  }

  return truncateText(sanitizeMemoryText(message.content), RECENT_MESSAGE_LIMIT);
}

function normalizeLineEndings(value: string): string {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function removeStaleEvidenceExcerptLines(value: string): string {
  return value
    .split("\n")
    .filter((line) => !isStaleEvidenceExcerptLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function isStaleEvidenceExcerptLine(line: string): boolean {
  return /\[STALE_EVIDENCE_EXCERPT\]|STALE_EVIDENCE_EXCERPT|stale\s*[:=]\s*true/i.test(line);
}

function redactSecretValues(value: string): string {
  let redacted = value
    .replace(/\bOC\s*=\s*[^&\s]+/gi, ["OC", "[redacted-secret]"].join("="))
    .replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^&\s]+/g, "[redacted-secret]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted-secret]");

  for (const secret of collectKnownSecretValues()) {
    redacted = redacted.split(secret).join("[redacted-secret]");
  }

  return redacted;
}

function truncateSummary(value: string): string {
  if (value.length < 1400) {
    return value;
  }

  return `${value.slice(0, 1396).trimEnd()}...`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeSummaryProvenance(provenance: AssistantThreadSummaryProvenance): AssistantThreadSummaryProvenance {
  const sourceMessageIds = Array.from(new Set((provenance.sourceMessageIds ?? []).map((id) => id.trim()).filter(Boolean)));
  return {
    ...(sourceMessageIds.length > 0 ? { sourceMessageIds } : {}),
    ...(provenance.generatedAt ? { generatedAt: provenance.generatedAt } : {}),
    ...(provenance.provider ? { provider: provenance.provider } : {}),
    ...(provenance.model ? { model: provenance.model } : {}),
  };
}

function collectKnownSecretValues(): string[] {
  const secretNamePattern = /(KEY|TOKEN|SECRET|PASSWORD|LAW_OPEN_DATA_OC)$/i;
  return Object.entries(process.env)
    .filter(([name, value]) => secretNamePattern.test(name) && typeof value === "string" && value.trim().length >= 6)
    .map(([, value]) => value?.trim())
    .filter((value): value is string => Boolean(value));
}
