import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { resolveFileContentType } from "@/domains/file/metadata";
import { normalizeFileAnalysisRegion, type FileAnalysisRegion, type FileAnalysisSourceType } from "@/domains/file/analysis";
import type { FileRecord } from "@/domains/task/types";
import { serviceUnavailable, unprocessable } from "@/lib/api/errors";

const execFileAsync = promisify(execFile);
const MAX_OCR_TEXT_LENGTH = 12000;
const MAX_OCR_SUMMARY_LENGTH = 600;

export type OcrProvider = "client_supplied" | "tesseract_cli";

export type OcrAnalysisInput = {
  sourceType?: unknown;
  extractedText?: unknown;
  summary?: unknown;
  tags?: unknown;
  provider?: unknown;
  language?: unknown;
  region?: unknown;
};

export type OcrAnalysisResult = {
  sourceType: FileAnalysisSourceType;
  extractedText: string;
  summary: string;
  tags: string[];
  confidenceWeight: number;
  provider: string;
  providerStatus: "client_supplied" | "provider_extracted";
  region?: FileAnalysisRegion;
};

export function buildClientSuppliedOcrAnalysis(file: FileRecord, input: OcrAnalysisInput): OcrAnalysisResult {
  const sourceType = normalizeOcrSourceType(input.sourceType);
  const extractedText = clampText(normalizeText(input.extractedText), MAX_OCR_TEXT_LENGTH);
  const summary = clampText(normalizeText(input.summary) || summarizeOcr(file.originalName, sourceType, extractedText), MAX_OCR_SUMMARY_LENGTH);
  if (!extractedText && !summary) {
    throw unprocessable("OCR text or image-region summary is required.", "FILE_OCR_TEXT_REQUIRED");
  }

  return {
    sourceType,
    extractedText,
    summary,
    tags: normalizeOcrTags(input.tags, sourceType, "client-supplied"),
    confidenceWeight: sourceType === "image_region" ? 0.3 : 0.32,
    provider: "client_supplied",
    providerStatus: "client_supplied",
    region: normalizeFileAnalysisRegion(input.region),
  };
}

export async function extractOcrFromStoredFile(
  file: FileRecord,
  content: Uint8Array,
  input: OcrAnalysisInput = {},
): Promise<OcrAnalysisResult> {
  if (normalizeText(input.extractedText) || normalizeText(input.summary)) {
    return buildClientSuppliedOcrAnalysis(file, input);
  }

  const provider = normalizeProvider(input.provider);
  if (provider !== "tesseract_cli") {
    throw serviceUnavailable(
      "OCR provider is not configured. Set FILE_OCR_PROVIDER=tesseract_cli and install Tesseract, or save user-reviewed OCR text manually.",
      "FILE_OCR_PROVIDER_UNCONFIGURED",
    );
  }

  const fileKind = resolveOcrFileKind(file);
  if (fileKind === "pdf") {
    const rasterized = await rasterizePdfPage(file, content, input);
    const text = await runTesseract(file, rasterized, normalizeLanguage(input.language), "png");
    return buildProviderOcrResult(file, text, input, "pdf-raster");
  }
  if (fileKind !== "image") {
    throw unprocessable("OCR currently supports PNG/JPG image files and scanned PDF region text.", "FILE_OCR_UNSUPPORTED_FILE");
  }

  const text = await runTesseract(file, content, normalizeLanguage(input.language));
  return buildProviderOcrResult(file, text, input, "tesseract");
}

export async function extractOcrFromImageContent(
  file: FileRecord,
  content: Uint8Array,
  input: OcrAnalysisInput = {},
): Promise<OcrAnalysisResult> {
  if (normalizeText(input.extractedText) || normalizeText(input.summary)) {
    return buildClientSuppliedOcrAnalysis(file, input);
  }

  const provider = normalizeProvider(input.provider);
  if (provider !== "tesseract_cli") {
    throw serviceUnavailable(
      "OCR provider is not configured. Set FILE_OCR_PROVIDER=tesseract_cli and install Tesseract, or save user-reviewed OCR text manually.",
      "FILE_OCR_PROVIDER_UNCONFIGURED",
    );
  }

  const text = await runTesseract(file, content, normalizeLanguage(input.language), "png");
  return buildProviderOcrResult(file, text, input, "image-crop");
}

function buildProviderOcrResult(
  file: FileRecord,
  text: string,
  input: OcrAnalysisInput,
  providerTag: string,
): OcrAnalysisResult {
  const extractedText = clampText(normalizeText(text), MAX_OCR_TEXT_LENGTH);
  if (!extractedText) {
    throw unprocessable("OCR provider returned no text.", "FILE_OCR_EMPTY");
  }

  const sourceType = normalizeOcrSourceType(input.sourceType);
  return {
    sourceType,
    extractedText,
    summary: summarizeOcr(file.originalName, sourceType, extractedText),
    tags: normalizeOcrTags(input.tags, sourceType, providerTag),
    confidenceWeight: sourceType === "image_region" ? 0.3 : 0.34,
    provider: "tesseract_cli",
    providerStatus: "provider_extracted",
    region: normalizeFileAnalysisRegion(input.region),
  };
}

export function resolveOcrFileKind(file: FileRecord): "image" | "pdf" | "other" {
  const extension = extname(file.originalName).replace(/^\./, "").toLowerCase();
  const contentType = resolveFileContentType(file).split(";")[0]?.trim().toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(extension) || contentType === "image/png" || contentType === "image/jpeg") {
    return "image";
  }
  if (extension === "pdf" || contentType === "application/pdf") {
    return "pdf";
  }
  return "other";
}

