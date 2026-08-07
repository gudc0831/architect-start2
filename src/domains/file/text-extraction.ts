import ExcelJS from "exceljs";
import { extname } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { resolveFileContentType } from "@/domains/file/metadata";
import type { FileRecord } from "@/domains/task/types";
import { unprocessable } from "@/lib/api/errors";

export type FileTextExtractionResult = {
  extractedText: string;
  summary: string;
  tags: string[];
  confidenceWeight: number;
};

const MAX_EXTRACTED_TEXT_LENGTH = 12000;
const MAX_SUMMARY_LENGTH = 600;
const MAX_XLSX_ROWS_PER_SHEET = 120;
const MAX_XLSX_CELLS_PER_ROW = 30;
const MAX_EXTRACTION_TIME_MS = 5_000;
const MAX_ZIP_ENTRIES = 2_048;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_PDF_STREAMS = 256;
const MAX_PDF_DECOMPRESSED_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_PDF_TOTAL_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const PDF_TEXT_STREAM_PATTERN = /BT[\s\S]*?ET/g;

export async function extractTextFromStoredFile(file: FileRecord, content: Uint8Array): Promise<FileTextExtractionResult> {
  const startedAt = Date.now();
  const extension = extname(file.originalName).replace(/^\./, "").toLowerCase();
  const contentType = resolveFileContentType(file).split(";")[0]?.trim().toLowerCase() ?? "";

  if (extension === "txt" || extension === "csv" || contentType === "text/plain" || contentType === "text/csv") {
    return buildExtractionResult({
      file,
      format: extension === "csv" || contentType === "text/csv" ? "CSV" : "TXT",
      text: decodeUtf8(content),
      tags: ["auto-extracted", extension || "text"],
    });
  }

  if (
    extension === "xlsx" ||
    contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return buildExtractionResult({
      file,
      format: "XLSX",
      text: await extractXlsxText(content, startedAt),
      tags: ["auto-extracted", "xlsx", "spreadsheet"],
    });
  }

  if (extension === "docx" || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return buildExtractionResult({
      file,
      format: "DOCX",
      text: extractDocxText(content, startedAt),
      tags: ["auto-extracted", "docx", "document"],
    });
  }

  if (extension === "pdf" || contentType === "application/pdf") {
    return buildExtractionResult({
      file,
      format: "PDF",
      text: extractPdfText(content, startedAt),
      tags: ["auto-extracted", "pdf", "text-pdf"],
    });
  }

  throw unprocessable(
    "Automatic text extraction currently supports TXT, CSV, XLSX, DOCX, and text-based PDF files. Scanned PDF images and OCR need provider-backed extraction.",
    "FILE_AUTO_EXTRACTION_UNSUPPORTED",
  );
}

function buildExtractionResult(input: {
  file: FileRecord;
  format: string;
  text: string;
  tags: string[];
}): FileTextExtractionResult {
  const extractedText = clampText(normalizeExtractedText(input.text), MAX_EXTRACTED_TEXT_LENGTH);
  if (!extractedText) {
    throw unprocessable("No text could be extracted from this file.", "FILE_AUTO_EXTRACTION_EMPTY");
  }

  return {
    extractedText,
    summary: summarizeExtraction(input.file.originalName, input.format, extractedText),
    tags: input.tags,
    confidenceWeight: 0.48,
  };
}

function decodeUtf8(content: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(content);
}

async function extractXlsxText(content: Uint8Array, startedAt: number) {
  assertZipArchiveIsWithinResourceLimits(Buffer.from(content), startedAt);
  const workbook = new ExcelJS.Workbook();
  const workbookInput = Buffer.from(content) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookInput);
  assertExtractionDeadline(startedAt);

  const chunks: string[] = [];
  for (const worksheet of workbook.worksheets) {
    assertExtractionDeadline(startedAt);
    chunks.push(`# Sheet: ${worksheet.name}`);
    let capturedRows = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      assertExtractionDeadline(startedAt);
      if (capturedRows >= MAX_XLSX_ROWS_PER_SHEET) {
        return;
      }

      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (columnNumber > MAX_XLSX_CELLS_PER_ROW) {
          return;
        }

        const value = normalizeCellText(cell.text || String(cell.value ?? ""));
        if (value) {
          values.push(value);
        }
      });

      if (values.length > 0) {
        chunks.push(`Row ${rowNumber}: ${values.join(" | ")}`);
        capturedRows += 1;
      }
    });
  }

  return chunks.join("\n");
}

