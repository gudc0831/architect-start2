import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { getTaskListLayout, updateTaskListLayout } from "@/use-cases/preference-service";

export async function GET() {
  try {
    const user = await requireUser();
    const layout = await getTaskListLayout(user.id);
    return NextResponse.json({ data: layout });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = (await request.json()) as { columnWidths?: unknown; rowHeights?: unknown; detailPanelWidth?: unknown };
    const layout = await updateTaskListLayout(user.id, body);
    return NextResponse.json({ data: layout });
  } catch (error) {
    return handleRouteError(error);
  }
}
