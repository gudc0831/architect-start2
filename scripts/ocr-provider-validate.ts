import { buildClientSuppliedOcrAnalysis, resolveOcrFileKind } from "../src/domains/file/ocr";
import type { FileRecord } from "../src/domains/task/types";

const imageFile = makeFile("scan.png", "image/png");
const pdfFile = makeFile("scan.pdf", "application/pdf");
const docxFile = makeFile("memo.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

const region = { pageNumber: 2, x: 10, y: 15, width: 40, height: 25, unit: "percent" };
const imageRegion = buildClientSuppliedOcrAnalysis(imageFile, {
  sourceType: "image_region",
  extractedText: "stair width 1200mm",
  tags: "plan, stair",
  region,
});
const ocrText = buildClientSuppliedOcrAnalysis(imageFile, {
  sourceType: "ocr_text",
  extractedText: "parking count table",
});

const failures = [
  imageRegion.sourceType === "image_region" ? null : "image_region source type was not preserved",
  imageRegion.providerStatus === "client_supplied" ? null : "client supplied provider status missing",
  imageRegion.region?.pageNumber === 2 ? null : "region page number missing",
  imageRegion.tags.includes("image-region") ? null : "image-region tag missing",
  ocrText.sourceType === "ocr_text" ? null : "ocr_text source type was not preserved",
  resolveOcrFileKind(imageFile) === "image" ? null : "image kind detection failed",
  resolveOcrFileKind(pdfFile) === "pdf" ? null : "pdf kind detection failed",
  resolveOcrFileKind(docxFile) === "other" ? null : "other kind detection failed",
].filter((failure): failure is string => Boolean(failure));

for (const failure of failures) {
  console.error(`[ocr-provider] fail ${failure}`);
}

if (failures.length > 0) {
  process.exit(1);
}

console.log("[ocr-provider] ok client-supplied OCR and selected-region contracts validated");

function makeFile(originalName: string, mimeType: string): FileRecord {
  return {
    id: `file-${originalName}`,
    taskId: "task-ocr",
    projectId: "project-ocr",
    fileGroupId: `group-${originalName}`,
    originalName,
    mimeType,
    sizeBytes: 1200,
    storageBucket: "ocr-test",
    objectPath: originalName,
    version: 1,
    versionNumber: 1,
    versionLabel: "v1",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    uploadedBy: null,
    deletedAt: null,
    purgedAt: null,
    metadata: {},
  };
}