function extractDocxText(content: Uint8Array, startedAt: number) {
  const archive = Buffer.from(content);
  assertZipArchiveIsWithinResourceLimits(archive, startedAt);
  const partNames = [
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
    "word/header1.xml",
    "word/footer1.xml",
  ];
  const parts = partNames.map((partName) => readZipEntryText(archive, partName, startedAt)).filter(Boolean);
  return parts.map(wordXmlToText).filter(Boolean).join("\n");
}

function readZipEntryText(archive: Buffer, entryName: string, startedAt: number) {
  assertExtractionDeadline(startedAt);
  const entry = findZipEntry(archive, entryName);
  if (!entry) {
    return "";
  }

  const localHeaderOffset = entry.localHeaderOffset;
  if (
    localHeaderOffset < 0 ||
    localHeaderOffset + 30 > archive.length ||
    archive.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    return "";
  }

  const fileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  if (dataOffset < 0 || dataOffset + entry.compressedSize > archive.length) {
    throw unprocessable("Compressed document entry is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }
  const compressed = archive.subarray(dataOffset, dataOffset + entry.compressedSize);
  let inflated: Buffer;
  try {
    inflated =
      entry.compressionMethod === 8
        ? inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES })
        : compressed;
  } catch (error) {
    if (isInflateOutputLimitError(error)) {
      throwExtractionResourceLimit("Compressed document entry exceeds the allowed size.");
    }
    throw unprocessable("Compressed document entry is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }
  if (inflated.byteLength > entry.uncompressedSize || inflated.byteLength > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
    throwExtractionResourceLimit("Compressed document entry exceeded its declared or allowed size.");
  }
  assertExtractionDeadline(startedAt);
  return inflated.toString("utf8");
}

function findZipEntry(archive: Buffer, entryName: string) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  if (eocdOffset < 0) {
    return null;
  }

  const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset + 46 <= end && offset + 46 <= archive.length && archive.readUInt32LE(offset) === ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
    if (nextOffset > end || nextOffset > archive.length) {
      return null;
    }
    const fileName = archive.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      return { compressionMethod, compressedSize, uncompressedSize, localHeaderOffset };
    }

    offset = nextOffset;
  }

  return null;
}

