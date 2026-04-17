import { NextResponse } from "next/server";
import { hasAuthRuntimeConfig, isAuthStubMode } from "@/lib/auth/auth-config";
import { resolvePublicSiteUrl } from "@/lib/auth/public-site-url";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { defaultSafeNextPath, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildLoginUrl(requestUrl: URL, nextPath: string) {
  const loginUrl = new URL("/login", requestUrl);

  if (nextPath !== defaultSafeNextPath) {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicSiteUrl = resolvePublicSiteUrl(requestUrl);
  const nextPath = resolveSafeInternalPath(requestUrl.searchParams.get("next"));
  const fallbackResponse = NextResponse.redirect(buildLoginUrl(publicSiteUrl, nextPath));

  if (isAuthStubMode() || !hasAuthRuntimeConfig()) {
    return disableAuthResponseCache(fallbackResponse);
  }

  const redirectResponse = NextResponse.redirect(buildLoginUrl(publicSiteUrl, nextPath));
  const supabase = await createSupabaseServerClient({ response: redirectResponse });
  const callbackUrl = new URL("/auth/callback", publicSiteUrl);

  if (nextPath !== defaultSafeNextPath) {
    callbackUrl.searchParams.set("next", nextPath);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    return disableAuthResponseCache(fallbackResponse);
  }

  redirectResponse.headers.set("Location", data.url);
  return disableAuthResponseCache(redirectResponse);
}
