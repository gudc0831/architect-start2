import { NextResponse } from "next/server";
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

function buildPostLoginUrl(requestUrl: URL, nextPath: string) {
  const postLoginUrl = new URL("/auth/post-login", requestUrl);

  if (nextPath !== defaultSafeNextPath) {
    postLoginUrl.searchParams.set("next", nextPath);
  }

  return postLoginUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveSafeInternalPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return disableAuthResponseCache(NextResponse.redirect(buildLoginUrl(requestUrl, nextPath)));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return disableAuthResponseCache(NextResponse.redirect(buildLoginUrl(requestUrl, nextPath)));
  }

  return disableAuthResponseCache(NextResponse.redirect(buildPostLoginUrl(requestUrl, nextPath)));
}
