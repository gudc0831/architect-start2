import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { listFiles } from "@/use-cases/file-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId") ?? undefined;
    const scope = searchParams.get("scope") === "trash" ? "trash" : "active";
    const data = await listFiles(scope, taskId);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
