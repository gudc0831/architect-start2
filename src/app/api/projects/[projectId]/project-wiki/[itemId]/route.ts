import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectWikiDetail } from "@/use-cases/project-wiki-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; itemId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, itemId } = await context.params;
    const data = await getProjectWikiDetail({
      projectId,
      itemId,
      user,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
