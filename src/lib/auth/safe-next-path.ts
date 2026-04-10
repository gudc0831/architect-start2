const SAFE_INTERNAL_PATH_ORIGIN = "https://architect-start.local";
const blockedInternalPrefixes = ["/auth/", "/login"];

export const defaultSafeNextPath = "/board";

export function resolveSafeInternalPath(value: string | null | undefined, fallback = defaultSafeNextPath) {
  if (typeof value !== "string") {
    return fallback;
  }

  const candidate = value.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, SAFE_INTERNAL_PATH_ORIGIN);
    if (parsed.origin !== SAFE_INTERNAL_PATH_ORIGIN) {
      return fallback;
    }

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
    if (normalized === "/" || blockedInternalPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix))) {
      return fallback;
    }

    return normalized;
  } catch {
    return fallback;
  }
}

export function buildPostLoginUrl(value: string | null | undefined) {
  const nextPath = resolveSafeInternalPath(value);
  if (nextPath === defaultSafeNextPath) {
    return "/auth/post-login";
  }

  return `/auth/post-login?next=${encodeURIComponent(nextPath)}`;
}

export function buildGoogleLoginUrl(value: string | null | undefined) {
  const nextPath = resolveSafeInternalPath(value);
  if (nextPath === defaultSafeNextPath) {
    return "/api/auth/google";
  }

  return `/api/auth/google?next=${encodeURIComponent(nextPath)}`;
}
