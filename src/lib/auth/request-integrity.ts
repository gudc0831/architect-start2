import { forbidden } from "@/lib/api/errors";

const protectedMutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertRequestIntegrity(request: Request) {
  const method = request.method.toUpperCase();
  if (!protectedMutationMethods.has(method)) {
    return;
  }

  const allowedOrigins = getAllowedOrigins(request);
  const originHeader = request.headers.get("origin");
  if (originHeader !== null) {
    const origin = parseOrigin(originHeader);
    if (!origin || !allowedOrigins.has(origin)) {
      throw forbidden("Cross-site requests are not allowed.", "REQUEST_ORIGIN_INVALID");
    }

    return;
  }

  const refererHeader = request.headers.get("referer");
  if (refererHeader !== null) {
    const refererOrigin = parseOrigin(refererHeader);
    if (!refererOrigin || !allowedOrigins.has(refererOrigin)) {
      throw forbidden("Cross-site requests are not allowed.", "REQUEST_REFERER_INVALID");
    }

    return;
  }

  throw forbidden("Missing request origin.", "REQUEST_ORIGIN_REQUIRED");
}

function getAllowedOrigins(request: Request) {
  const allowedOrigins = new Set<string>();
  const requestOrigin = parseOrigin(request.url);
  if (requestOrigin) {
    allowedOrigins.add(requestOrigin);
  }

  const configuredSiteUrl = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configuredSiteUrl) {
    allowedOrigins.add(configuredSiteUrl);
  }

  const vercelUrl = normalizeOptionalUrl(process.env.NEXT_PUBLIC_VERCEL_URL);
  if (vercelUrl) {
    allowedOrigins.add(vercelUrl);
  }

  return allowedOrigins;
}

function normalizeOptionalUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return parseOrigin(normalized.startsWith("http://") || normalized.startsWith("https://") ? normalized : `https://${normalized}`);
}

function parseOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}
