import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { readFileContent } from "@/use-cases/file-service";

type FileContentDisposition = "inline" | "attachment";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    await requireUser();
    const { fileId } = await context.params;
    const { searchParams } = new URL(request.url);
    const disposition = resolveDisposition(searchParams.get("disposition"));
    const { file, content, contentType } = await readFileContent(fileId);

    return new NextResponse(Buffer.from(content), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": buildContentDisposition(disposition, file.originalName),
        "Content-Length": String(content.byteLength),
        "Content-Type": contentType,
      },
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function resolveDisposition(value: string | null): FileContentDisposition {
  if (!value || value === "inline") {
    return "inline";
  }

  if (value === "attachment") {
    return "attachment";
  }

  throw badRequest("disposition must be inline or attachment", "FILE_CONTENT_DISPOSITION_INVALID");
}

function buildContentDisposition(disposition: FileContentDisposition, originalName: string) {
  const safeFileName = sanitizeFilename(originalName);
  const asciiFileName = safeFileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "file";
  const encodedFileName = encodeURIComponent(safeFileName);

  return `${disposition}; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`;
}

function sanitizeFilename(value: string) {
  const collapsed = value
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:"*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return collapsed || "file";
}
