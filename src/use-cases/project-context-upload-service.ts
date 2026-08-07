import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/domains/auth/types";
import { getActiveProjectContextRuleSet, type ProjectContextRuleSet } from "@/domains/project-context/policy";
import { badRequest, unprocessable } from "@/lib/api/errors";
import { requireProjectEditor } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";
import {
  deleteProjectContextRawObject,
  encodeProjectContextRawStorageKey,
  storeProjectContextRawBytes,
} from "@/use-cases/project-context-raw-storage";

export const projectContextUploadRejectionCodes = [
  "mime_extension_mismatch",
  "signature_mismatch",
  "encrypted_file",
  "damaged_file",
  "unsupported_file",
  "quota_exceeded",
  "file_too_large",
] as const;

export type ProjectContextUploadRejectionCode = (typeof projectContextUploadRejectionCodes)[number];

export type ProjectContextUploadFileKind = "pdf" | "docx" | "xlsx" | "markdown" | "csv" | "text";

export type ProjectContextUploadFileValidationInput = {
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  signatureBytes?: Uint8Array;
  policy?: ProjectContextRuleSet;
};

export type ProjectContextUploadFileValidationResult =
  | {
      accepted: true;
      extension: string;
      fileKind: ProjectContextUploadFileKind;
      normalizedMimeType: string;
      parserVersion: string;
    }
  | {
      accepted: false;
      code: ProjectContextUploadRejectionCode;
      reason: string;
    };

export type ProjectContextUploadBatchValidationInput = {
  filesPerUpload: number;
  filesPerProjectAfterUpload: number;
  policy?: ProjectContextRuleSet;
};

export type CreateProjectContextUploadInput = {
  projectId: string;
  user: AuthUser;
  uploadedTaskId?: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  bytes: Uint8Array;
};

export type ProjectContextUploadRecord = {
  sourceId: string;
  versionId: string;
  uploadId: string;
  projectId: string;
  uploadedTaskId: string | null;
  uploadedByUserId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: "uploaded";
  rawRetentionUntil: string;
  rawDeletionStatus: "pending";
  normalizationRuleVersion: string;
  parserVersion: string;
};

const extensionMimeTypes: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".md": ["text/markdown", "text/plain"],
  ".csv": ["text/csv"],
  ".txt": ["text/plain"],
};

const extensionKinds: Record<string, ProjectContextUploadFileKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".md": "markdown",
  ".csv": "csv",
  ".txt": "text",
};

export function validateProjectContextUploadBatch(
  input: ProjectContextUploadBatchValidationInput,
): ProjectContextUploadFileValidationResult {
  const policy = input.policy ?? getActiveProjectContextRuleSet();
  if (input.filesPerUpload < 1 || input.filesPerUpload > policy.maxFilesPerUpload) {
    return {
      accepted: false,
      code: "quota_exceeded",
      reason: `Upload batch must include 1-${policy.maxFilesPerUpload} files.`,
    };
  }
  if (input.filesPerProjectAfterUpload > policy.maxFilesPerProject) {
    return {
      accepted: false,
      code: "quota_exceeded",
      reason: `Project material count exceeds ${policy.maxFilesPerProject}.`,
    };
  }

  return {
    accepted: true,
    extension: ".txt",
    fileKind: "text",
    normalizedMimeType: "text/plain",
    parserVersion: policy.parserVersions.text,
  };
}

