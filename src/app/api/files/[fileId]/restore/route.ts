import { NextResponse } from "next/server";
import { fileRepository } from "@/repositories";

export async function POST(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  const file = await fileRepository.restoreFile(fileId);

  return NextResponse.json({ data: file });
}