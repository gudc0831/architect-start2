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
  buildCoalescedDailyReorderOperation,
  buildDailyMutationOperation,
  buildDailyOptimisticTaskId,
  coalesceDailyReorderOperations,
  mergeDailyMutationOperationsIntoActiveTasks,
  reconcileDailyMutationCreateSuccess,
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

const taskRouteSource = readFileSync(resolve("src/app/api/tasks/route.ts"), "utf8");
const postgresStoreSource = readFileSync(resolve("src/repositories/postgres/store.ts"), "utf8");
assert.match(taskRouteSource, /clientMutationId/);
assert.match(postgresStoreSource, /const id = input\.id \?\? randomUUID\(\)/);
assert.match(postgresStoreSource, /findUnique\(\{ where: \{ id \} \}\)/);

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
