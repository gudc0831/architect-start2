const providerUsageOrCostKeyPattern =
  /^(providerUsage|usageMetadata|usage|cost|costCents|costMetadata|providerCost|estimatedCost|estimatedCostCents|inputTokens|outputTokens|totalTokens|promptTokens|completionTokens|tokenUsage)$/i;
const sensitiveKeyPattern =
  /(rawPrompt|promptText|systemPrompt|developerPrompt|userPrompt|apiKey|api_key|secret|token|password|authorization|credential)/i;

export function sanitizeKnowledgeResponse<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (providerUsageOrCostKeyPattern.test(key)) {
      continue;
    }

    sanitized[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitizeValue(nestedValue);
  }

  return sanitized;
}

function sanitizeText(value: string) {
  return value
    .replace(
      /"(providerUsage|usageMetadata|usage|cost|costCents|costMetadata|providerCost|estimatedCost|estimatedCostCents|inputTokens|outputTokens|totalTokens|promptTokens|completionTokens|tokenUsage)"\s*:\s*(?:\{[^}\r\n]*\}|\[[^\]\r\n]*\]|"[^"\r\n]*"|[0-9.]+|true|false|null)/gi,
      '"$1":"[REDACTED_USAGE]"',
    )
    .replace(/\b([A-Z0-9_]*(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD|DATABASE_URL)[A-Z0-9_]*)\s*=\s*["']?[^"'\s,;}]+/gi, "$1=[REDACTED]")
    .replace(
      /\b(providerUsage|usageMetadata|usage|cost|costCents|costMetadata|providerCost|estimatedCost|estimatedCostCents|inputTokens|outputTokens|totalTokens|promptTokens|completionTokens|tokenUsage)\b\s*[:=]\s*(?:\{[^}\r\n]*\}|\[[^\]\r\n]*\]|["'][^"'\r\n]*["']|[^\s,;}\]\r\n]+)/gi,
      "$1=[REDACTED_USAGE]",
    )
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, "[REDACTED_SECRET]")
    .replace(/\b(env(?:File|Path)?|dotenv)\s*[:=]\s*["']?\.env[.\w-]*/gi, "$1=[REDACTED_ENV_FILE]")
    .replace(/(^|[\s"'(])\.env(?:[.\w-]*)?/g, "$1[REDACTED_ENV_FILE]")
    .replace(/\b[A-Za-z]:\\[^\r\n"'`]+/g, "[REDACTED_PATH]")
    .replace(/\\\\[^\s\\/:*?"<>|]+\\[^\r\n"'`]+/g, "[REDACTED_PATH]")
    .replace(/(^|[\s"'(])\/(?:Users|home|var|etc|tmp|mnt|opt|srv|root|Volumes|workspace)\/[^\r\n"'`)]+/g, "$1[REDACTED_PATH]");
}
