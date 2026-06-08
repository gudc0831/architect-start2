import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const packageJson = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
const prismaSchema = read("prisma/schema.prisma");
const migrationSql = read("prisma/migrations/202606080001_add_task_cell_documents/migration.sql");
const domainSource = read("src/domains/task/cell-documents.ts");
const featureFlagSource = read("src/lib/features/daily-cell-documents.ts");
const serviceSource = read("src/use-cases/task-cell-document-service.ts");
const taskServiceSource = read("src/use-cases/task-service.ts");
const snapshotRouteSource = read("src/app/api/task-cell-documents/[taskId]/[fieldKey]/route.ts");
const updateRouteSource = read("src/app/api/task-cell-documents/[taskId]/[fieldKey]/updates/route.ts");
const storeSource = read("src/components/tasks/cell-documents/cell-document-store.ts");
const journalSource = read("src/components/tasks/cell-documents/cell-document-journal.ts");
const transportSource = read("src/components/tasks/cell-documents/cell-document-transport.ts");
const hookSource = read("src/components/tasks/cell-documents/use-task-cell-document.ts");
const editorSource = read("src/components/tasks/cell-documents/task-cell-editor.tsx");
const workspaceSource = read("src/components/tasks/task-workspace.tsx");

assert.ok(packageJson.dependencies?.yjs, "yjs dependency must be installed");
assert.match(packageJson.scripts?.["daily:cell-collaboration:verify"] ?? "", /daily-cell-collaboration-verify\.ts/);

assert.match(prismaSchema, /model TaskCellDocument/);
assert.match(prismaSchema, /model TaskCellUpdate/);
assert.match(prismaSchema, /@@unique\(\[projectId, taskId, fieldKey\]\)/);
assert.match(prismaSchema, /@relation\(fields: \[projectId, taskId\], references: \[projectId, id\], onDelete: Cascade\)/);
assert.match(migrationSql, /create table if not exists task_cell_documents/);
assert.match(migrationSql, /foreign key \(project_id, task_id\) references tasks\(project_id, id\)/);
assert.match(migrationSql, /create table if not exists task_cell_updates/);
assert.match(migrationSql, /unique index if not exists task_cell_updates_document_client_update/);

assert.match(domainSource, /TEXT_CELL_DOCUMENT_FIELDS = \["issueTitle", "issueDetailNote", "decision"\]/);
assert.match(domainSource, /TASK_CELL_TEXT_FIELD_TO_COLUMN/);
assert.match(domainSource, /MAX_CELL_UPDATE_BYTES/);
assert.match(domainSource, /buildTaskCellDocumentTopic/);
assert.match(featureFlagSource, /DAILY_CELL_DOCUMENTS_ENABLED/);
assert.match(featureFlagSource, /NEXT_PUBLIC_DAILY_CELL_DOCUMENTS_ENABLED/);

assert.match(snapshotRouteSource, /requireCurrentProjectAccess/);
assert.match(snapshotRouteSource, /getTaskCellDocument/);
assert.match(updateRouteSource, /assertRequestIntegrity/);
assert.match(updateRouteSource, /requireCurrentProjectEditor/);
assert.match(updateRouteSource, /applyTaskCellDocumentUpdate/);
assert.match(serviceSource, /clientUpdateId/);
assert.match(serviceSource, /cellDocumentId_clientUpdateId/);
assert.match(serviceSource, /Y\.applyUpdate/);
assert.match(serviceSource, /Y\.encodeStateAsUpdate/);
assert.match(serviceSource, /tx\.task\.updateMany/);
assert.match(serviceSource, /version: \{ increment: 1 \}/);
assert.match(serviceSource, /TASK_CELL_DOCUMENT_SCALAR_UPDATE_UNSUPPORTED/);
assert.match(taskServiceSource, /assertTaskRowPatchAllowedWithCellDocuments/);
assert.match(taskServiceSource, /TASK_CELL_DOCUMENT_FIELD_DIRECT_WRITE_BLOCKED/);

assert.match(storeSource, /createTaskCellYDocument/);
assert.match(storeSource, /replaceTaskCellYText/);
assert.match(journalSource, /architect-start\.task-cell-documents/);
assert.match(journalSource, /IndexedDB is not available/);
assert.match(transportSource, /BroadcastChannel/);
assert.match(transportSource, /buildTaskCellDocumentTopic/);
assert.match(hookSource, /Y\.mergeUpdates/);
assert.match(hookSource, /putCellDocumentJournalOperation/);
assert.match(hookSource, /publishCellDocumentUpdateEvent/);
assert.match(hookSource, /postgres_changes/);
assert.match(hookSource, /task_cell_documents/);
assert.match(hookSource, /window\.addEventListener\("focus"/);
assert.match(editorSource, /TaskCellEditor/);
assert.match(workspaceSource, /dailyCellDocumentsEnabled/);
assert.match(workspaceSource, /TaskCellEditor/);
assert.match(workspaceSource, /commitInlineTaskCellDocumentField/);
assert.match(workspaceSource, /isTextCellDocumentField/);
assert.match(workspaceSource, /publishDailyRowSyncEvent\(dailyMutationScopeRef\.current/);

console.log("daily cell collaboration static guard: ok");
