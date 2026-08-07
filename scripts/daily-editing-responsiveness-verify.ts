import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shouldUseLegacyTaskCategoricalTextInput } from "@/components/tasks/task-categorical-edit-policy";
import {
  applyPendingTaskPatchValues,
  clearMatchingPendingTaskPatchValues,
  mergePendingTaskPatchValues,
} from "@/components/tasks/task-optimistic-patch-state";
import {
  classifyDailyMutationFlushFailure,
  DAILY_MUTATION_MAX_RETRY_COUNT,
  buildCoalescedDailyReorderOperation,
  buildDailyMutationOperation,
  buildDailyOptimisticTaskId,
  coalesceDailyReorderOperations,
  deleteDailyMutationOperation,
  isDailyReorderMutationSatisfiedByServerState,
  isDailyMutationOperationAttemptCurrent,
  listDailyMutationOperations,
  mergeDailyMutationOperationsIntoActiveFiles,
  mergeDailyMutationOperationsIntoActiveTasks,
  mergeDailyMutationOperationsIntoTrashFiles,
  mergeDailyMutationOperationsIntoTrashTasks,
  putDailyMutationOperation,
  rebaseDailySelectionDeleteMutationOperation,
  rebaseDailyReorderMutationOperation,
  rebaseDailyUpdateMutationOperation,
  reconcileDailyMutationCreateSuccess,
  shouldMarkDailyDeleteMutationSyncedFromServerState,
  shouldMarkDailyFileTrashMutationSyncedFromServerState,
  shouldMarkDailyFileRestoreMutationSyncedFromServerState,
  shouldMarkDailyRestoreMutationSyncedFromServerState,
  shouldMarkDailyTrashMutationSyncedFromServerState,
  shouldRecoverLegacyFailedDailyMutation,
  summarizeDailyMutationOperations,
  updateDailyMutationOperation,
} from "@/components/tasks/daily-mutation-journal";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { buildStoredOrderTaskTree } from "@/domains/task/ordering";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { handleRouteError, isDatabaseConnectivityError } from "@/lib/api/route-error";
import { resolvePublicSiteUrl } from "@/lib/auth/public-site-url";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { localizeError } from "@/lib/ui-copy";

function definition(fieldKey: TaskCategoryFieldKey, code: string, isActive = true): TaskCategoryDefinition {
  return {
    id: `${fieldKey}-${code}`,
    fieldKey,
    projectId: null,
    code,
    labelKo: code,
    labelEn: code,
    isSystem: false,
    isActive,
    sortOrder: 1,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    createdBy: null,
    updatedBy: null,
  };
}

const emptyContext = {
  categoryDefinitionsByField: {
    coordinationScope: [],
    requestedBy: [],
    relatedDisciplines: [],
    locationRef: [],
  },
};

assert.equal(shouldUseLegacyTaskCategoricalTextInput("coordinationScope", emptyContext), true);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("requestedBy", emptyContext), true);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("relatedDisciplines", emptyContext), true);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("locationRef", emptyContext), true);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("status", emptyContext), false);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("workType", emptyContext), false);

const definedContext = {
  categoryDefinitionsByField: {
    coordinationScope: [definition("coordinationScope", "scope-a")],
    requestedBy: [definition("requestedBy", "requester-a")],
    relatedDisciplines: [definition("relatedDisciplines", "discipline-a")],
    locationRef: [definition("locationRef", "location-a")],
  },
};

assert.equal(shouldUseLegacyTaskCategoricalTextInput("coordinationScope", definedContext), false);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("requestedBy", definedContext), false);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("relatedDisciplines", definedContext), false);
assert.equal(shouldUseLegacyTaskCategoricalTextInput("locationRef", definedContext), false);

const inactiveOnlyContext = {
  categoryDefinitionsByField: {
    coordinationScope: [definition("coordinationScope", "disabled", false)],
  },
};

assert.equal(shouldUseLegacyTaskCategoricalTextInput("coordinationScope", inactiveOnlyContext), true);

const pendingAfterFirstEdit = mergePendingTaskPatchValues(null, { status: "in_review" });
const pendingAfterSecondEdit = mergePendingTaskPatchValues(pendingAfterFirstEdit, { issueTitle: "second visible title" });
const pendingAfterFirstServerResponse = clearMatchingPendingTaskPatchValues(pendingAfterSecondEdit, {
  status: "in_review",
});

assert.deepEqual(pendingAfterFirstServerResponse, { issueTitle: "second visible title" });

const serverTaskAfterFirstResponse = {
  id: "task-1",
  status: "in_review",
  issueTitle: "first server title",
} as unknown as TaskRecord;
assert.equal(
  applyPendingTaskPatchValues(serverTaskAfterFirstResponse, { "task-1": pendingAfterFirstServerResponse ?? {} }).issueTitle,
  "second visible title",
);

assert.equal(
  clearMatchingPendingTaskPatchValues(pendingAfterFirstServerResponse, { issueTitle: "second visible title" }),
  null,
);

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
process.env.NEXT_PUBLIC_SITE_URL = "https://architect-start2.example";
try {
  assert.equal(resolvePublicSiteUrl(new URL("http://localhost:3000/api/auth/google?next=%2Fdaily")).origin, "http://localhost:3000");
  assert.equal(resolvePublicSiteUrl(new URL("http://127.0.0.1:3000/api/auth/google?next=%2Fdaily")).origin, "http://127.0.0.1:3000");
  assert.equal(
    resolvePublicSiteUrl(new URL("https://architect-start2-git-example.vercel.app/api/auth/google?next=%2Fdaily")).origin,
    "https://architect-start2.example",
  );
} finally {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
}

assert.doesNotThrow(() =>
  assertRequestIntegrity(
    new Request("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      headers: { origin: "http://localhost:3000" },
    }),
  ),
);
assert.throws(
  () =>
    assertRequestIntegrity(
      new Request("http://localhost:3000/api/tasks/task-1", {
        method: "PATCH",
        headers: { origin: "https://example.invalid" },
      }),
    ),
  /Cross-site requests are not allowed\./,
);

assert.equal(isDatabaseConnectivityError(Object.assign(new Error("connect EACCES"), { code: "EACCES" })), true);
assert.equal(
  isDatabaseConnectivityError(Object.assign(new Error("Timed out fetching a new connection"), { code: "P2024" })),
  true,
);
assert.equal(
  isDatabaseConnectivityError(Object.assign(new Error("(EMAXCONNSESSION) max clients reached in session mode"), { code: "EMAXCONNSESSION" })),
  true,
);
assert.equal(isDatabaseConnectivityError(new Error("validation failed")), false);
assert.equal(
  localizeError({ code: "DATABASE_UNAVAILABLE", fallbackKey: "loadTasksFailed" }),
  "데이터베이스 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
);

