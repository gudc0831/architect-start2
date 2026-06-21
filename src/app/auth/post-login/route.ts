import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { getOptionalUser } from "@/lib/auth/require-user";
import { resolvePostLoginDestination } from "@/lib/auth/workspace-entry";
import { applyProjectSessionProjectId } from "@/lib/project-session";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const nextPath = resolveSafeInternalPath(requestUrl.searchParams.get("next"));
    const user = await getOptionalUser();

    if (!user) {
      const loginUrl = new URL("/login", requestUrl);
      if (nextPath !== "/board") {
        loginUrl.searchParams.set("next", nextPath);
      }
      return disableAuthResponseCache(NextResponse.redirect(loginUrl));
    }

    const { destination, currentProjectId } = await resolvePostLoginDestination(
      user,
      nextPath,
    );
    const response = disableAuthResponseCache(NextResponse.redirect(new URL(destination, requestUrl)));
    return applyProjectSessionProjectId(response, currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
