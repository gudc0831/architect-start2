import { badRequest } from "@/lib/api/errors";
import { requireFileInSelectedProject } from "@/use-cases/project-scope-guard";
import { storageProvider } from "@/storage";
import {
  decodeImageDataUrl,
  normalizeAnalysisText,
  normalizeObjectPath,
  normalizeRequiredId,
  normalizeStorageBucket,
  saveAnalysisImageCrop,
  saveFileAnalysis,
} from "@/use-cases/file-service";

export type FileOcrAnalysisInput = {
  fileId: string;
  sourceType?: string | null;
  extractedText?: string | null;
  summary?: string | null;
  tags?: unknown;
  provider?: string | null;
  language?: string | null;
  region?: unknown;
  sourceImageDataUrl?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  capturedAt?: string | null;
};

export async function runOcrFileAnalysis(input: FileOcrAnalysisInput, userId?: string | null) {
  const { buildClientSuppliedOcrAnalysis, extractOcrFromImageContent, extractOcrFromStoredFile } = await import(
    "@/domains/file/ocr"
  );
  const file = await requireFileInSelectedProject(normalizeRequiredId(input.fileId, "fileId"));
  if (file.deletedAt) {
    throw badRequest("Only active files can be analyzed", "FILE_NOT_ACTIVE");
  }

  const extractedText = normalizeAnalysisText(input.extractedText, 12000);
  const summary = normalizeAnalysisText(input.summary, 1200);
  const sourceImage = decodeImageDataUrl(input.sourceImageDataUrl);
  const artifact = sourceImage
    ? await saveAnalysisImageCrop(file, sourceImage, {
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        capturedAt: input.capturedAt,
      })
    : undefined;
  const ocrResult = sourceImage
    ? extractedText || summary
      ? buildClientSuppliedOcrAnalysis(file, {
          sourceType: input.sourceType,
          extractedText,
          summary,
          tags: input.tags,
          provider: input.provider,
          region: input.region,
        })
      : await extractOcrFromImageContent(file, sourceImage.bytes, {
          sourceType: input.sourceType,
          tags: input.tags,
          provider: input.provider,
          language: input.language,
          region: input.region,
        })
    : extractedText || summary
      ? buildClientSuppliedOcrAnalysis(file, {
          sourceType: input.sourceType,
          extractedText,
          summary,
          tags: input.tags,
          provider: input.provider,
          region: input.region,
        })
      : await extractOcrFromStoredFile(
          file,
          await storageProvider.download({
            storageBucket: normalizeStorageBucket(file.storageBucket),
            objectPath: normalizeObjectPath(file.objectPath),
          }),
          {
            sourceType: input.sourceType,
            tags: input.tags,
            provider: input.provider,
            language: input.language,
            region: input.region,
          },
        );

  return saveFileAnalysis(
    {
      fileId: file.id,
      sourceType: ocrResult.sourceType,
      extractedText: ocrResult.extractedText,
      summary: ocrResult.summary,
      tags: ocrResult.tags,
      confidenceWeight: ocrResult.confidenceWeight,
      verificationState: "unverified",
      provider: ocrResult.provider,
      providerStatus: ocrResult.providerStatus,
      region: ocrResult.region,
      artifact,
    },
    userId,
  );
}
