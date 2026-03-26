import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthRuntimeConfigErrorMessage, hasAuthRuntimeConfig, isAuthStubMode } from "@/lib/auth/auth-config";
import { updateSession } from "@/lib/supabase/middleware";

const publicPaths = new Set(["/login", "/preview"]);
const publicApiPrefixes = ["/api/auth/login", "/api/system/status"];

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap") ||
    pathname.includes(".")
  );
}

function isPublicRoute(pathname: string) {
  if (publicPaths.has(pathname)) {
    return true;
  }

  if (pathname.startsWith("/preview")) {
    return true;
  }

  return publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function buildLoginUrl(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (next && next !== "/") {
    loginUrl.searchParams.set("next", next);
  }

  return loginUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (isAuthStubMode()) {
    return NextResponse.next();
  }

  if (!hasAuthRuntimeConfig()) {
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    const message = getAuthRuntimeConfigErrorMessage() ?? "Cloud backend configuration is incomplete.";

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "CLOUD_ENV_MISSING",
            message,
          },
        },
        { status: 503 },
      );
    }

    return NextResponse.redirect(buildLoginUrl(request));
  }

  const { response, user } = await updateSession(request);

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/board", request.url));
  }

  if (isPublicRoute(pathname)) {
    return response;
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Login is required.",
          },
        },
        { status: 401 },
      );
    }

    return NextResponse.redirect(buildLoginUrl(request));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

