import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { createFileDownloadUrl } from "@/use-cases/file-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    await requireUser();
    const { fileId } = await context.params;
    const url = await createFileDownloadUrl(fileId);
    return NextResponse.json({ url });
  } catch (error) {
    return handleRouteError(error);
  }
}
