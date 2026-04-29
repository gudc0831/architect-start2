import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { revokeProjectInvitation } from "@/use-cases/invitation-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { invitationId } = await context.params;
    const invitation = await revokeProjectInvitation({ invitationId, actor: user });
    return NextResponse.json({
      data: {
        id: invitation.id,
        status: invitation.status,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
