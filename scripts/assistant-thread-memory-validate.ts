import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const migrationPath = join(
    process.cwd(),
    "prisma",
    "migrations",
    "202606010001_add_assistant_threads_and_legal_change_events",
    "migration.sql",
  );
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /create table if not exists "assistant_threads"/);
  assert.match(migration, /create table if not exists "assistant_thread_messages"/);
  assert.match(migration, /"thread_id" uuid not null references "assistant_threads"\("id"\) on delete cascade/);
  assert.match(migration, /"assistant_record_id" uuid references "assistant_task_records"\("id"\) on delete set null/);
  assert.match(migration, /"profile_id" uuid not null references "profiles"\("id"\) on delete cascade/);
  assert.match(migration, /create index if not exists "assistant_threads_project_task_updated_idx"/);
  assert.match(migration, /create index if not exists "assistant_thread_messages_thread_created_idx"/);
  assert.match(migration, /alter table public\.assistant_threads enable row level security/);
  assert.match(migration, /alter table public\.assistant_thread_messages enable row level security/);
  assert.match(migration, /app_private\.can_access_task/);
  assert.match(migration, /app_private\.can_write_task/);
  assert.match(migration, /profile_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /profile_id is null/);
  assert.match(migration, /assistant_record_id is null/);
  assert.match(migration, /from public\.assistant_task_records record/);
  assert.match(migration, /record\.id = assistant_record_id/);
  assert.match(migration, /record\.project_id = thread\.project_id/);
  assert.match(migration, /thread\.task_id is null or record\.task_id = thread\.task_id/);

  const schema = await readFile(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  assert.match(schema, /model AssistantThread \{/);
  assert.match(schema, /model AssistantThreadMessage \{/);
  assert.match(schema, /summaryProvenance\s+Json\s+@default\("\{\}"\)\s+@map\("summary_provenance"\)/);
  assert.match(schema, /@@map\("assistant_threads"\)/);
  assert.match(schema, /@@map\("assistant_thread_messages"\)/);

  const contracts = await readFile(join(process.cwd(), "src", "repositories", "assistant", "contracts.ts"), "utf8");
  assert.match(contracts, /createThread\(input: CreateAssistantThreadInput\): Promise<AssistantThread>/);
  assert.match(contracts, /appendThreadMessage\(input: AppendAssistantThreadMessageInput\): Promise<AssistantThreadMessage>/);
  assert.match(contracts, /listRecentThreadMessages\(threadId: string, limit: number\): Promise<AssistantThreadMessage\[]>/);
  assert.match(contracts, /updateThreadSummary\(threadId: string, summary: string, provenance: AssistantThreadSummaryProvenance\): Promise<void>/);
  assert.match(contracts, /findThreadByTask\(taskId: string\): Promise<AssistantThread \| null>/);
  const postgresStore = await readFile(join(process.cwd(), "src", "repositories", "assistant", "postgres-store.ts"), "utf8");
  assert.match(postgresStore, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(postgresStore, /assistantTx\.assistantThread\.update/);
  assert.match(postgresStore, /assistantTx\.assistantThreadMessage\.create/);
  assert.equal(
    postgresStore.indexOf("assistantTx.assistantThread.update") < postgresStore.indexOf("assistantTx.assistantThreadMessage.create"),
    true,
  );

  const previousLocalDataRoot = process.env.LOCAL_DATA_ROOT;
  const previousDataGuardMode = process.env.DATA_GUARD_MODE;
  const localDataRoot = await mkdtemp(join(tmpdir(), "assistant-thread-memory-"));
  process.env.LOCAL_DATA_ROOT = localDataRoot;
  process.env.DATA_GUARD_MODE = "warn";

  const { buildAssistantMemoryRetrievalQuery } = await import("../src/use-cases/assistant-service");
  assert.equal(typeof buildAssistantMemoryRetrievalQuery, "function");
  const memoryRetrievalQuery = buildAssistantMemoryRetrievalQuery({
    question: "Current setback question",
    taskTitle: "Setback review",
    taskIssueDetail: "서울 대지안의 공지 검토",
    threadSummary: "Earlier exchange focused on parking slope.",
    recentMessages: [
      { role: "assistant", content: "Older assistant answer" },
      { role: "user", content: "Last user follow-up about local ordinance" },
      { role: "assistant", content: "[STALE_EVIDENCE_EXCERPT] outdated article excerpt" },
    ],
  });
  assert.match(memoryRetrievalQuery, /Current setback question/);
  assert.match(memoryRetrievalQuery, /Earlier exchange focused on parking slope/);
  assert.match(memoryRetrievalQuery, /Last user follow-up about local ordinance/);
  assert.match(memoryRetrievalQuery, /Setback review/);
  assert.match(memoryRetrievalQuery, /서울 대지안의 공지 검토/);
  assert.doesNotMatch(memoryRetrievalQuery, /outdated article excerpt/);
  const oversizedMemoryRetrievalQuery = buildAssistantMemoryRetrievalQuery({
    question: "Q".repeat(5000),
    taskTitle: "Bounded task title",
    taskIssueDetail: "Bounded task issue detail",
    threadSummary: "S".repeat(5000),
    recentMessages: Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `message-${index}-${"M".repeat(3000)}`,
    })),
  });
  assert.equal(oversizedMemoryRetrievalQuery.length <= 6000, true);
  assert.match(oversizedMemoryRetrievalQuery, /Bounded task title/);
  assert.match(oversizedMemoryRetrievalQuery, /Bounded task issue detail/);

  const { buildThreadMemory, normalizeThreadSummaryUpdate, shouldRefreshThreadSummary } = await import("../src/domains/assistant/thread-memory");
  assert.equal(typeof buildThreadMemory, "function");
  assert.equal(typeof normalizeThreadSummaryUpdate, "function");
  assert.equal(typeof shouldRefreshThreadSummary, "function");

  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousVerifiedLegalSecret = process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET;
  try {
    const openAiLikeSecret = ["sk", "thread", "secret"].join("-");
    const verifiedLegalSecret = ["verified", "legal", "thread", "secret"].join("-");
    process.env.OPENAI_API_KEY = openAiLikeSecret;
    process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET = verifiedLegalSecret;

    const recentMessages = [
      { role: "system" as const, content: "system kickoff" },
      { role: "user" as const, content: "message 1" },
      { role: "assistant" as const, content: "message 2" },
      { role: "user" as const, content: "message 3" },
      { role: "assistant" as const, content: "message 4" },
      { role: "user" as const, content: "message 5" },
      { role: "assistant" as const, content: "message 6" },
      { role: "user" as const, content: "message 7" },
    ];

    const defaultMemory = buildThreadMemory({
      currentQuestion: `How should this setback issue proceed with ${openAiLikeSecret}?`,
      threadSummary: `Prior summary with ${verifiedLegalSecret} and active decision context.`,
      recentMessages,
      maxRecentMessages: 0,
    });
    assert.match(defaultMemory, /Current question:/);
    assert.match(defaultMemory, /How should this setback issue proceed/);
    assert.match(defaultMemory, /Thread summary:/);
    assert.match(defaultMemory, /active decision context/);
    assert.equal(defaultMemory.includes(openAiLikeSecret), false);
    assert.equal(defaultMemory.includes(verifiedLegalSecret), false);
    assert.doesNotMatch(defaultMemory, /system kickoff|message 1/);
    assert.match(defaultMemory, /Assistant: message 2/);
    assert.match(defaultMemory, /User: message 7/);
    assert.ok(defaultMemory.indexOf("Assistant: message 2") < defaultMemory.indexOf("User: message 7"));
    assert.equal(defaultMemory.endsWith("\n"), false);
    assert.doesNotMatch(defaultMemory, /\n{3,}/);

    const limitedMemory = buildThreadMemory({
      currentQuestion: "Current question",
      threadSummary: "   ",
      recentMessages: [
        ...recentMessages,
        { role: "system" as const, content: "do not reveal internal instruction" },
      ],
      maxRecentMessages: 3,
    });
    assert.doesNotMatch(limitedMemory, /Thread summary:/);
    assert.doesNotMatch(limitedMemory, /message 5/);
    assert.match(limitedMemory, /Assistant: message 6/);
    assert.match(limitedMemory, /User: message 7/);
    assert.doesNotMatch(limitedMemory, /System:|internal instruction/);

    const staleMemory = buildThreadMemory({
      currentQuestion: "Use only current legal basis.",
      threadSummary: "Stale evidence warning remains allowed.",
      recentMessages: [
        {
          role: "assistant",
          content:
            "Current fact remains relevant.\n[STALE_EVIDENCE_EXCERPT] outdated legal excerpt must disappear",
        },
      ],
      maxRecentMessages: 6,
    });
    assert.match(staleMemory, /Current fact remains relevant/);
    assert.match(staleMemory, /Stale evidence warning remains allowed/);
    assert.doesNotMatch(staleMemory, /outdated legal excerpt must disappear/);

    const structuredStaleMemory = buildThreadMemory({
      currentQuestion: "Use only current legal basis.",
      threadSummary: "",
      recentMessages: [{
        role: "assistant",
        content: "Unmarked obsolete legal excerpt should disappear.",
        evidenceSnapshot: [{
          id: "legal:stale",
          kind: "regulation",
          priority: 2,
          title: "Stale legal evidence",
          excerpt: "Unmarked obsolete legal excerpt should disappear.",
          legal: {
            sourceId: "law:stale",
            sourceKind: "statute",
            authorityRank: "statute",
            stale: true,
            legalChangeWarnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
          },
        }],
      }],
      maxRecentMessages: 6,
    });
    assert.doesNotMatch(structuredStaleMemory, /Unmarked obsolete legal excerpt/);
    assert.match(structuredStaleMemory, /stale legal evidence/i);
    assert.match(structuredStaleMemory, /LEGAL_CHANGE_REVIEW_REQUIRED/);

    const lifecycleMessages = Array.from({ length: 8 }, (_, index) => ({
      id: `message:${index + 1}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `conversation message ${index + 1}`,
    }));
    assert.equal(shouldRefreshThreadSummary({
      threadSummary: "",
      recentMessages: lifecycleMessages.slice(0, 7),
      provenance: null,
    }), false);
    assert.equal(shouldRefreshThreadSummary({
      threadSummary: "",
      recentMessages: lifecycleMessages,
      provenance: null,
    }), true);
    assert.equal(shouldRefreshThreadSummary({
      threadSummary: "Existing summary",
      recentMessages: lifecycleMessages,
      provenance: { sourceMessageIds: lifecycleMessages.slice(0, 2).map((message) => message.id) },
    }), true);
    assert.equal(shouldRefreshThreadSummary({
      threadSummary: "x".repeat(1801),
      recentMessages: lifecycleMessages.slice(0, 2),
      provenance: { sourceMessageIds: lifecycleMessages.slice(0, 2).map((message) => message.id) },
    }), true);

    const summaryUpdate = normalizeThreadSummaryUpdate({
      summary: `${"Current conversation fact. ".repeat(90)}\n[STALE_EVIDENCE_EXCERPT] outdated active basis`,
      provenance: {
        sourceMessageIds: ["message:1", "message:1", "message:2"],
        generatedAt: "2026-05-31T00:00:00.000Z",
        provider: "mock",
        model: "deterministic",
      },
    });
    assert.equal(summaryUpdate.summary.length < 1400, true);
    assert.doesNotMatch(summaryUpdate.summary, /outdated active basis/);
    assert.deepEqual(summaryUpdate.provenance.sourceMessageIds, ["message:1", "message:2"]);
    assert.equal(summaryUpdate.provenance.generatedAt, "2026-05-31T00:00:00.000Z");
  } finally {
    restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_API_SECRET", previousVerifiedLegalSecret);
  }

  const assistantPromptModule = await import("../src/domains/assistant/saas-api-mode");
  const promptText = assistantPromptModule.buildAssistantPromptText({
    taskTitle: "Task",
    question: "Question",
    instruction: "Instruction",
    conversationMemory: "Thread summary and last user follow-up",
    evidence: [],
    evidenceReadinessWarnings: [{ code: "LEGAL_CHANGE", message: "legal-change warning" }],
  });
  assert.match(promptText, /Conversation memory:/);
  assert.match(promptText, /Thread summary and last user follow-up/);
  assert.match(promptText, /Legal evidence:/);
  assert.match(promptText, /Project upload context:/);
  assert.match(promptText, /Other evidence:/);
  assert.match(promptText, /Evidence readiness warnings:/);
  assert.match(promptText, /AI review answer contract v1:/);
  assert.match(promptText, /## 결론/);
  assert.match(promptText, /## 근거/);
  assert.match(promptText, /## 리스크/);
  assert.match(promptText, /## 후속 조치/);
  assert.match(promptText, /\[evidence:<evidence id>\]/);

  const assistantServiceSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-service.ts"), "utf8");
  assert.match(assistantServiceSource, /assistantRepository\.findThreadByTask/);
  assert.match(assistantServiceSource, /assistantRepository\.listRecentThreadMessages/);
  assert.match(assistantServiceSource, /buildAssistantMemoryRetrievalQuery/);
  assert.match(assistantServiceSource, /conversationMemory/);

  const assistantSaasModeSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-saas-mode-service.ts"), "utf8");
  assert.match(assistantSaasModeSource, /conversationMemory:\s*retrieved\.conversationMemory/);

  try {
    const { localAssistantRepository } = await import("../src/repositories/assistant/local-store");
    const thread = await localAssistantRepository.createThread({
      projectId: "project-thread",
      taskId: "task-thread",
      profileId: "profile-thread",
      title: "Thread title",
    });
    assert.equal(thread.summary, "");
    assert.deepEqual(thread.summaryProvenance, {});
    assert.equal((await localAssistantRepository.findThreadByTask("task-thread"))?.id, thread.id);

    for (const index of [1, 2, 3, 4]) {
      await localAssistantRepository.appendThreadMessage({
        threadId: thread.id,
        role: index % 2 === 0 ? "assistant" : "user",
        content: `stored message ${index}`,
        evidenceSnapshot: index === 2 ? [{ id: "evidence:2", kind: "task", priority: 3, title: "Evidence", excerpt: "Evidence excerpt" }] : [],
      });
    }

    const recentMessages = await localAssistantRepository.listRecentThreadMessages(thread.id, 2);
    assert.deepEqual(recentMessages.map((message) => message.content), ["stored message 3", "stored message 4"]);
    assert.equal((recentMessages[0]?.createdAt ?? "") <= (recentMessages[1]?.createdAt ?? ""), true);

    await localAssistantRepository.updateThreadSummary(thread.id, "x".repeat(1600), {
      sourceMessageIds: recentMessages.map((message) => message.id),
      generatedAt: "2026-05-31T01:00:00.000Z",
      provider: "mock",
      model: "deterministic",
    });
    const summarizedThread = await localAssistantRepository.findThreadByTask("task-thread");
    assert.equal((summarizedThread?.summary.length ?? 0) < 1400, true);
    assert.deepEqual(summarizedThread?.summaryProvenance.sourceMessageIds, recentMessages.map((message) => message.id));

    await assertRejectsNotFound(() => localAssistantRepository.appendThreadMessage({
      threadId: "missing-thread",
      role: "user",
      content: "must not be orphaned",
      evidenceSnapshot: [],
    }));
    await assertRejectsNotFound(() =>
      localAssistantRepository.updateThreadSummary("missing-thread", "missing summary", { sourceMessageIds: [] }),
    );
    assert.deepEqual(
      (await localAssistantRepository.listRecentThreadMessages("missing-thread", 10)).map((message) => message.content),
      [],
    );
  } finally {
    restoreEnv("LOCAL_DATA_ROOT", previousLocalDataRoot);
    restoreEnv("DATA_GUARD_MODE", previousDataGuardMode);
    await rm(localDataRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ status: "assistant-thread-memory-pass", cases: 7 }));
}

async function assertRejectsNotFound(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, /thread not found/i);
}

main();

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}