function assertZipArchiveIsWithinResourceLimits(archive: Buffer, startedAt: number) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  if (eocdOffset < 0 || eocdOffset + 22 > archive.length) {
    throw unprocessable("Compressed document archive is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    entryCount > MAX_ZIP_ENTRIES ||
    centralDirectoryOffset < 0 ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd > archive.length
  ) {
    throwExtractionResourceLimit("Compressed document archive exceeds entry or directory limits.");
  }

  let offset = centralDirectoryOffset;
  let inspectedEntries = 0;
  let totalUncompressedBytes = 0;
  while (inspectedEntries < entryCount) {
    assertExtractionDeadline(startedAt);
    if (
      offset + 46 > centralDirectoryEnd ||
      archive.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw unprocessable("Compressed document central directory is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
    }

    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const generalPurposeFlags = archive.readUInt16LE(offset + 8);
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
    if ((generalPurposeFlags & 0x1) !== 0 || (compressionMethod !== 0 && compressionMethod !== 8)) {
      throw unprocessable("Encrypted or unsupported compressed document entries are not allowed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
    }
    if (
      uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES ||
      nextOffset > centralDirectoryEnd
    ) {
      throwExtractionResourceLimit("Compressed document archive exceeds expansion limits.");
    }

    const actualUncompressedSize = validateZipEntryExpansion({
      archive,
      localHeaderOffset,
      compressionMethod,
      compressedSize,
      declaredUncompressedSize: uncompressedSize,
      startedAt,
    });
    const compressionRatio = actualUncompressedSize / Math.max(1, compressedSize);
    totalUncompressedBytes += actualUncompressedSize;
    if (
      totalUncompressedBytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES ||
      compressionRatio > MAX_ZIP_COMPRESSION_RATIO
    ) {
      throwExtractionResourceLimit("Compressed document archive exceeds expansion limits.");
    }

    offset = nextOffset;
    inspectedEntries += 1;
  }

  if (offset !== centralDirectoryEnd) {
    throw unprocessable("Compressed document central directory is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }
}

function validateZipEntryExpansion(input: {
  archive: Buffer;
  localHeaderOffset: number;
  compressionMethod: number;
  compressedSize: number;
  declaredUncompressedSize: number;
  startedAt: number;
}) {
  if (
    input.localHeaderOffset < 0 ||
    input.localHeaderOffset + 30 > input.archive.length ||
    input.archive.readUInt32LE(input.localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE
  ) {
    throw unprocessable("Compressed document local entry is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }

  const localCompressionMethod = input.archive.readUInt16LE(input.localHeaderOffset + 8);
  const fileNameLength = input.archive.readUInt16LE(input.localHeaderOffset + 26);
  const extraLength = input.archive.readUInt16LE(input.localHeaderOffset + 28);
  const dataOffset = input.localHeaderOffset + 30 + fileNameLength + extraLength;
  if (
    localCompressionMethod !== input.compressionMethod ||
    dataOffset < 0 ||
    dataOffset + input.compressedSize > input.archive.length
  ) {
    throw unprocessable("Compressed document local entry is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }

  const compressed = input.archive.subarray(dataOffset, dataOffset + input.compressedSize);
  let expanded: Buffer;
  try {
    expanded =
      input.compressionMethod === 8
        ? inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES })
        : compressed;
  } catch (error) {
    if (isInflateOutputLimitError(error)) {
      throwExtractionResourceLimit("Compressed document entry exceeds the allowed size.");
    }
    throw unprocessable("Compressed document entry is malformed.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }

  assertExtractionDeadline(input.startedAt);
  if (expanded.byteLength !== input.declaredUncompressedSize) {
    throw unprocessable("Compressed document entry size does not match its directory.", "FILE_AUTO_EXTRACTION_ARCHIVE_INVALID");
  }
  return expanded.byteLength;
}

function findEndOfCentralDirectory(archive: Buffer) {
  if (archive.length < 22) {
    return -1;
  }
  const minimumOffset = Math.max(0, archive.length - 65557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function wordXmlToText(xml: string) {
  return decodeXmlEntities(stripWordXmlMarkup(xml));
}

function stripWordXmlMarkup(xml: string) {
  let output = "";
  let offset = 0;

  while (offset < xml.length) {
    if (xml[offset] !== "<") {
      output += xml[offset];
      offset += 1;
      continue;
    }

    const close = xml.indexOf(">", offset + 1);
    if (close < 0) {
      break;
    }

    output += wordTagTextSeparator(xml.slice(offset + 1, close));
    offset = close + 1;
  }

  return output;
}

function wordTagTextSeparator(rawTag: string) {
  const tag = rawTag.trim().toLowerCase();
  const closing = tag.startsWith("/");
  const normalized = closing ? tag.slice(1).trimStart() : tag;
  const tagName = normalized.split(/\s+/, 1)[0]?.replace(/\/$/, "") ?? "";

  if (tagName === "w:tab") {
    return "\t";
  }
  if (tagName === "w:br") {
    return "\n";
  }
  if (closing && (tagName === "w:p" || tagName === "w:tr")) {
    return "\n";
  }
  if (closing && tagName === "w:tc") {
    return "\t";
  }

  return "";
}

function extractPdfText(content: Uint8Array, startedAt: number) {
  const pdf = Buffer.from(content);
  const streamTexts = extractPdfStreamTexts(pdf, startedAt);
  const fallbackText = streamTexts.length > 0 ? "" : extractPdfTextOperators(pdf.toString("latin1"));
  assertExtractionDeadline(startedAt);
  return [...streamTexts, fallbackText].filter(Boolean).join("\n");
}

function extractPdfStreamTexts(pdf: Buffer, startedAt: number) {
  const document = pdf.toString("latin1");
  const texts: string[] = [];
  let searchOffset = 0;
  let streamCount = 0;
  let totalDecompressedBytes = 0;

  while (searchOffset < document.length) {
    assertExtractionDeadline(startedAt);
    const streamStart = document.indexOf("stream", searchOffset);
    if (streamStart < 0) {
      break;
    }
    streamCount += 1;
    if (streamCount > MAX_PDF_STREAMS) {
      throwExtractionResourceLimit("PDF contains too many streams.");
    }

    const dataStart = skipPdfLineBreak(document, streamStart + "stream".length);
    const streamEnd = document.indexOf("endstream", dataStart);
    if (streamEnd < 0) {
      break;
    }

    const dictionaryStart = Math.max(0, streamStart - 600);
    const dictionary = document.slice(dictionaryStart, streamStart);
    const rawStream = pdf.subarray(dataStart, trimPdfStreamEnd(document, dataStart, streamEnd));
    const streamText = decodePdfStream(rawStream, dictionary);
    totalDecompressedBytes += Buffer.byteLength(streamText, "latin1");
    if (totalDecompressedBytes > MAX_PDF_TOTAL_DECOMPRESSED_BYTES) {
      throwExtractionResourceLimit("PDF decompressed stream total exceeds the allowed limit.");
    }
    const extracted = streamText ? extractPdfTextOperators(streamText) : "";
    if (extracted) {
      texts.push(extracted);
    }

    searchOffset = streamEnd + "endstream".length;
  }

  return texts;
}

function skipPdfLineBreak(document: string, offset: number) {
  if (document[offset] === "\r" && document[offset + 1] === "\n") {
    return offset + 2;
  }
  if (document[offset] === "\n" || document[offset] === "\r") {
    return offset + 1;
  }
  return offset;
}

function trimPdfStreamEnd(document: string, dataStart: number, streamEnd: number) {
  let end = streamEnd;
  while (end > dataStart && (document[end - 1] === "\n" || document[end - 1] === "\r")) {
    end -= 1;
  }
  return end;
}

function decodePdfStream(stream: Buffer, dictionary: string) {
  if (!dictionary.includes("/Filter")) {
    if (stream.byteLength > MAX_PDF_DECOMPRESSED_STREAM_BYTES) {
      throwExtractionResourceLimit("PDF stream exceeds the allowed size.");
    }
    return stream.toString("latin1");
  }

  if (dictionary.includes("/FlateDecode") || dictionary.includes("/Fl")) {
    try {
      return inflateSync(stream, { maxOutputLength: MAX_PDF_DECOMPRESSED_STREAM_BYTES }).toString("latin1");
    } catch (error) {
      if (isInflateOutputLimitError(error)) {
        throwExtractionResourceLimit("PDF decompressed stream exceeds the allowed size.");
      }
      try {
        return inflateRawSync(stream, { maxOutputLength: MAX_PDF_DECOMPRESSED_STREAM_BYTES }).toString("latin1");
      } catch (fallbackError) {
        if (isInflateOutputLimitError(fallbackError)) {
          throwExtractionResourceLimit("PDF decompressed stream exceeds the allowed size.");
        }
        return "";
      }
    }
  }

  return "";
}

function isInflateOutputLimitError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : "";
  return code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than.*Buffer/i.test(message);
}

function assertExtractionDeadline(startedAt: number) {
  if (Date.now() - startedAt > MAX_EXTRACTION_TIME_MS) {
    throwExtractionResourceLimit("Document extraction exceeded the allowed processing time.");
  }
}

function throwExtractionResourceLimit(reason: string): never {
  throw unprocessable(reason, "FILE_AUTO_EXTRACTION_RESOURCE_LIMIT");
}

function extractPdfTextOperators(value: string) {
  const chunks: string[] = [];
  const textStreams = value.match(PDF_TEXT_STREAM_PATTERN) ?? [value];

  for (const stream of textStreams) {
    for (const literal of extractPdfLiteralStrings(stream)) {
      const decoded = decodePdfLiteralString(literal);
      if (decoded) {
        chunks.push(decoded);
      }
    }

    for (const hex of stream.match(/<([0-9a-fA-F\s]{4,})>/g) ?? []) {
      const decoded = decodePdfHexString(hex.slice(1, -1));
      if (decoded) {
        chunks.push(decoded);
      }
    }
  }

  return chunks.join("\n");
}

function extractPdfLiteralStrings(value: string) {
  const matches: string[] = [];
  let depth = 0;
  let current = "";
  let escaped = false;

  for (const char of value) {
    if (depth > 0) {
      if (escaped) {
        current += `\\${char}`;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "(") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          matches.push(current);
          current = "";
        } else {
          current += char;
        }
        continue;
      }
      current += char;
      continue;
    }

    if (char === "(") {
      depth = 1;
      current = "";
    }
  }

  return matches;
}

function decodePdfLiteralString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function decodePdfHexString(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 4 || compact.length % 2 !== 0) {
    return "";
  }

  const bytes = Buffer.from(compact, "hex");
  const decoded =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? bytes.subarray(2).swap16().toString("utf16le")
      : bytes.toString("latin1");
  return decoded.replace(/[^\S\r\n]+/g, " ").trim();
}

function normalizeCellText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string) {
  return value.replace(/&(lt|gt|amp|quot|apos);/g, (_match, entity: string) => {
    switch (entity) {
      case "lt":
        return "‹";
      case "gt":
        return "›";
      case "amp":
        return "&";
      case "quot":
        return "\"";
      case "apos":
        return "'";
      default:
        return "";
    }
  });
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function summarizeExtraction(fileName: string, format: string, extractedText: string) {
  const firstLine = extractedText.split("\n").find(Boolean) ?? "";
  const summary = `Auto-extracted ${format} text from ${fileName}. First content: ${firstLine}`;
  return clampText(summary, MAX_SUMMARY_LENGTH);
}
