import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { deleteFileAnalysisArtifact, readFileAnalysisArtifact } from "@/use-cases/file-service";

type FileContentDisposition = "inline" | "attachment";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string; analysisId: string }> },
) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { fileId, analysisId } = await context.params;
    const { searchParams } = new URL(request.url);
    const disposition = resolveDisposition(searchParams.get("disposition"));
    const { file, analysis, artifact, content } = await readFileAnalysisArtifact(fileId, analysisId);

    return new NextResponse(Buffer.from(content), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": buildContentDisposition(disposition, buildArtifactFilename(file.originalName, analysis.id, artifact.mimeType)),
        "Content-Length": String(content.byteLength),
        "Content-Type": artifact.mimeType,
      },
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ fileId: string; analysisId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { fileId, analysisId } = await context.params;
    const data = await deleteFileAnalysisArtifact(fileId, analysisId);

    return NextResponse.json({ data });
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

  throw badRequest("disposition must be inline or attachment", "FILE_ANALYSIS_ARTIFACT_DISPOSITION_INVALID");
}

function buildArtifactFilename(originalName: string, analysisId: string, mimeType: string) {
  const baseName = sanitizeFilename(originalName).replace(/\.[^.]+$/, "") || "file";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "bin";
  return `${baseName}-analysis-${analysisId.slice(0, 8)}-crop.${extension}`;
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
