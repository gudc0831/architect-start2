const vercelBypassSecretEnvName = "VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET";

export function withVerifiedLegalServiceHeaders(headers: Record<string, string>): Record<string, string> {
  const bypassSecret = process.env[vercelBypassSecretEnvName]?.trim();
  if (!bypassSecret) {
    return headers;
  }

  return {
    ...headers,
    "x-vercel-protection-bypass": bypassSecret,
  };
}
