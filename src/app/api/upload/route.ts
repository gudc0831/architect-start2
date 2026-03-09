import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { attachUploadedFile } from "@/use-cases/file-service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const taskId = formData.get("taskId");

    if (!(file instanceof File) || typeof taskId !== "string") {
      return NextResponse.json({ error: "file and taskId are required" }, { status: 400 });
    }

    const record = await attachUploadedFile({ taskId, file });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}