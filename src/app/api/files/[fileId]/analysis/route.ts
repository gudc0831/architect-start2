import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listFileAnalysis, saveFileAnalysis } from "@/use-cases/file-service";

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
    const data = await saveFileAnalysis(
      {
        fileId,
        sourceType: body.sourceType,
        extractedText: body.extractedText,
        summary: body.summary,
        tags: body.tags,
        confidenceWeight: body.confidenceWeight,
        verificationState: body.verificationState,
      },
      user.id,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
