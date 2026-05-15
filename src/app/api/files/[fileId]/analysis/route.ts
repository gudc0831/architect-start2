import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { autoExtractFileAnalysis, listFileAnalysis, runOcrFileAnalysis, saveFileAnalysis } from "@/use-cases/file-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { fileId } = await context.params;
    const data = await listFileAnalysis(fileId);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { fileId } = await context.params;
    const body = await request.json();
    if (body.mode === "auto_extract" || body.autoExtract === true) {
      const data = await autoExtractFileAnalysis(fileId, user.id);

      return NextResponse.json({ data });
    }
    if (body.mode === "ocr_extract") {
      const data = await runOcrFileAnalysis(
        {
          fileId,
          sourceType: body.sourceType,
          extractedText: body.extractedText,
          summary: body.summary,
          tags: body.tags,
          provider: body.provider,
          language: body.language,
          region: body.region,
          sourceImageDataUrl: body.sourceImageDataUrl,
          sourceUrl: body.sourceUrl,
          sourceTitle: body.sourceTitle,
          capturedAt: body.capturedAt,
        },
        user.id,
      );

      return NextResponse.json({ data });
    }

    const data = await saveFileAnalysis(
      {
        fileId,
        sourceType: body.sourceType,
        extractedText: body.extractedText,
        summary: body.summary,
        tags: body.tags,
        confidenceWeight: body.confidenceWeight,
        verificationState: body.verificationState,
        provider: body.provider,
        providerStatus: body.providerStatus,
        region: body.region,
        artifact: body.artifact,
      },
      user.id,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
