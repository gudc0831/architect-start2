import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { loadWorkspaceBootstrap } from "@/lib/workspace/bootstrap-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await loadWorkspaceBootstrap({
      activeTaskOrderScope: searchParams.get("orderScope") === "daily" ? "daily" : null,
      includeActiveTasks: searchParams.get("includeActiveTasks") !== "0",
    });
    const response = NextResponse.json({ data });
    response.headers.set("Cache-Control", "no-store");
    return applyProjectSessionProjectId(response, data.project.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
