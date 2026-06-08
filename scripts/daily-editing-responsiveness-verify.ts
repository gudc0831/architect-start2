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
import { buildStoredOrderTaskTree } from "@/domains/task/ordering";
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
const taskReorderRouteSource = readFileSync(resolve("src/app/api/tasks/reorder/route.ts"), "utf8");
const taskUpdateRouteSource = readFileSync(resolve("src/app/api/tasks/[taskId]/route.ts"), "utf8");
const taskTrashRouteSource = readFileSync(resolve("src/app/api/tasks/[taskId]/trash/route.ts"), "utf8");
const prismaSource = readFileSync(resolve("src/lib/prisma.ts"), "utf8");
const postgresStoreSource = readFileSync(resolve("src/repositories/postgres/store.ts"), "utf8");
const taskWorkspaceSource = readFileSync(resolve("src/components/tasks/task-workspace.tsx"), "utf8");
const sidebarSource = readFileSync(resolve("src/components/layout/sidebar.tsx"), "utf8");
const dailyMutationJournalSource = readFileSync(resolve("src/components/tasks/daily-mutation-journal.ts"), "utf8");
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
assert.match(taskReorderActionSource, /if \(journalQueued\) \{\s*return true;\s*\}/);
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
assert.match(taskWorkspaceSource, /postgres_changes/);
assert.match(taskWorkspaceSource, /filter: `project_id=eq\.\$\{currentProjectId\}`/);
assert.match(taskWorkspaceSource, /dailyMutationRemoteRefreshSuppressFlushUntilRef/);
assert.match(taskWorkspaceSource, /a\[href\], \.daily-sheet__view-mode-toggle/);
assert.match(sidebarSource, /const WORKSPACE_NAVIGATION_FALLBACK_DELAY_MS = 1_000/);
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