const dashboardProviderSource = readFileSync(resolve("src/providers/dashboard-provider.tsx"), "utf8");
const authProviderSource = readFileSync(resolve("src/providers/auth-provider.tsx"), "utf8");
const projectProviderSource = readFileSync(resolve("src/providers/project-provider.tsx"), "utf8");
const workspaceBootstrapRouteSource = readFileSync(resolve("src/app/api/workspace/bootstrap/route.ts"), "utf8");
const workspaceBootstrapClientSource = readFileSync(resolve("src/lib/workspace/bootstrap-client.ts"), "utf8");
const dashboardSnapshotCacheSource = readFileSync(resolve("src/lib/workspace/dashboard-snapshot-cache.ts"), "utf8");
assert.match(
  dashboardProviderSource,
  /const invalidateDashboardScopeRead = useCallback\(\(scope: DashboardScope\) => \{\s*requestIdRef\.current\[scope\] \+= 1;\s*delete inFlightRef\.current\[scope\];\s*\}, \[\]\);/s,
);
assert.match(
  dashboardProviderSource,
  /const setDashboardTasks = useCallback\(\s*\(scope: DashboardScope, updater: SetStateAction<TaskRecord\[\]>\) => \{\s*invalidateDashboardScopeRead\(scope\);/s,
);
assert.match(workspaceBootstrapRouteSource, /loadWorkspaceBootstrap\(\{/);
assert.match(workspaceBootstrapRouteSource, /activeTaskOrderScope: searchParams\.get\("orderScope"\) === "daily" \? "daily" : null/);
assert.match(workspaceBootstrapRouteSource, /includeActiveTasks: searchParams\.get\("includeActiveTasks"\) !== "0"/);
assert.match(workspaceBootstrapClientSource, /const workspaceBootstrapPromises = new Map<string, Promise<WorkspaceBootstrapPayload>>\(\);/);
assert.match(workspaceBootstrapClientSource, /export async function fetchWorkspaceBootstrap/);
assert.match(workspaceBootstrapClientSource, /export async function fetchWorkspaceDailyTaskUserOrders/);
assert.match(workspaceBootstrapClientSource, /export function clearWorkspaceBootstrapCache/);
assert.doesNotMatch(authProviderSource, /fetchWorkspaceBootstrap\(\)/);
assert.doesNotMatch(projectProviderSource, /fetchWorkspaceBootstrap\(\)/);
assert.match(dashboardProviderSource, /fetchWorkspaceBootstrap\(activeTaskOrderScope\)/);
assert.match(dashboardProviderSource, /fetchWorkspaceDailyTaskUserOrders\(\)/);
assert.match(dashboardProviderSource, /function applyDailyTaskUserOrders/);
assert.match(dashboardProviderSource, /scope === "active"/);
assert.doesNotMatch(dashboardProviderSource, /taskParams\.set\("orderScope", "daily"\)/);
assert.match(dashboardSnapshotCacheSource, /indexedDB\.open/);
assert.match(dashboardSnapshotCacheSource, /export async function readDashboardTaskSnapshot/);
assert.match(dashboardSnapshotCacheSource, /export async function writeDashboardTaskSnapshot/);
assert.match(dashboardSnapshotCacheSource, /DASHBOARD_SNAPSHOT_PAYLOAD_SIZE_LIMIT_BYTES/);
assert.match(dashboardProviderSource, /readLastDashboardSnapshotProjectId\(\)/);
assert.match(dashboardProviderSource, /readDashboardTaskSnapshot/);
assert.match(dashboardProviderSource, /writeDashboardTaskSnapshot/);

const journalScope = { projectId: "project-1", profileId: "profile-1" };
const baseTask = (id: string, overrides: Partial<TaskRecord> = {}) =>
  ({
    id,
    projectId: "project-1",
    taskNumber: 1,
    actionId: 1,
    issueId: "ARCH-001",
    parentTaskId: null,
    rootTaskId: id,
    depth: 0,
    siblingOrder: 0,
    dueDate: "2026-05-21",
    workType: "coordination",
    coordinationScope: "scope-a",
    ownerDiscipline: "architecture",
    requestedBy: "owner",
    relatedDisciplines: "structural",
    assignee: "",
    assigneeProfileId: null,
    issueTitle: "base task",
    reviewedAt: "",
    createdAt: "2026-05-21",
    createdBy: null,
    isDaily: true,
    locationRef: "",
    calendarLinked: false,
    issueDetailNote: "",
    status: "new",
    statusHistory: "",
    decision: "",
    completedAt: null,
    version: 1,
    updatedAt: "2026-05-21T00:00:00.000Z",
    updatedBy: null,
    deletedAt: null,
    purgedAt: null,
    fileSummary: { count: 0, latestFileName: null },
    ...overrides,
  }) as TaskRecord;
const baseFile = (id: string, overrides: Partial<FileRecord> = {}) =>
  ({
    id,
    taskId: "task-1",
    projectId: "project-1",
    fileGroupId: `group-${id}`,
    originalName: `${id}.txt`,
    mimeType: "text/plain",
    sizeBytes: 1,
    storageBucket: "files",
    objectPath: `project-1/${id}.txt`,
    version: 1,
    versionNumber: 1,
    versionLabel: "v1",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    uploadedBy: "profile-1",
    deletedAt: "2026-05-21T00:00:00.000Z",
    purgedAt: null,
    metadata: {},
    ...overrides,
  }) as FileRecord;
const createClientMutationId = "11111111-1111-4111-8111-111111111111";
const tempTaskId = buildDailyOptimisticTaskId(createClientMutationId);
const tempTask = baseTask(tempTaskId, { actionId: 0, issueId: "", issueTitle: "local create" });
const pendingCreateOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "create",
  clientMutationId: createClientMutationId,
  tempTaskId,
  payload: { kind: "create", tempTask, requestPayload: { issueTitle: "local create" } },
});
assert.equal(mergeDailyMutationOperationsIntoActiveTasks([], [pendingCreateOperation])[0]?.id, tempTaskId);
const serverCreatedTask = baseTask(createClientMutationId, { issueTitle: "local create", taskNumber: 27, actionId: 27 });
assert.equal(reconcileDailyMutationCreateSuccess([tempTask], tempTaskId, serverCreatedTask)[0]?.id, createClientMutationId);
const syncedCreateOperation = {
  ...pendingCreateOperation,
  status: "synced" as const,
  serverTaskId: serverCreatedTask.id,
};
const trashCreatedTaskOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "trash",
  now: "2026-05-21T00:00:01.500Z",
  payload: { kind: "trash", taskId: tempTaskId, affectedTasks: [tempTask] },
});
assert.equal(mergeDailyMutationOperationsIntoActiveTasks([serverCreatedTask], [syncedCreateOperation, trashCreatedTaskOperation]).length, 0);
const pendingUpdateOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "update",
  payload: { kind: "update", taskId: "task-1", baseVersion: 1, patch: { issueTitle: "pending overlay" } },
});
assert.equal(mergeDailyMutationOperationsIntoActiveTasks([baseTask("task-1")], [pendingUpdateOperation])[0]?.issueTitle, "pending overlay");
const firstReorderOperation = buildCoalescedDailyReorderOperation({
  scope: journalScope,
  command: { action: "set_sibling_order", parentTaskId: null, orderedTaskIds: ["task-2", "task-1"] },
  desiredTasks: [baseTask("task-2", { siblingOrder: 0 }), baseTask("task-1", { siblingOrder: 1 })],
  now: "2026-05-21T00:00:00.000Z",
});
const secondReorderOperation = buildCoalescedDailyReorderOperation({
  scope: journalScope,
  command: { action: "set_sibling_order", parentTaskId: null, orderedTaskIds: ["task-1", "task-2"] },
  desiredTasks: [baseTask("task-1", { siblingOrder: 0 }), baseTask("task-2", { siblingOrder: 1 })],
  now: "2026-05-21T00:00:01.000Z",
});
assert.equal(firstReorderOperation.operationId, secondReorderOperation.operationId);
assert.equal(isDailyMutationOperationAttemptCurrent(secondReorderOperation, firstReorderOperation), false);
assert.equal(isDailyMutationOperationAttemptCurrent(secondReorderOperation, secondReorderOperation), true);
let storedReorderOperation = secondReorderOperation;
if (isDailyMutationOperationAttemptCurrent(storedReorderOperation, firstReorderOperation)) {
  storedReorderOperation = { ...storedReorderOperation, status: "synced" };
}
assert.equal(storedReorderOperation.clientMutationId, secondReorderOperation.clientMutationId);
assert.equal(storedReorderOperation.status, "pending");
const reloadReorderReplayOperation = buildCoalescedDailyReorderOperation({
  scope: journalScope,
  command: { action: "set_sibling_order", parentTaskId: null, orderedTaskIds: ["task-3", "task-1"] },
  desiredTasks: [
    baseTask("task-1", { siblingOrder: 0 }),
    baseTask("task-2", { siblingOrder: 1 }),
    baseTask("task-3", { siblingOrder: 2 }),
  ],
  now: "2026-05-21T00:00:02.000Z",
});
const replayedReloadOrder = buildStoredOrderTaskTree(
  mergeDailyMutationOperationsIntoActiveTasks(
    [
      baseTask("task-1", { siblingOrder: 0 }),
      baseTask("task-2", { siblingOrder: 1 }),
      baseTask("task-3", { siblingOrder: 2 }),
    ],
    [reloadReorderReplayOperation],
  ),
).map((task) => task.id);
assert.deepEqual(replayedReloadOrder, ["task-3", "task-1", "task-2"]);
const partialReorderReplayOperation = buildCoalescedDailyReorderOperation({
  scope: journalScope,
  command: { action: "set_sibling_order", parentTaskId: null, orderedTaskIds: ["task-3", "task-2"], siblingOrderStart: 1 },
  desiredTasks: [
    baseTask("task-1", { siblingOrder: 0 }),
    baseTask("task-3", { siblingOrder: 1 }),
    baseTask("task-2", { siblingOrder: 2 }),
    baseTask("task-4", { siblingOrder: 3 }),
  ],
  now: "2026-05-21T00:00:02.500Z",
});
const partialReplayOrder = buildStoredOrderTaskTree(
  mergeDailyMutationOperationsIntoActiveTasks(
    [
      baseTask("task-1", { siblingOrder: 0 }),
      baseTask("task-2", { siblingOrder: 1 }),
      baseTask("task-3", { siblingOrder: 2 }),
      baseTask("task-4", { siblingOrder: 3 }),
    ],
    [partialReorderReplayOperation],
  ),
).map((task) => task.id);
assert.deepEqual(partialReplayOrder, ["task-1", "task-3", "task-2", "task-4"]);
assert.equal(
  isDailyReorderMutationSatisfiedByServerState(partialReorderReplayOperation, [
    baseTask("task-1", { siblingOrder: 0 }),
    baseTask("task-3", { siblingOrder: 1 }),
    baseTask("task-2", { siblingOrder: 2 }),
    baseTask("task-4", { siblingOrder: 3 }),
  ]),
  true,
);
assert.deepEqual(
  coalesceDailyReorderOperations([firstReorderOperation, secondReorderOperation]).map((operation) => operation.clientMutationId),
  [secondReorderOperation.clientMutationId],
);
const failedOperation = { ...pendingUpdateOperation, status: "failed" as const, retryCount: 1 };
assert.equal(summarizeDailyMutationOperations([failedOperation]).failed, 1);
assert.equal(shouldRecoverLegacyFailedDailyMutation(failedOperation), true);
assert.equal(
  shouldRecoverLegacyFailedDailyMutation({
    ...failedOperation,
    retryCount: DAILY_MUTATION_MAX_RETRY_COUNT,
  }),
  false,
);
const updateConflictDecision = classifyDailyMutationFlushFailure(pendingUpdateOperation, {
  status: 409,
  code: "TASK_VERSION_CONFLICT",
  isNetworkError: false,
});
assert.equal(updateConflictDecision.kind, "version_conflict");
assert.equal(updateConflictDecision.retryable, true);
const reorderConflictDecision = classifyDailyMutationFlushFailure(secondReorderOperation, {
  status: 409,
  code: "TASK_REORDER_CONFLICT",
  isNetworkError: false,
});
assert.equal(reorderConflictDecision.kind, "reorder_conflict");
assert.equal(reorderConflictDecision.retryable, true);
const networkDecision = classifyDailyMutationFlushFailure(pendingUpdateOperation, {
  status: null,
  code: null,
  isNetworkError: true,
});
assert.equal(networkDecision.kind, "network_or_database");
assert.equal(networkDecision.retryable, true);
const permissionDecision = classifyDailyMutationFlushFailure(pendingUpdateOperation, {
  status: 403,
  code: "PROJECT_ACCESS_DENIED",
  isNetworkError: false,
});
assert.equal(permissionDecision.kind, "auth_or_permission");
assert.equal(permissionDecision.retryable, false);
const rebasedUpdateOperation = rebaseDailyUpdateMutationOperation(pendingUpdateOperation, baseTask("task-1", { version: 9 }));
assert.equal(rebasedUpdateOperation.payload.kind, "update");
assert.equal(rebasedUpdateOperation.payload.kind === "update" ? rebasedUpdateOperation.payload.baseVersion : 0, 9);
const rebasedReorderOperation = rebaseDailyReorderMutationOperation(secondReorderOperation, [
  baseTask("task-1", { version: 5, siblingOrder: 7 }),
  baseTask("task-2", { version: 6, siblingOrder: 8 }),
]);
assert.equal(rebasedReorderOperation.payload.kind, "reorder");
assert.equal(rebasedReorderOperation.payload.kind === "reorder" ? rebasedReorderOperation.payload.desiredTasks[0]?.version : 0, 5);
assert.equal(
  isDailyReorderMutationSatisfiedByServerState(secondReorderOperation, [
    baseTask("task-1", { actionId: 1, siblingOrder: -2 }),
    baseTask("task-2", { actionId: 2, siblingOrder: -2 }),
  ]),
  true,
);
assert.equal(
  isDailyReorderMutationSatisfiedByServerState(secondReorderOperation, [
    baseTask("task-2", { actionId: 1, siblingOrder: -2 }),
    baseTask("task-1", { actionId: 2, siblingOrder: -2 }),
  ]),
  false,
);
const pendingTrashOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "trash",
  now: "2026-05-21T00:00:02.000Z",
  payload: { kind: "trash", taskId: "task-1", affectedTasks: [baseTask("task-1", { deletedAt: null })] },
});
assert.equal(
  shouldMarkDailyTrashMutationSyncedFromServerState(pendingTrashOperation, [], [baseTask("task-1", { deletedAt: "2026-05-21T00:00:02.000Z" })]),
  true,
);
assert.equal(shouldMarkDailyTrashMutationSyncedFromServerState(pendingTrashOperation, [baseTask("task-1")], []), false);
const firstTrashReplay = mergeDailyMutationOperationsIntoTrashTasks([], [pendingTrashOperation]);
const secondTrashReplay = mergeDailyMutationOperationsIntoTrashTasks([], [pendingTrashOperation]);
assert.deepEqual(secondTrashReplay, firstTrashReplay);
assert.equal(firstTrashReplay[0]?.deletedAt, pendingTrashOperation.createdAt);
const trashedTask = baseTask("task-restore", { deletedAt: "2026-05-21T00:00:02.000Z" });
const pendingRestoreOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "restore",
  now: "2026-05-21T00:00:02.500Z",
  payload: { kind: "restore", taskId: trashedTask.id, affectedTasks: [trashedTask] },
});
assert.equal(mergeDailyMutationOperationsIntoTrashTasks([trashedTask], [pendingRestoreOperation]).length, 0);
assert.equal(mergeDailyMutationOperationsIntoActiveTasks([], [pendingRestoreOperation])[0]?.deletedAt, null);
assert.equal(
  shouldMarkDailyRestoreMutationSyncedFromServerState(
    pendingRestoreOperation,
    [baseTask(trashedTask.id, { deletedAt: null })],
    [],
  ),
  true,
);
const trashedFile = baseFile("file-restore");
const pendingFileRestoreOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "restore",
  now: "2026-05-21T00:00:02.750Z",
  payload: { kind: "restore", taskId: trashedFile.taskId, affectedTasks: [], affectedFile: trashedFile },
});
assert.equal(mergeDailyMutationOperationsIntoTrashFiles([trashedFile], [pendingFileRestoreOperation]).length, 0);
assert.equal(mergeDailyMutationOperationsIntoActiveFiles([], [pendingFileRestoreOperation])[0]?.deletedAt, null);
assert.equal(
  shouldMarkDailyFileRestoreMutationSyncedFromServerState(
    pendingFileRestoreOperation,
    [baseFile(trashedFile.id, { deletedAt: null })],
    [],
  ),
  true,
);
const activeFileToTrash = baseFile("file-trash", { deletedAt: null });
const pendingFileTrashOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "file-trash",
  now: "2026-05-21T00:00:02.875Z",
  payload: {
    kind: "file-trash",
    fileId: activeFileToTrash.id,
    affectedFile: activeFileToTrash,
  },
});
assert.equal(mergeDailyMutationOperationsIntoActiveFiles([activeFileToTrash], [pendingFileTrashOperation]).length, 0);
const replayedTrashFiles = mergeDailyMutationOperationsIntoTrashFiles([], [pendingFileTrashOperation]);
assert.equal(replayedTrashFiles[0]?.id, activeFileToTrash.id);
assert.equal(replayedTrashFiles[0]?.deletedAt, pendingFileTrashOperation.createdAt);
assert.equal(
  shouldMarkDailyFileTrashMutationSyncedFromServerState(
    pendingFileTrashOperation,
    [],
    [baseFile(activeFileToTrash.id)],
  ),
  true,
);
assert.equal(
  shouldMarkDailyFileTrashMutationSyncedFromServerState(
    pendingFileTrashOperation,
    [activeFileToTrash],
    [],
  ),
  false,
);
assert.equal(
  shouldMarkDailyFileTrashMutationSyncedFromServerState(pendingFileTrashOperation, [], []),
  true,
);
const pendingDeleteOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "delete",
  now: "2026-05-21T00:00:03.000Z",
  payload: {
    kind: "delete",
    taskId: "task-1",
    affectedTasks: [baseTask("task-1", { deletedAt: "2026-05-21T00:00:02.000Z" })],
    affectedFileIds: [],
  },
});
assert.equal(shouldMarkDailyDeleteMutationSyncedFromServerState(pendingDeleteOperation, [], []), true);
assert.equal(
  shouldMarkDailyDeleteMutationSyncedFromServerState(pendingDeleteOperation, [], [
    baseTask("task-1", { deletedAt: "2026-05-21T00:00:02.000Z" }),
  ]),
  false,
);
const pendingSelectionDeleteOperation = buildDailyMutationOperation({
  scope: journalScope,
  type: "delete",
  now: "2026-05-21T00:00:03.500Z",
  payload: {
    kind: "delete",
    taskId: "task-2",
    affectedTasks: [],
    affectedTaskIds: ["task-2"],
    affectedFileIds: ["file-2"],
    request: { target: "selection", taskIds: ["task-2"], fileIds: ["file-2"] },
  },
});
assert.equal(
  mergeDailyMutationOperationsIntoTrashTasks([baseTask("task-2", { deletedAt: "2026-05-21T00:00:02.000Z" })], [
    pendingSelectionDeleteOperation,
  ]).length,
  0,
);
assert.equal(mergeDailyMutationOperationsIntoTrashFiles([baseFile("file-2")], [pendingSelectionDeleteOperation]).length, 0);
const rebasedSelectionDeleteOperation = rebaseDailySelectionDeleteMutationOperation(
  {
    ...pendingSelectionDeleteOperation,
    payload:
      pendingSelectionDeleteOperation.payload.kind === "delete"
        ? {
            ...pendingSelectionDeleteOperation.payload,
            affectedTaskIds: ["task-1", "task-2"],
            affectedFileIds: ["file-1", "file-2"],
            request: {
              target: "selection",
              taskIds: ["task-1", "task-2"],
              fileIds: ["file-1", "file-2"],
            },
          }
        : pendingSelectionDeleteOperation.payload,
  },
  new Set(["task-2"]),
  new Set(["file-2"]),
);
assert.ok(rebasedSelectionDeleteOperation);
assert.deepEqual(
  rebasedSelectionDeleteOperation.payload.kind === "delete" &&
    rebasedSelectionDeleteOperation.payload.request?.target === "selection"
    ? rebasedSelectionDeleteOperation.payload.request
    : null,
  { target: "selection", taskIds: ["task-2"], fileIds: ["file-2"] },
);
assert.equal(
  rebaseDailySelectionDeleteMutationOperation(pendingSelectionDeleteOperation, new Set(), new Set()),
  null,
);