export function validateProjectContextUploadFile(
  input: ProjectContextUploadFileValidationInput,
): ProjectContextUploadFileValidationResult {
  const policy = input.policy ?? getActiveProjectContextRuleSet();
  const originalFilename = input.originalFilename.trim();
  const extension = getExtension(originalFilename);
  const normalizedMimeType = normalizeMimeType(input.mimeType);
  const allowedMimeTypes = extensionMimeTypes[extension];
  const fileKind = extensionKinds[extension];

  if (!originalFilename || !extension || !allowedMimeTypes || !fileKind) {
    return {
      accepted: false,
      code: "unsupported_file",
      reason: "Project context upload file extension is not supported.",
    };
  }
  if (!policy.supportedExtensions.includes(extension) || !policy.supportedMimeTypes.includes(normalizedMimeType)) {
    return {
      accepted: false,
      code: "unsupported_file",
      reason: "Project context upload MIME type is not supported.",
    };
  }
  if (!allowedMimeTypes.includes(normalizedMimeType)) {
    return {
      accepted: false,
      code: "mime_extension_mismatch",
      reason: "Project context upload MIME type does not match the file extension.",
    };
  }
  if (input.fileSizeBytes <= 0) {
    return {
      accepted: false,
      code: "damaged_file",
      reason: "Project context upload file is empty or damaged.",
    };
  }
  if (input.fileSizeBytes > policy.maxFileSizeBytes) {
    return {
      accepted: false,
      code: "file_too_large",
      reason: `Project context upload exceeds ${policy.maxFileSizeBytes} bytes.`,
    };
  }

  const signatureResult = validateSignature(fileKind, input.signatureBytes ?? new Uint8Array());
  if (!signatureResult.accepted) {
    return signatureResult;
  }

  return {
    accepted: true,
    extension,
    fileKind,
    normalizedMimeType,
    parserVersion: policy.parserVersions[fileKind],
  };
}

export async function createProjectContextUpload(input: CreateProjectContextUploadInput): Promise<ProjectContextUploadRecord> {
  const policy = getActiveProjectContextRuleSet();
  await requireProjectEditor(input.projectId, input.user);

  const batchValidation = validateProjectContextUploadBatch({
    filesPerUpload: 1,
    filesPerProjectAfterUpload: await countProjectUploadSources(input.projectId) + 1,
    policy,
  });
  if (!batchValidation.accepted) {
    throw unprocessable(batchValidation.reason, `PROJECT_CONTEXT_UPLOAD_${batchValidation.code.toUpperCase()}`);
  }

  const fileValidation = validateProjectContextUploadFile({
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    signatureBytes: input.bytes,
    policy,
  });
  if (!fileValidation.accepted) {
    throw unprocessable(fileValidation.reason, `PROJECT_CONTEXT_UPLOAD_${fileValidation.code.toUpperCase()}`);
  }

  if (input.uploadedTaskId) {
    await assertUploadedTaskBelongsToProject(input.projectId, input.uploadedTaskId);
  }

  const sourceId = randomUUID();
  const versionId = randomUUID();
  const uploadId = randomUUID();
  const rawRetentionUntil = new Date(Date.now() + policy.rawRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const contentHash = hashProjectContextUploadBytes(input.bytes);
  const originalFilename = input.originalFilename.trim();
  const canonicalTitle = originalFilename;
  const uploadedTaskSql = input.uploadedTaskId ? Prisma.sql`${input.uploadedTaskId}::uuid` : Prisma.sql`null`;
  const rawStorageReference = await storeProjectContextRawBytes({
    projectId: input.projectId,
    uploadId,
    originalFilename,
    mimeType: fileValidation.normalizedMimeType,
    bytes: input.bytes,
  });
  const rawStorageKey = encodeProjectContextRawStorageKey(rawStorageReference);

  const [row] = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        insert into project_upload_source (
          source_id,
          project_id,
          canonical_title,
          source_type,
          authority_type,
          created_by_user_id
        )
        values (
          ${sourceId}::uuid,
          ${input.projectId}::uuid,
          ${canonicalTitle},
          ${fileValidation.fileKind},
          'project_context',
          ${input.user.id}::uuid
        )
      `);

      await tx.$executeRaw(Prisma.sql`
        insert into project_upload_version (
          version_id,
          source_id,
          project_id,
          content_hash,
          version_no,
          status,
          normalization_rule_version,
          parser_version
        )
        values (
          ${versionId}::uuid,
          ${sourceId}::uuid,
          ${input.projectId}::uuid,
          ${contentHash},
          1,
          'uploaded',
          ${policy.id},
          ${fileValidation.parserVersion}
        )
      `);

      return tx.$queryRaw<ProjectContextUploadSqlRow[]>(Prisma.sql`
        insert into upload_reference (
          upload_id,
          project_id,
          source_id,
          version_id,
          uploaded_task_id,
          uploaded_by_user_id,
          raw_storage_key,
          raw_retention_until,
          raw_deletion_status,
          original_filename,
          mime_type,
          file_size_bytes,
          malware_scan_status
        )
        values (
          ${uploadId}::uuid,
          ${input.projectId}::uuid,
          ${sourceId}::uuid,
          ${versionId}::uuid,
          ${uploadedTaskSql},
          ${input.user.id}::uuid,
          ${rawStorageKey},
          ${rawRetentionUntil}::timestamptz,
          'pending',
          ${originalFilename},
          ${fileValidation.normalizedMimeType},
          ${input.fileSizeBytes},
          'pending'
        )
        returning
          upload_id,
          project_id,
          source_id,
          version_id,
          uploaded_task_id,
          uploaded_by_user_id,
          raw_retention_until,
          raw_deletion_status,
          original_filename,
          mime_type,
          file_size_bytes
      `);
    })
    .catch(async (error) => {
      await deleteProjectContextRawObject(rawStorageKey).catch(() => {});
      throw error;
    });

  if (!row) {
    await deleteProjectContextRawObject(rawStorageKey).catch(() => {});
    throw badRequest("Project context upload could not be created.", "PROJECT_CONTEXT_UPLOAD_CREATE_FAILED");
  }

  return {
    sourceId: row.source_id,
    versionId: row.version_id,
    uploadId: row.upload_id,
    projectId: row.project_id,
    uploadedTaskId: row.uploaded_task_id,
    uploadedByUserId: row.uploaded_by_user_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    status: "uploaded",
    rawRetentionUntil: row.raw_retention_until instanceof Date ? row.raw_retention_until.toISOString() : String(row.raw_retention_until),
    rawDeletionStatus: "pending",
    normalizationRuleVersion: policy.id,
    parserVersion: fileValidation.parserVersion,
  };
}

export function hashProjectContextUploadBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function countProjectUploadSources(projectId: string): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    select count(*)::bigint as count
    from project_upload_source
    where project_id = ${projectId}::uuid
  `);

  return Number(row?.count ?? 0n);
}

