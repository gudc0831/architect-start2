import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { emptyTrash } from "@/use-cases/trash-service";

export async function DELETE(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const result = await emptyTrash(user.id);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
