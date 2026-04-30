import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listAccessRequests, submitAccessRequest } from "@/use-cases/access-request-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requestUrl = new URL(request.url);
    const data = await listAccessRequests({
      actor: user,
      projectId: requestUrl.searchParams.get("projectId"),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = (await request.json()) as {
      message?: string;
      requestedRole?: unknown;
      projectId?: unknown;
    };
    const data = await submitAccessRequest({
      actor: user,
      message: body.message,
      requestedRole: body.requestedRole,
      projectId: body.projectId,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
