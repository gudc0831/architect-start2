import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serviceSource = readFileSync(join(root, "src", "use-cases", "project-context-approval-service.ts"), "utf8");
const previewRouteSource = readFileSync(
  join(root, "src", "app", "api", "projects", "[projectId]", "materials", "uploads", "[uploadId]", "preview", "route.ts"),
  "utf8",
);
const uploadsRouteSource = readFileSync(
  join(root, "src", "app", "api", "projects", "[projectId]", "materials", "uploads", "route.ts"),
  "utf8",
);
const statusRouteSource = readFileSync(
  join(root, "src", "app", "api", "projects", "[projectId]", "materials", "versions", "[versionId]", "status", "route.ts"),
  "utf8",
);
const materialsPageSource = readFileSync(join(root, "src", "components", "project-context", "project-materials-page.tsx"), "utf8");

assert.match(previewRouteSource, /getProjectContextUploadPreview/);
assert.match(uploadsRouteSource, /listProjectContextUploads/);
assert.match(serviceSource, /listProjectContextUploads/);
assert.match(serviceSource, /canApprove/);
assert.match(serviceSource, /uploaded_by_user_id !== input\.user\.id/);
assert.match(serviceSource, /PROJECT_CONTEXT_PREVIEW_FORBIDDEN/);
assert.match(serviceSource, /applicationScope: "project-wide"/);
assert.match(serviceSource, /rawDeletionWarning/);
assert.match(serviceSource, /normalizationRuleVersion/);
assert.match(serviceSource, /parserVersion/);
assert.match(serviceSource, /processedAt/);
assert.match(serviceSource, /sourceQuote/);
assert.match(serviceSource, /chunkQualityScore/);
assert.match(serviceSource, /injectionRisk/);

assert.match(statusRouteSource, /assertRequestIntegrity\(request\)/);
assert.match(statusRouteSource, /allowedStatuses/);
assert.match(serviceSource, /requireProjectManager\(input\.projectId, input\.user\)/);
assert.match(serviceSource, /set status = 'active'/);
assert.match(serviceSource, /latest_active_version_id = \$\{input\.versionId\}::uuid/);
assert.match(serviceSource, /appliesToNewTaskReviewsOnly: true/);
assert.match(serviceSource, /status = \$\{input\.status\}/);
assert.match(serviceSource, /latest_active_version_id = null/);

assert.match(materialsPageSource, /materials\.primaryUpload/);
assert.match(materialsPageSource, /materials\.scopeText/);
assert.match(materialsPageSource, /materials\.rawRetentionText/);
assert.match(materialsPageSource, /loadPreview/);
assert.match(materialsPageSource, /updateStatus/);
assert.match(materialsPageSource, /review_pending/);
assert.match(materialsPageSource, /active/);
assert.match(materialsPageSource, /rejected/);
assert.match(materialsPageSource, /archived/);
assert.doesNotMatch(materialsPageSource, /rawStorageKey/);
assert.doesNotMatch(serviceSource, /EvidenceBundle/);
assert.doesNotMatch(serviceSource, /legalEvidence/i);

console.log(JSON.stringify({ status: "passed", approval: "project_context" }));
