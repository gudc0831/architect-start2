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
  isDailyReorderMutationSatisfiedByServerState,
  mergeDailyMutationOperationsIntoActiveTasks,
  mergeDailyMutationOperationsIntoTrashTasks,
  rebaseDailyReorderMutationOperation,
  rebaseDailyUpdateMutationOperation,
  reconcileDailyMutationCreateSuccess,
  shouldMarkDailyDeleteMutationSyncedFromServerState,
  shouldMarkDailyTrashMutationSyncedFromServerState,
  shouldRecoverLegacyFailedDailyMutation,
  summarizeDailyMutationOperations,
} from "@/components/tasks/daily-mutation-journal";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { TaskRecord } from "@/domains/task/types";
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
assert.equal(isDatabaseConnectivityError(new Error("validation failed")), false);
assert.equal(
  localizeError({ code: "DATABASE_UNAVAILABLE", fallbackKey: "loadTasksFailed" }),
  "데이터베이스 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
);

const dashboardProviderSource = readFileSync(resolve("src/providers/dashboard-provider.tsx"), "utf8");
assert.match(
  dashboardProviderSource,
  /const invalidateDashboardScopeRead = useCallback\(\(scope: DashboardScope\) => \{\s*requestIdRef\.current\[scope\] \+= 1;\s*delete inFlightRef\.current\[scope\];\s*\}, \[\]\);/s,
);
assert.match(
  dashboardProviderSource,
  /const setDashboardTasks = useCallback\(\s*\(scope: DashboardScope, updater: SetStateAction<TaskRecord\[\]>\) => \{\s*invalidateDashboardScopeRead\(scope\);/s,
);

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

const taskRouteSource = readFileSync(resolve("src/app/api/tasks/route.ts"), "utf8");
const postgresStoreSource = readFileSync(resolve("src/repositories/postgres/store.ts"), "utf8");
const taskWorkspaceSource = readFileSync(resolve("src/components/tasks/task-workspace.tsx"), "utf8");
const taskServiceSource = readFileSync(resolve("src/use-cases/task-service.ts"), "utf8");
const taskReorderQueueSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("const flushTaskReorderQueue = useCallback"),
  taskWorkspaceSource.indexOf("useEffect(() => {", taskWorkspaceSource.indexOf("const flushTaskReorderQueue = useCallback")),
);
const setTaskSiblingOrderSource = taskServiceSource.slice(
  taskServiceSource.indexOf("async function setTaskSiblingOrder"),
  taskServiceSource.indexOf("function assertExpectedTaskVersions"),
);
const taskReorderActionSource = taskWorkspaceSource.slice(
  taskWorkspaceSource.indexOf("const reorderDailyTasks = useCallback"),
  taskWorkspaceSource.indexOf("const moveTaskByOffset = useCallback"),
);
assert.match(taskRouteSource, /clientMutationId/);
assert.match(postgresStoreSource, /const id = input\.id \?\? randomUUID\(\)/);
assert.match(postgresStoreSource, /findUnique\(\{ where: \{ id \} \}\)/);
assert.match(postgresStoreSource, /with input\(id, sibling_order, updated_by, expected_version, has_expected_version\) as/);
assert.match(postgresStoreSource, /update tasks as t/);
assert.doesNotMatch(postgresStoreSource, /for \(const input of inputs\) \{\s*const data = \{/);
assert.doesNotMatch(
  taskWorkspaceSource,
  /if \(payload\.kind === "reorder"\) \{\s*let currentTasks = dashboardStateByScopeRef\.current\.active\.tasks;\s*if \(areTaskSiblingOrdersEqual\(currentTasks,\s*payload\.desiredTasks\)\)/,
);
assert.doesNotMatch(taskReorderQueueSource, /response\.status === 409\) \{\s*await refreshScope\(\{ force: true \}\);/);
assert.match(taskWorkspaceSource, /const shouldShowWorkspaceLoadingPlaceholder =/);
assert.match(taskReorderQueueSource, /buildTaskReorderRequestBody\(withTaskReorderExpectedVersions\(entry\.command, baseTasks\), baseTasks\)/);
assert.match(taskWorkspaceSource, /dailyMutationScope && !dailyMutationJournalReady/);
assert.match(taskWorkspaceSource, /dailyMutationScope && hasActiveDailyReorderJournal/);
assert.match(taskReorderActionSource, /let journalQueued = false/);
assert.match(taskReorderActionSource, /if \(journalQueued\) \{\s*return true;\s*\}/);
assert.match(taskWorkspaceSource, /const DAILY_MUTATION_FETCH_TIMEOUT_MS = 15000/);
assert.match(taskWorkspaceSource, /const DAILY_REORDER_FAILED_SETTLEMENT_CHECK_MS = 30000/);
assert.match(taskWorkspaceSource, /async function fetchDailyMutationRequest/);
assert.match(taskWorkspaceSource, /const operations = await refreshDailyMutationJournal\(\);/);
assert.match(taskWorkspaceSource, /operation\.status === "failed" && !options\.manual/);
assert.match(taskWorkspaceSource, /settleDailyFailedReorderIfServerSatisfiedRef\.current\(operation, now\)/);
assert.match(taskWorkspaceSource, /operation\.status === "failed" \|\| operation\.retryCount > 0/);
assert.match(taskWorkspaceSource, /isDailyReorderMutationSatisfiedByServerState\(operation, currentTasks\)/);
assert.doesNotMatch(setTaskSiblingOrderSource, /assertExpectedTaskVersions\(siblings,\s*expectedVersions\)/);
assert.match(setTaskSiblingOrderSource, /expectedVersion: task\.version/);

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
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

assertDatabaseUnavailableRouteError()
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
