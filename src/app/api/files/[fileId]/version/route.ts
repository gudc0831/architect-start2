import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { attachNextFileVersion } from "@/use-cases/file-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const data = await attachNextFileVersion({ fileId, file });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}