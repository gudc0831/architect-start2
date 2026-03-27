const PROJECT_ISSUE_PREFIX_MAX_LENGTH = 8;
const PROJECT_ISSUE_NUMBER_PAD = 3;

function tokenizeProjectName(projectName: string) {
  const trimmed = projectName.trim();
  if (!trimmed) {
    return [];
  }

  const asciiSource = trimmed.normalize("NFKD").replace(/[\u0300-\u036f]/g, " ");
  const asciiTokens = asciiSource.match(/[A-Za-z0-9]+/g);
  if (asciiTokens?.length) {
    return asciiTokens;
  }

  return trimmed.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function sanitizePrefixSegment(value: string) {
  const joined = [...value.trim().toUpperCase()]
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .slice(0, PROJECT_ISSUE_PREFIX_MAX_LENGTH)
    .join("");

  return joined || "PRJ";
}

export function buildProjectIssuePrefix(projectName: string) {
  const tokens = tokenizeProjectName(projectName);

  if (tokens.length === 0) {
    return "PRJ";
  }

  if (tokens.length === 1) {
    return sanitizePrefixSegment(tokens[0]);
  }

  const initials = tokens.map((token) => [...token][0] ?? "").join("");
  return sanitizePrefixSegment(initials);
}

export function buildProjectIssueId(projectName: string, taskNumber: number) {
  const numericTaskNumber = Number.isFinite(taskNumber) ? Math.max(1, Math.trunc(taskNumber)) : 1;
  return `${buildProjectIssuePrefix(projectName)}-${String(numericTaskNumber).padStart(PROJECT_ISSUE_NUMBER_PAD, "0")}`;
}

export function looksLikeProjectIssueId(value: string) {
  return /^[\p{L}\p{N}]{1,8}-\d{3,}$/u.test(value.trim());
}

export function extractProjectIssueNumber(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^[\p{L}\p{N}]{1,8}-(\d{3,})$/u);
  return match?.[1] ?? null;
}