function normalizeProvider(value: unknown): OcrProvider | null {
  const configured = normalizeText(value) || normalizeText(process.env.FILE_OCR_PROVIDER);
  return configured === "tesseract_cli" ? "tesseract_cli" : null;
}

function normalizeOcrSourceType(value: unknown): FileAnalysisSourceType {
  return value === "image_region" ? "image_region" : "ocr_text";
}

function normalizeLanguage(value: unknown) {
  const normalized = normalizeText(value).replace(/[^a-zA-Z0-9_+-]/g, "");
  return normalized || normalizeText(process.env.FILE_OCR_LANGUAGE).replace(/[^a-zA-Z0-9_+-]/g, "") || "eng";
}

function normalizeOcrTags(value: unknown, sourceType: FileAnalysisSourceType, providerTag: string) {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : [];
  const tags = new Set<string>(["ocr", providerTag, sourceType === "image_region" ? "image-region" : "image-text"]);
  for (const rawTag of rawTags) {
    const tag = typeof rawTag === "string" ? rawTag.trim() : "";
    if (tag) {
      tags.add(tag.slice(0, 40));
    }
    if (tags.size >= 12) {
      break;
    }
  }
  return [...tags];
}

async function runTesseract(file: FileRecord, content: Uint8Array, language: string, extensionOverride?: string) {
  const extension = extensionOverride || extname(file.originalName).replace(/^\./, "").toLowerCase() || "png";
  const directory = await mkdtemp(join(tmpdir(), "architect-ocr-"));
  const imagePath = join(directory, `input.${extension === "jpeg" ? "jpg" : extension}`);
  try {
    await writeFile(imagePath, Buffer.from(content));
    const command = normalizeText(process.env.TESSERACT_CMD) || "tesseract";
    const { stdout } = await execFileAsync(command, [imagePath, "stdout", "-l", language], {
      maxBuffer: 1024 * 1024,
      timeout: 45000,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      throw serviceUnavailable("Tesseract CLI was not found on the server PATH.", "FILE_OCR_TESSERACT_NOT_FOUND");
    }
    throw serviceUnavailable("Tesseract OCR provider failed for this file.", "FILE_OCR_PROVIDER_FAILED");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function rasterizePdfPage(file: FileRecord, content: Uint8Array, input: OcrAnalysisInput) {
  const rasterizer = normalizePdfRasterizer();
  if (!rasterizer) {
    throw unprocessable(
      "Scanned PDF OCR needs a PDF rasterizer before Tesseract can run. Set FILE_PDF_RASTERIZER=pdftoppm and install Poppler, or save selected page OCR text manually.",
      "FILE_OCR_PDF_RASTERIZER_REQUIRED",
    );
  }

  const directory = await mkdtemp(join(tmpdir(), "architect-pdf-ocr-"));
  const pdfPath = join(directory, "input.pdf");
  const outputPrefix = join(directory, "page");
  const pageNumber = normalizeFileAnalysisRegion(input.region)?.pageNumber ?? 1;
  const dpi = normalizeRasterDpi(process.env.FILE_PDF_RASTER_DPI);

  try {
    await writeFile(pdfPath, Buffer.from(content));
    await execFileAsync(rasterizer.command, ["-f", String(pageNumber), "-l", String(pageNumber), "-png", "-r", String(dpi), pdfPath, outputPrefix], {
      maxBuffer: 1024 * 1024,
      timeout: 45000,
      windowsHide: true,
    });
    const output = await findRasterizedPng(directory);
    if (!output) {
      throw unprocessable("PDF rasterizer produced no image for the selected page.", "FILE_OCR_PDF_RASTER_EMPTY");
    }
    return new Uint8Array(await readFile(join(directory, output)));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      throw serviceUnavailable("PDF rasterizer command was not found on the server PATH.", "FILE_OCR_PDF_RASTERIZER_NOT_FOUND");
    }
    if (error && typeof error === "object" && "status" in error) {
      throw error;
    }
    throw serviceUnavailable(`PDF rasterizer failed for ${file.originalName}.`, "FILE_OCR_PDF_RASTERIZER_FAILED");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function findRasterizedPng(directory: string) {
  const files = await readdir(directory);
  return files.find((file) => /^page-\d+\.png$/i.test(file)) ?? files.find((file) => file.toLowerCase().endsWith(".png")) ?? null;
}

function normalizePdfRasterizer() {
  const configured = normalizeText(process.env.FILE_PDF_RASTERIZER);
  if (!configured) {
    return null;
  }
  if (configured !== "pdftoppm") {
    throw serviceUnavailable("Unsupported PDF rasterizer. Set FILE_PDF_RASTERIZER=pdftoppm.", "FILE_OCR_PDF_RASTERIZER_UNSUPPORTED");
  }
  return {
    command: normalizeText(process.env.PDF_RASTERIZER_CMD) || "pdftoppm",
  };
}

function normalizeRasterDpi(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 72 && numeric <= 600 ? numeric : 200;
}

function summarizeOcr(fileName: string, sourceType: FileAnalysisSourceType, extractedText: string) {
  const label = sourceType === "image_region" ? "selected image region" : "image OCR";
  const firstLine = extractedText.split("\n").find(Boolean) ?? "";
  return clampText(`OCR extracted ${label} text from ${fileName}. First content: ${firstLine}`, MAX_OCR_SUMMARY_LENGTH);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim() : "";
}

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
