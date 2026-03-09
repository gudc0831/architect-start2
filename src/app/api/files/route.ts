import { NextResponse } from "next/server";
import { fileRepository } from "@/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId") ?? undefined;
  const scope = searchParams.get("scope");
  const data = scope === "trash" ? await fileRepository.listTrashFiles(taskId) : await fileRepository.listActiveFiles(taskId);

  return NextResponse.json({ data });
}
