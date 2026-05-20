function parseUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function resolvePublicSiteUrl(requestUrl: URL) {
  if (isLoopbackHostname(requestUrl.hostname)) {
    return requestUrl;
  }

  const configuredSiteUrl = parseUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim());

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  return requestUrl;
}
