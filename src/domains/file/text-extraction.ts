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
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const PDF_TEXT_STREAM_PATTERN = /BT[\s\S]*?ET/g;

export async function extractTextFromStoredFile(file: FileRecord, content: Uint8Array): Promise<FileTextExtractionResult> {
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
      text: await extractXlsxText(content),
      tags: ["auto-extracted", "xlsx", "spreadsheet"],
    });
  }

  if (extension === "docx" || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return buildExtractionResult({
      file,
      format: "DOCX",
      text: extractDocxText(content),
      tags: ["auto-extracted", "docx", "document"],
    });
  }

  if (extension === "pdf" || contentType === "application/pdf") {
    return buildExtractionResult({
      file,
      format: "PDF",
      text: extractPdfText(content),
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

async function extractXlsxText(content: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  const workbookInput = Buffer.from(content) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookInput);

  const chunks: string[] = [];
  for (const worksheet of workbook.worksheets) {
    chunks.push(`# Sheet: ${worksheet.name}`);
    let capturedRows = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
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

function extractDocxText(content: Uint8Array) {
  const archive = Buffer.from(content);
  const partNames = [
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
    "word/header1.xml",
    "word/footer1.xml",
  ];
  const parts = partNames.map((partName) => readZipEntryText(archive, partName)).filter(Boolean);
  return parts.map(wordXmlToText).filter(Boolean).join("\n");
}

function readZipEntryText(archive: Buffer, entryName: string) {
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
  const compressed = archive.subarray(dataOffset, dataOffset + entry.compressedSize);
  const inflated = entry.compressionMethod === 8 ? inflateRawSync(compressed) : compressed;
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

  while (offset < end && archive.readUInt32LE(offset) === ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileName = archive.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      return { compressionMethod, compressedSize, localHeaderOffset };
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(archive: Buffer) {
  const minimumOffset = Math.max(0, archive.length - 65557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function wordXmlToText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:br\s*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, ""),
  );
}

function extractPdfText(content: Uint8Array) {
  const pdf = Buffer.from(content);
  const streamTexts = extractPdfStreamTexts(pdf);
  const fallbackText = streamTexts.length > 0 ? "" : extractPdfTextOperators(pdf.toString("latin1"));
  return [...streamTexts, fallbackText].filter(Boolean).join("\n");
}

function extractPdfStreamTexts(pdf: Buffer) {
  const document = pdf.toString("latin1");
  const texts: string[] = [];
  let searchOffset = 0;

  while (searchOffset < document.length) {
    const streamStart = document.indexOf("stream", searchOffset);
    if (streamStart < 0) {
      break;
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
    return stream.toString("latin1");
  }

  if (dictionary.includes("/FlateDecode") || dictionary.includes("/Fl")) {
    try {
      return inflateSync(stream).toString("latin1");
    } catch {
      try {
        return inflateRawSync(stream).toString("latin1");
      } catch {
        return "";
      }
    }
  }

  return "";
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
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
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
