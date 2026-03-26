import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { emptyTrash } from "@/use-cases/trash-service";

export async function DELETE() {
  try {
    const user = await requireUser();
    await emptyTrash(user.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
