import { processPendingProjectContextUploads } from "../src/use-cases/project-context-processing-service";

const limit = parsePositiveInt(process.env.PROJECT_CONTEXT_PROCESSING_LIMIT, 25);
const projectId = process.env.PROJECT_CONTEXT_PROJECT_ID?.trim() || null;

const result = await processPendingProjectContextUploads({ projectId, limit });

console.log(JSON.stringify({
  status: "completed",
  worker: "project_context_processing",
  processed: result.processed.length,
  reviewPending: result.processed.filter((item) => item.status === "review_pending").length,
  failed: result.processed.filter((item) => item.status === "failed").length,
  uploadIds: result.processed.map((item) => item.uploadId),
}));

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
