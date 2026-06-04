import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hashProjectContextUploadBytes,
  projectContextUploadRejectionCodes,
  validateProjectContextUploadBatch,
  validateProjectContextUploadFile,
} from "../src/use-cases/project-context-upload-service";

const root = process.cwd();
const serviceSource = readFileSync(join(root, "src", "use-cases", "project-context-upload-service.ts"), "utf8");
const rawStorageSource = readFileSync(join(root, "src", "use-cases", "project-context-raw-storage.ts"), "utf8");
const routeSource = readFileSync(
  join(root, "src", "app", "api", "projects", "[projectId]", "materials", "uploads", "route.ts"),
  "utf8",
);

assert.deepEqual([...projectContextUploadRejectionCodes].sort(), [
  "damaged_file",
  "encrypted_file",
  "file_too_large",
  "mime_extension_mismatch",
  "quota_exceeded",
  "signature_mismatch",
  "unsupported_file",
].sort());

assert.equal(
  validateProjectContextUploadFile({
    originalFilename: "brief.txt",
    mimeType: "text/plain",
    fileSizeBytes: 12,
    signatureBytes: new TextEncoder().encode("project memo"),
  }).accepted,
  true,
);
assert.equal(
  validateProjectContextUploadFile({
    originalFilename: "brief.pdf",
    mimeType: "text/plain",
    fileSizeBytes: 12,
    signatureBytes: new TextEncoder().encode("project memo"),
  }).accepted,
  false,
);
assert.equal(
  rejectedCode({
    originalFilename: "brief.exe",
    mimeType: "application/octet-stream",
    fileSizeBytes: 12,
    signatureBytes: new Uint8Array([0x4d, 0x5a]),
  }),
  "unsupported_file",
);
assert.equal(
  rejectedCode({
    originalFilename: "brief.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 12,
    signatureBytes: new TextEncoder().encode("not a pdf"),
  }),
  "signature_mismatch",
);
assert.equal(
  rejectedCode({
    originalFilename: "brief.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 64,
    signatureBytes: new TextEncoder().encode("%PDF-1.7\n/Encrypt"),
  }),
  "encrypted_file",
);
assert.equal(
  rejectedCode({
    originalFilename: "brief.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileSizeBytes: 2,
    signatureBytes: new Uint8Array([0x50, 0x4b]),
  }),
  "damaged_file",
);
assert.equal(
  rejectedCode({
    originalFilename: "brief.txt",
    mimeType: "text/plain",
    fileSizeBytes: 26 * 1024 * 1024,
    signatureBytes: new TextEncoder().encode("oversized"),
  }),
  "file_too_large",
);
assert.equal(
  validateProjectContextUploadBatch({ filesPerUpload: 999, filesPerProjectAfterUpload: 1 }).accepted,
  false,
);
assert.equal(hashProjectContextUploadBytes(new TextEncoder().encode("same")), hashProjectContextUploadBytes(new TextEncoder().encode("same")));

assert.match(routeSource, /formData\.get\("file"\)/);
assert.match(routeSource, /formData\.get\("uploadedTaskId"\)/);
assert.match(routeSource, /listProjectContextUploads/);
assert.match(routeSource, /processProjectContextUpload/);
assert.doesNotMatch(
  routeSource,
  /formData\.get\("(sourceId|versionId|rawStorageKey|normalizationRuleVersion|parserVersion|status)"\)/,
);
assert.match(serviceSource, /requireProjectAccess\(input\.projectId, input\.user\)/);
assert.match(serviceSource, /PROJECT_CONTEXT_UPLOAD_TASK_PROJECT_MISMATCH/);
assert.match(serviceSource, /where id = \$\{uploadedTaskId\}::uuid[\s\S]*?and project_id = \$\{projectId\}::uuid/);
assert.match(serviceSource, /'project_context'/);
assert.match(serviceSource, /'uploaded'/);
assert.match(serviceSource, /rawRetentionUntil/);
assert.match(serviceSource, /storeProjectContextRawBytes/);
assert.match(serviceSource, /encodeProjectContextRawStorageKey/);
assert.match(serviceSource, /deleteProjectContextRawObject\(rawStorageKey\)/);
assert.doesNotMatch(serviceSource, /db-blob:project-context/);
assert.match(rawStorageSource, /storageProvider\.upload/);
assert.match(rawStorageSource, /storageProvider\.download/);
assert.match(rawStorageSource, /storageProvider\.delete/);
assert.match(rawStorageSource, /project-context/);
assert.match(serviceSource, /policy\.id/);
assert.match(serviceSource, /fileValidation\.parserVersion/);
assert.doesNotMatch(serviceSource, /EvidenceBundle/);
assert.doesNotMatch(serviceSource, /legalEvidence/i);

console.log(JSON.stringify({ status: "passed", upload: "project_context" }));

function rejectedCode(input: Parameters<typeof validateProjectContextUploadFile>[0]) {
  const result = validateProjectContextUploadFile(input);
  assert.equal(result.accepted, false);
  return result.accepted ? null : result.code;
}