async function assertUploadedTaskBelongsToProject(projectId: string, uploadedTaskId: string): Promise<void> {
  const [row] = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    select exists (
      select 1
      from tasks
      where id = ${uploadedTaskId}::uuid
        and project_id = ${projectId}::uuid
        and deleted_at is null
        and purged_at is null
    ) as "exists"
  `);

  if (!row?.exists) {
    throw badRequest("uploadedTaskId must belong to the project.", "PROJECT_CONTEXT_UPLOAD_TASK_PROJECT_MISMATCH");
  }
}

function validateSignature(
  fileKind: ProjectContextUploadFileKind,
  bytes: Uint8Array,
): ProjectContextUploadFileValidationResult | { accepted: true } {
  if (bytes.length === 0) {
    return { accepted: true };
  }

  if (fileKind === "pdf") {
    if (!startsWithAscii(bytes, "%PDF-")) {
      return {
        accepted: false,
        code: "signature_mismatch",
        reason: "PDF upload signature does not match application/pdf.",
      };
    }
    if (asciiPreview(bytes).includes("/Encrypt")) {
      return {
        accepted: false,
        code: "encrypted_file",
        reason: "Encrypted PDF uploads are not supported for project context extraction.",
      };
    }
    return { accepted: true };
  }

  if (fileKind === "docx" || fileKind === "xlsx") {
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return {
        accepted: false,
        code: bytes.length < 4 ? "damaged_file" : "signature_mismatch",
        reason: "Office document upload signature does not match a ZIP container.",
      };
    }
    return { accepted: true };
  }

  if (startsWithAscii(bytes, "%PDF-") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return {
      accepted: false,
      code: "signature_mismatch",
      reason: "Text upload signature does not match the declared MIME type.",
    };
  }

  return { accepted: true };
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase().split(";")[0] ?? "";
}

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

function startsWithAscii(bytes: Uint8Array, expected: string): boolean {
  if (bytes.length < expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[index] !== expected.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function asciiPreview(bytes: Uint8Array): string {
  return Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096))).toString("latin1");
}

type ProjectContextUploadSqlRow = {
  upload_id: string;
  project_id: string;
  source_id: string;
  version_id: string;
  uploaded_task_id: string | null;
  uploaded_by_user_id: string;
  raw_retention_until: Date | string;
  raw_deletion_status: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: bigint | number;
};
