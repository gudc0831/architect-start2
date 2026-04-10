import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { requireUser } from "@/lib/auth/require-user";
import { resolvePostLoginDestination } from "@/lib/auth/workspace-entry";
import { applyProjectSessionProjectId } from "@/lib/project-session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requestUrl = new URL(request.url);
    const { destination, currentProjectId } = await resolvePostLoginDestination(
      user,
      resolveSafeInternalPath(requestUrl.searchParams.get("next")),
    );
    const response = disableAuthResponseCache(NextResponse.redirect(new URL(destination, requestUrl)));
    return applyProjectSessionProjectId(response, currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
