import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasAuthRuntimeConfig } from "@/lib/auth/auth-config";
import { updateSession } from "@/lib/supabase/middleware";

const publicPaths = new Set(["/login", "/preview"]);
const publicApiPrefixes = ["/api/auth/login"];

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Skip session enforcement entirely until the real auth provider is configured.
  if (!hasAuthRuntimeConfig()) {
    return NextResponse.next();
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

    const loginUrl = new URL("/login", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    if (next && next !== "/") {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