const taskRouteSource = readFileSync(resolve("src/app/api/tasks/route.ts"), "utf8");
const taskReorderRouteSource = readFileSync(resolve("src/app/api/tasks/reorder/route.ts"), "utf8");
const taskUpdateRouteSource = readFileSync(resolve("src/app/api/tasks/[taskId]/route.ts"), "utf8");
const taskTrashRouteSource = readFileSync(resolve("src/app/api/tasks/[taskId]/trash/route.ts"), "utf8");
const prismaSource = readFileSync(resolve("src/lib/prisma.ts"), "utf8");
const postgresStoreSource = readFileSync(resolve("src/repositories/postgres/store.ts"), "utf8");
const taskWorkspaceSource = readFileSync(resolve("src/components/tasks/task-workspace.tsx"), "utf8");
const sidebarSource = readFileSync(resolve("src/components/layout/sidebar.tsx"), "utf8");
const dailyMutationJournalSource = readFileSync(resolve("src/components/tasks/daily-mutation-journal.ts"), "utf8");
const dailyRowSyncBusSource = readFileSync(resolve("src/components/tasks/daily-row-sync-bus.ts"), "utf8");
const dailyRowRealtimeServerSource = readFileSync(resolve("src/lib/tasks/daily-row-realtime-server.ts"), "utf8");
const taskServiceSource = readFileSync(resolve("src/use-cases/task-service.ts"), "utf8");
const updateTaskOrdersSource = postgresStoreSource.slice(
  postgresStoreSource.indexOf("async updateTaskOrders"),
  postgresStoreSource.indexOf("async syncProjectTaskIssueIds"),
);
const postgresSetTaskSiblingOrderSource = postgresStoreSource.slice(
  postgresStoreSource.indexOf("async setTaskSiblingOrder"),
  postgresStoreSource.indexOf("async updateTaskOrders"),
);
const taskReorderQueueSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("const flushTaskReorderQueue = useCallback"),
  taskWorkspaceSource.indexOf("useEffect(() => {", taskWorkspaceSource.indexOf("const flushTaskReorderQueue = useCallback")),
);
const setTaskSiblingOrderSource = taskServiceSource.slice(
  taskServiceSource.indexOf("async function setTaskSiblingOrder"),
  taskServiceSource.indexOf("function assertExpectedTaskVersions"),
);
const reorderTasksSource = taskServiceSource.slice(
  taskServiceSource.indexOf("export async function reorderTasks"),
  taskServiceSource.indexOf("export async function createTask"),
);
const reorderTasksFastPathSource = reorderTasksSource.slice(
  reorderTasksSource.indexOf('if (command.action === "set_sibling_order"'),
  reorderTasksSource.indexOf("const [activeTasks, foundationSettings]"),
);
const taskReorderActionSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("const reorderDailyTasks = useCallback"),
  taskWorkspaceSource.indexOf("const moveTaskByOffset = useCallback"),
);
const selectedTaskSaveSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function saveSelectedTask"),
  taskWorkspaceSource.indexOf("saveSelectedTaskRef.current = saveSelectedTask"),
);
const calendarLinkedSaveSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function saveDetailCalendarLinked"),
  taskWorkspaceSource.indexOf("const saveInlineTaskListField = useCallback"),
);
const inlineTaskSaveSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("const saveInlineTaskListField = useCallback"),
  taskWorkspaceSource.indexOf("const commitInlineTaskCellDocumentField = useCallback"),
);
const taskStatusSaveSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function shiftTaskStatus"),
  taskWorkspaceSource.indexOf("async function moveToTrash"),
);
const restoreTaskSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function restoreTask"),
  taskWorkspaceSource.indexOf("async function uploadFileForTask"),
);
const deleteTaskSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function deleteTaskPermanently"),
  taskWorkspaceSource.indexOf("async function deleteFilePermanently"),
);
const bulkDeleteSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function deleteSelectedTrashItems"),
  taskWorkspaceSource.indexOf("async function emptyTrashItems"),
);
const emptyTrashSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function emptyTrashItems"),
  taskWorkspaceSource.indexOf("function toggleTrashTaskSelection"),
);
const moveFileToTrashSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function moveFileToTrash"),
  taskWorkspaceSource.indexOf("async function restoreFile"),
);
const markDailyMutationSyncedSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("async function markDailyMutationSynced"),
  taskWorkspaceSource.indexOf("async function markDailyMutationPending"),
);
assert.match(taskRouteSource, /clientMutationId/);
assert.match(postgresStoreSource, /const id = input\.id \?\? randomUUID\(\)/);
assert.match(postgresStoreSource, /findUnique\(\{ where: \{ id \} \}\)/);
assert.match(postgresStoreSource, /with input\(id, sibling_order, updated_by, expected_version, has_expected_version\) as/);
assert.match(postgresSetTaskSiblingOrderSource, /input\(id, sibling_order\) as/);
assert.match(postgresSetTaskSiblingOrderSource, /where t\.project_id = \$\{input\.projectId\}::uuid/);
assert.match(postgresSetTaskSiblingOrderSource, /set_config\('lock_timeout', '15000ms', true\)/);
assert.match(postgresSetTaskSiblingOrderSource, /set_config\('statement_timeout', '24000ms', true\)/);
assert.match(postgresSetTaskSiblingOrderSource, /siblingOrderStart \+ index/);
assert.match(postgresSetTaskSiblingOrderSource, /t\.sibling_order is distinct from input\.sibling_order/);
assert.match(postgresSetTaskSiblingOrderSource, /\(select count\(\*\)::integer from updated\) as updated_count/);
assert.match(postgresSetTaskSiblingOrderSource, /return \[\];/);
assert.match(updateTaskOrdersSource, /eligible as/);
assert.doesNotMatch(updateTaskOrdersSource, /prisma\.\$transaction/);
assert.match(postgresStoreSource, /update tasks as t/);
assert.doesNotMatch(postgresStoreSource, /for \(const input of inputs\) \{\s*const data = \{/);
assert.doesNotMatch(
  taskWorkspaceSource,
  /if \(payload\.kind === "reorder"\) \{\s*let currentTasks = dashboardStateByScopeRef\.current\.active\.tasks;\s*if \(areTaskSiblingOrdersEqual\(currentTasks,\s*payload\.desiredTasks\)\)/,
);
assert.doesNotMatch(taskReorderQueueSource, /response\.status === 409\) \{\s*await refreshScope\(\{ force: true \}\);/);
assert.match(taskWorkspaceSource, /const shouldShowWorkspaceLoadingPlaceholder =/);
assert.match(taskWorkspaceSource, /const taskReorderOrderScope = !isPreview && mode === "daily" \? "daily" : null/);
assert.match(
  taskReorderQueueSource,
  /buildTaskReorderRequestBody\(\s*withTaskReorderExpectedVersions\(entry\.command, baseTasks\),\s*baseTasks,\s*taskReorderOrderScope,\s*\)/,
);
assert.match(taskWorkspaceSource, /dailyMutationScope && !dailyMutationJournalReady/);
assert.match(taskWorkspaceSource, /dailyMutationScope && hasActiveDailyReorderJournal/);
assert.match(taskReorderActionSource, /let journalQueued = false/);
assert.match(taskReorderActionSource, /if \(journalQueued\) \{\s*void flushDailyMutationJournal\(\);\s*return true;\s*\}/);
assert.ok(
  taskReorderActionSource.indexOf("await putDailyJournalOperation") <
    taskReorderActionSource.indexOf("setActiveTasksForContinuousReorder"),
  "daily reorder must commit its journal row before rendering the optimistic order",
);
assert.match(
  calendarLinkedSaveSource,
  /await putDailyJournalOperation[\s\S]*addTaskPendingPatchValues[\s\S]*applyTaskClientUpdate/,
);
assert.match(
  selectedTaskSaveSource,
  /if \(dailyMutationScope\) \{[\s\S]*await putDailyJournalOperation[\s\S]*applyTaskClientUpdate/,
);
assert.match(
  inlineTaskSaveSource,
  /if \(dailyMutationScope\) \{[\s\S]*await putDailyJournalOperation[\s\S]*applyTaskClientUpdate/,
);
assert.match(
  taskStatusSaveSource,
  /if \(dailyMutationScope\) \{[\s\S]*await putDailyJournalOperation[\s\S]*applyTaskClientUpdate/,
);
assert.ok(
  restoreTaskSource.indexOf("await putDailyJournalOperation") <
    restoreTaskSource.indexOf('removeTaskIdsFromDashboardScope("trash"'),
  "trash restore must be journaled before its optimistic removal",
);
assert.ok(
  deleteTaskSource.indexOf("await putDailyJournalOperation") <
    deleteTaskSource.indexOf('removeTaskIdsFromDashboardScope("trash"'),
  "permanent task delete must be journaled before its optimistic removal",
);
assert.ok(
  bulkDeleteSource.indexOf("await putDailyJournalOperation") <
    bulkDeleteSource.indexOf('removeTaskIdsFromDashboardScope("trash"'),
  "bulk trash delete must be journaled before its optimistic removal",
);
assert.ok(
  emptyTrashSource.indexOf("await putDailyJournalOperation") <
    emptyTrashSource.indexOf('setDashboardScopeTasks("trash", () => [])'),
  "empty trash must snapshot a journal operation before clearing local state",
);
assert.ok(
  moveFileToTrashSource.indexOf("await putDailyJournalOperation") <
    moveFileToTrashSource.indexOf('removeFileIdsFromDashboardScope("active"'),
  "file trash must commit its journal row before rendering the optimistic move",
);
assert.match(moveFileToTrashSource, /type: "file-trash"[\s\S]*kind: "file-trash"/);
assert.match(moveFileToTrashSource, /void flushDailyMutationJournal\(\);\s*return;/);
assert.match(taskWorkspaceSource, /if \(payload\.kind === "file-trash"\)/);
assert.match(taskWorkspaceSource, /shouldMarkDailyFileTrashMutationSyncedFromServerState/);
assert.match(taskWorkspaceSource, /serverTrashFile[\s\S]*removeFileIdsFromDashboardScope\("trash", \[fileId\]\)/);
assert.match(taskWorkspaceSource, /mode !== "daily" && mode !== "trash"/);
assert.match(taskWorkspaceSource, /dailyMutationFlushRequestedRef\.current = true/);
assert.match(taskWorkspaceSource, /flushDailyMutationJournalRef\.current\(\{ manual: shouldFlushManually \}\)/);
assert.match(taskWorkspaceSource, /rebaseDailySelectionDeleteMutationOperation/);
assert.match(taskWorkspaceSource, /fetchDailySyncFiles\("active"\)/);
assert.match(taskWorkspaceSource, /fetchDailySyncFiles\("trash"\)/);
assert.match(markDailyMutationSyncedSource, /isDailyMutationOperationAttemptCurrent\(current, operation\)/);
assert.match(taskWorkspaceSource, /preserveLocalOrderFields: !didMarkSynced/);
assert.match(
  dailyMutationJournalSource,
  /request\.onsuccess = \(\) => \{\s*result = request\.result;\s*\};\s*transaction\.oncomplete = \(\) => resolve\(result\);/s,
);
assert.doesNotMatch(dailyMutationJournalSource, /request\.onsuccess = \(\) => resolve\(/);
assert.match(taskWorkspaceSource, /const DAILY_MUTATION_FETCH_TIMEOUT_MS = 45000/);
assert.match(taskWorkspaceSource, /error\.name === "AbortError"/);
assert.match(taskRouteSource, /export const maxDuration = 30/);
assert.match(taskReorderRouteSource, /export const maxDuration = 30/);
assert.match(taskReorderRouteSource, /requireCurrentProjectAccess/);
assert.match(taskReorderRouteSource, /const orderProfileId = readOrderProfileId\(body, user\.id\)/);
assert.match(taskReorderRouteSource, /orderProfileId \? await requireCurrentProjectAccess\(user\) : await requireCurrentProjectEditor\(user\)/);
assert.match(taskReorderRouteSource, /reorderTasks\(command, user\.id, context\.project, \{/);
assert.match(taskReorderRouteSource, /orderProfileId,/);
assert.match(taskReorderRouteSource, /readOptionalSiblingOrderStart\(body\.siblingOrderStart\)/);
assert.match(taskWorkspaceSource, /const canReorderDailyTasks =/);
assert.match(taskWorkspaceSource, /canReadProject\(\{/);
assert.match(taskWorkspaceSource, /const isDailyManualReorderDisabled = hasActiveDailyFilters \|\| isPagedDailyListView \|\| !canReorderDailyTasks/);
assert.match(taskWorkspaceSource, /if \(!canReorderDailyTasks\) \{\s*setErrorMessage\(t\("errors\.workspaceReadOnly"\)\);/);
assert.match(taskWorkspaceSource, /canReorderRows=\{canReorderDailyTasks\}/);
assert.match(taskUpdateRouteSource, /export const maxDuration = 30/);
assert.match(taskWorkspaceSource, /dailyCellDocumentsEnabled && isTextCellDocumentField\(field\) && !isOptimisticTaskId\(currentTask\.id\)/);
assert.match(taskWorkspaceSource, /readTextCellDocumentUpdatePatchEntries\(payload as Partial<TaskRecord>\)/);
assert.match(taskWorkspaceSource, /clientMutationId: createDailyMutationId\(\)/);
assert.match(taskWorkspaceSource, /readTextCellDocumentUpdatePatchEntries\(payload\.patch\)/);
assert.match(taskWorkspaceSource, /flushDailyTextCellDocumentMutation\(\{/);
assert.match(taskWorkspaceSource, /fieldKey === "version"/);
assert.match(taskWorkspaceSource, /\/api\/task-cell-documents\/\$\{encodeURIComponent\(input\.taskId\)\}\/\$\{encodeURIComponent\(fieldKey\)\}\/updates/);
assert.match(taskWorkspaceSource, /publishCellDocumentUpdateEvent\(\{/);
assert.match(taskTrashRouteSource, /export const maxDuration = 30/);
assert.match(prismaSource, /const DEFAULT_DATABASE_POOL_MAX = process\.env\.VERCEL \? 1 : 3/);
assert.match(prismaSource, /const DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS = process\.env\.VERCEL \? 2_000 : 10_000/);
assert.match(prismaSource, /function buildRuntimeDatabaseUrl\(databaseUrl: string\)/);
assert.match(prismaSource, /parsed\.hostname\.endsWith\("\.pooler\.supabase\.com"\) && parsed\.port === "5432"/);
assert.match(prismaSource, /parsed\.port = "6543"/);
assert.match(prismaSource, /parsed\.searchParams\.set\("pgbouncer", "true"\)/);
assert.match(prismaSource, /allowExitOnIdle: true/);
assert.match(taskWorkspaceSource, /const DAILY_REORDER_FAILED_SETTLEMENT_CHECK_MS = 30000/);
assert.match(taskWorkspaceSource, /async function fetchDailyMutationRequest/);
assert.match(taskWorkspaceSource, /const localFirstTasks = useMemo/);
assert.match(taskWorkspaceSource, /buildStoredOrderTaskTree\(localFirstTasks\)/);
assert.match(taskWorkspaceSource, /localFirstActiveTasksRef\.current\.length/);
assert.match(taskWorkspaceSource, /siblingOrderStart/);
assert.match(taskWorkspaceSource, /const operations = await refreshDailyMutationJournal\(\);/);
assert.match(taskWorkspaceSource, /operation\.status === "failed" && !options\.manual/);
assert.match(taskWorkspaceSource, /settleDailyFailedReorderIfServerSatisfiedRef\.current\(operation, now\)/);
assert.match(taskWorkspaceSource, /operation\.status === "failed" \|\| operation\.retryCount > 0/);
assert.match(taskWorkspaceSource, /isDailyReorderMutationSatisfiedByServerState\(operation, currentTasks\)/);
assert.match(taskWorkspaceSource, /const discardFailedDailyMutations = useCallback/);
assert.match(taskWorkspaceSource, /deleteDailyMutationOperation\(operation\.operationId\)/);
assert.match(taskRouteSource, /meta: \{ timings: timing\.timings \}/);
assert.match(taskRouteSource, /Server-Timing/);
assert.match(taskServiceSource, /service\.effectiveCategories/);
assert.match(taskServiceSource, /service\.repositoryCreate/);
assert.match(postgresStoreSource, /repository\.lockAndTaskNumberLookup/);
assert.doesNotMatch(postgresStoreSource, /repository\.advisoryLock/);
assert.doesNotMatch(postgresStoreSource, /repository\.maxTaskNumberLookup/);
assert.match(postgresStoreSource, /repository\.siblingOrderAggregate/);
assert.match(dailyMutationJournalSource, /cleanupSyncedDailyMutationOperations/);
assert.match(dailyMutationJournalSource, /DAILY_MUTATION_SYNCED_RETENTION_MS/);
assert.match(taskWorkspaceSource, /publishDailyRowSyncOperationEvent/);
assert.match(taskWorkspaceSource, /subscribeDailyRowSyncEvents/);
assert.match(taskWorkspaceSource, /event\.task/);
assert.match(taskWorkspaceSource, /withEmptyTaskFileSummary\(event\.task\)/);
assert.match(taskWorkspaceSource, /event\.sourceId\.startsWith\("server:"\)/);
assert.match(taskWorkspaceSource, /event\.sourceId\.startsWith\("db:"\)/);
assert.match(taskWorkspaceSource, /postgres_changes/);
assert.match(taskWorkspaceSource, /filter: `project_id=eq\.\$\{currentProjectId\}`/);
assert.match(dailyRowSyncBusSource, /createSupabaseBrowserClient/);
assert.match(dailyRowSyncBusSource, /private: true/);
assert.match(dailyRowSyncBusSource, /buildDailyRowSyncProjectScopeKey/);
assert.match(dailyRowSyncBusSource, /buildDailyRowSyncSupabaseChannelName/);
assert.match(dailyRowSyncBusSource, /DAILY_ROW_SYNC_SUPABASE_EVENT_NAME/);
assert.match(dailyRowSyncBusSource, /setSupabaseRealtimeAuth/);
assert.match(dailyRowSyncBusSource, /supabase\.realtime\.setAuth/);
assert.match(dailyRowSyncBusSource, /publishSupabaseDailyRowSyncEvent/);
assert.match(dailyRowSyncBusSource, /subscribeSupabaseDailyRowSyncEvents/);
assert.match(taskRouteSource, /route\.publishDailyRealtime/);
assert.match(taskRouteSource, /publishDailyRowRealtimeInvalidation/);
assert.match(dailyRowRealtimeServerSource, /channel\.httpSend/);
assert.match(dailyRowRealtimeServerSource, /buildDailyRowSyncProjectScopeKey/);
assert.match(taskWorkspaceSource, /dailyMutationRemoteRefreshSuppressFlushUntilRef/);
assert.match(taskWorkspaceSource, /a\[href\], \.daily-sheet__view-mode-toggle/);
assert.match(sidebarSource, /markWorkspaceRouteTransition\(mode, targetHref\)/);
assert.match(sidebarSource, /event\.preventDefault\(\)/);
assert.match(sidebarSource, /window\.history\.pushState\(window\.history\.state, "", targetPath\)/);
assert.match(sidebarSource, /new PopStateEvent\("popstate", \{ state: window\.history\.state \}\)/);
assert.doesNotMatch(sidebarSource, /window\.location\.assign\(targetUrl\.href\)/);
assert.match(reorderTasksSource, /selectedProject\?: TaskProjectContext/);
assert.match(reorderTasksSource, /command\.action === "set_sibling_order" && taskRepository\.setTaskSiblingOrder/);
assert.match(reorderTasksSource, /taskRepository\.setTaskSiblingOrder\(\{/);
assert.doesNotMatch(reorderTasksFastPathSource, /loadAdminFoundationSettings/);
assert.doesNotMatch(reorderTasksFastPathSource, /listActiveTasks/);
assert.doesNotMatch(reorderTasksSource, /loadTaskFileSummaryByScope\("active"/);
assert.match(reorderTasksSource, /fileSummary: emptyTaskFileSummary/);
assert.doesNotMatch(setTaskSiblingOrderSource, /assertExpectedTaskVersions\(siblings,\s*expectedVersions\)/);
assert.match(setTaskSiblingOrderSource, /expectedVersion: task\.version/);
assert.equal(isDatabaseConnectivityError(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })), true);
assert.equal(isDatabaseConnectivityError(Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" })), true);
assert.equal(
  isDatabaseConnectivityError(
    Object.assign(new Error("Raw query failed. Code: `57014`. Message: `canceling statement due to statement timeout`"), {
      code: "P2010",
      meta: { code: "57014" },
    }),
  ),
  true,
);

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

type InMemoryIdbRequest<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
};

type InMemoryIdbTransaction = {
  pending: number;
  completed: boolean;
  completionQueued: boolean;
  error: DOMException | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: (name: string) => IDBObjectStore;
};

function installInMemoryIndexedDb() {
  const records = new Map<string, unknown>();
  let storeCreated = false;

  const createTransaction = (): IDBTransaction => {
    const transaction: InMemoryIdbTransaction = {
      pending: 0,
      completed: false,
      completionQueued: false,
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: () => createObjectStore(transaction),
    };
    return transaction as unknown as IDBTransaction;
  };

  const completeTransactionWhenIdle = (transaction: InMemoryIdbTransaction) => {
    if (transaction.pending > 0 || transaction.completed || transaction.completionQueued) {
      return;
    }
    transaction.completionQueued = true;
    queueMicrotask(() => {
      transaction.completionQueued = false;
      if (transaction.pending === 0 && !transaction.completed) {
        transaction.completed = true;
        transaction.oncomplete?.();
      }
    });
  };

  const createObjectStore = (transaction: InMemoryIdbTransaction): IDBObjectStore => {
    const createRequest = <T>(producer: () => T) => {
      const request: InMemoryIdbRequest<T> = {
        result: undefined as T,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      transaction.pending += 1;
      queueMicrotask(() => {
        try {
          request.result = producer();
          request.onsuccess?.();
        } catch (error) {
          request.error = error instanceof DOMException ? error : new DOMException(String(error));
          transaction.error = request.error;
          request.onerror?.();
          transaction.onerror?.();
        } finally {
          transaction.pending -= 1;
          completeTransactionWhenIdle(transaction);
        }
      });
      return request as unknown as IDBRequest<T>;
    };

    return {
      indexNames: { contains: () => false },
      createIndex: () => ({}) as IDBIndex,
      getAll: () => createRequest(() => [...records.values()].map((value) => structuredClone(value))),
      get: (key: IDBValidKey | IDBKeyRange) =>
        createRequest(() => structuredClone(records.get(String(key)))),
      put: (value: unknown) =>
        createRequest(() => {
          const operationId = (value as { operationId: string }).operationId;
          records.set(operationId, structuredClone(value));
          return operationId;
        }),
      delete: (key: IDBValidKey | IDBKeyRange) =>
        createRequest(() => {
          records.delete(String(key));
          return undefined;
        }),
    } as unknown as IDBObjectStore;
  };

  const database = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => {
      storeCreated = true;
      return createObjectStore(createTransaction() as unknown as InMemoryIdbTransaction);
    },
    transaction: () => createTransaction(),
    close: () => undefined,
    onversionchange: null,
  } as unknown as IDBDatabase;

  const factory = {
    open: () => {
      const request = {
        result: database,
        error: null,
        transaction: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      } as {
        result: IDBDatabase;
        error: DOMException | null;
        transaction: IDBTransaction | null;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      };
      queueMicrotask(() => {
        if (!storeCreated) {
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: factory,
  });
}

async function assertFileTrashJournalReplayAndAck() {
  installInMemoryIndexedDb();
  await putDailyMutationOperation(pendingFileTrashOperation);

  const replayOperations = await listDailyMutationOperations(journalScope);
  assert.equal(replayOperations.length, 1);
  assert.equal(replayOperations[0]?.status, "pending");
  assert.equal(
    mergeDailyMutationOperationsIntoActiveFiles([activeFileToTrash], replayOperations).length,
    0,
  );
  assert.equal(
    mergeDailyMutationOperationsIntoTrashFiles([], replayOperations)[0]?.id,
    activeFileToTrash.id,
  );

  await updateDailyMutationOperation(pendingFileTrashOperation.operationId, (operation) => ({
    ...operation,
    status: "synced",
    updatedAt: "2026-05-21T00:00:03.000Z",
  }));
  const acknowledgedOperations = await listDailyMutationOperations(journalScope);
  assert.equal(acknowledgedOperations[0]?.status, "synced");
  assert.equal(
    mergeDailyMutationOperationsIntoActiveFiles([activeFileToTrash], acknowledgedOperations)[0]?.id,
    activeFileToTrash.id,
  );

  await deleteDailyMutationOperation(pendingFileTrashOperation.operationId);
  assert.deepEqual(await listDailyMutationOperations(journalScope), []);
}

async function assertDatabaseUnavailableRouteError() {
  const routeErrorConsoleErrors: unknown[][] = [];
  try {
    console.error = (...args: unknown[]) => {
      routeErrorConsoleErrors.push(args);
    };
    console.warn = () => undefined;
    const databaseErrorResponse = handleRouteError(
      Object.assign(new Error("Timed out fetching a new connection"), { code: "P2024" }),
    );
    assert.equal(databaseErrorResponse.status, 503);
    const databaseErrorBody = await databaseErrorResponse.json();
    assert.equal(databaseErrorBody.error?.code, "DATABASE_UNAVAILABLE");
    assert.deepEqual(routeErrorConsoleErrors, []);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
}

Promise.all([assertFileTrashJournalReplayAndAck(), assertDatabaseUnavailableRouteError()])
  .then(() => {
    console.log("daily editing category fallback policy: ok");
    console.log("daily editing optimistic patch policy: ok");
    console.log("daily editing local auth origin policy: ok");
    console.log("daily editing request integrity policy: ok");
    console.log("daily editing database unavailable policy: ok");
    console.log("daily editing optimistic create load-race policy: ok");
    console.log("daily editing durable mutation journal policy: ok");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
