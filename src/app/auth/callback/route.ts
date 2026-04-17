import { NextResponse } from "next/server";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { resolvePublicSiteUrl } from "@/lib/auth/public-site-url";
import { defaultSafeNextPath, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildLoginUrl(requestUrl: URL, nextPath: string) {
  const loginUrl = new URL("/login", requestUrl);

  if (nextPath !== defaultSafeNextPath) {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

function buildPostLoginUrl(requestUrl: URL, nextPath: string) {
  const postLoginUrl = new URL("/auth/post-login", requestUrl);

  if (nextPath !== defaultSafeNextPath) {
    postLoginUrl.searchParams.set("next", nextPath);
  }

  return postLoginUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicSiteUrl = resolvePublicSiteUrl(requestUrl);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveSafeInternalPath(requestUrl.searchParams.get("next"));
  const loginResponse = NextResponse.redirect(buildLoginUrl(publicSiteUrl, nextPath));

  if (!code) {
    return disableAuthResponseCache(loginResponse);
  }

  const redirectResponse = NextResponse.redirect(buildLoginUrl(publicSiteUrl, nextPath));
  const supabase = await createSupabaseServerClient({ response: redirectResponse });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return disableAuthResponseCache(loginResponse);
  }

  redirectResponse.headers.set("Location", buildPostLoginUrl(publicSiteUrl, nextPath).toString());
  return disableAuthResponseCache(redirectResponse);
}
