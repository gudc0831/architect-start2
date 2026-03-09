import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { NextResponse } from "next/server";
import { fileRepository } from "@/repositories";

const uploadRoot = process.env.LOCAL_UPLOAD_ROOT || "D:/architect-start-data/uploads";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const taskId = formData.get("taskId");

  if (!(file instanceof File) || typeof taskId !== "string") {
    return NextResponse.json({ error: "file and taskId are required" }, { status: 400 });
  }

  await mkdir(uploadRoot, { recursive: true });

  const safeBase = basename(file.name, extname(file.name)).replace(/[^a-zA-Z0-9-_]/g, "-");
  const storedName = `${Date.now()}-${safeBase}${extname(file.name)}`;
  const storedPath = join(uploadRoot, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(storedPath, buffer);
  const record = await fileRepository.attachFile({
    taskId,
    originalName: file.name,
    storedName,
    storedPath,
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
