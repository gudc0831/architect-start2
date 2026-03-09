import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { moveFileToTrash } from "@/use-cases/file-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await context.params;
    const file = await moveFileToTrash(fileId);

    return NextResponse.json({ data: file });
  } catch (error) {
    return handleRouteError(error);
  }
}