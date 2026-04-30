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

export function resolvePublicSiteUrl(requestUrl: URL) {
  const configuredSiteUrl = parseUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim());

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  return requestUrl;
}
