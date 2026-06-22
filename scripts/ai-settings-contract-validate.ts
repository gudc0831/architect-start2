import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createLocalUsageCacheKey,
  localUsageCacheTtlMs,
  readLocalUsageCache,
  writeLocalUsageCache,
  type LocalUsageCacheStorage,
} from "../src/components/ai-settings/local-usage-cache";
import {
  buildCombinedUsageMetrics,
  type LocalCodexUsageSummary,
} from "../src/components/ai-settings/usage-aggregation";
import {
  normalizeModelCatalog,
  type LocalCodexModelCatalog,
} from "../src/components/ai-settings/model-catalog-normalization";
import { sanitizeAiSettingsPreference } from "../src/domains/preferences/types";
import { buildMyAssistantUsageSummary } from "../src/use-cases/assistant-usage-service";

const root = process.cwd();

const preference = sanitizeAiSettingsPreference({
  aiDefaultModel: "gpt-5-codex",
  aiReasoningEffort: "xhigh",
  aiServiceTier: "priority",
  aiRequestTimeoutMs: 999999,
  aiLocalUsageDefaultRangeDays: 90,
  aiLocalCodexNoHistory: true,
});
assert.equal(sanitizeAiSettingsPreference({}).aiDefaultModel, "gpt-5.5");
assert.equal(preference.aiDefaultModel, "gpt-5.5");
assert.equal(preference.aiReasoningEffort, "medium");
assert.equal(preference.aiServiceTier, "auto");
assert.equal(preference.aiRequestTimeoutMs, 120000);
assert.equal(preference.aiLocalUsageDefaultRangeDays, 90);
assert.equal(preference.aiLocalCodexNoHistory, true);

const staleBridgeCatalog: LocalCodexModelCatalog = {
  bridgeSchemaVersion: 1,
  refreshedAt: "2026-06-11T14:32:00.000+09:00",
  source: "local-codex-bridge",
  codexCliVersion: "26.6.11",
  models: [{ value: "codex-default", label: "codex-default", source: "codex-default", available: true }],
  warnings: [],
};
const normalizedStaleBridgeCatalog = normalizeModelCatalog(staleBridgeCatalog, "gpt-5-codex");
assert.equal(normalizedStaleBridgeCatalog.source, "local-codex-bridge");
assert.equal(normalizedStaleBridgeCatalog.codexCliVersion, "26.6.11");
assert.equal(normalizedStaleBridgeCatalog.models.filter((model) => model.value === "gpt-5.5").length, 1);
assert.deepEqual(
  normalizedStaleBridgeCatalog.models.map((model) => ({ value: model.value, label: model.label })),
  [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { value: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
  ],
);

const serviceSummary = buildMyAssistantUsageSummary({
  from: "2026-06-01T00:00:00.000Z",
  to: "2026-06-06T00:00:00.000Z",
  granularity: "day",
  events: [
    {
      id: "service-1",
      projectId: "project",
      taskId: "task",
      profileId: "profile-a",
      assistantRecordId: "record",
      executionMode: "saas-api",
      runtimeMode: "saas-daily-task-panel",
      provider: "openai",
      model: "gpt-5-codex",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostCents: 0,
      status: "success",
      policyDecision: "allowed",
      requestHash: null,
      errorCode: null,
      metadata: { workflow: "daily-task-panel" },
      createdAt: "2026-06-02T12:00:00.000Z",
    },
    {
      id: "local-1",
      projectId: "project",
      taskId: "task",
      profileId: "profile-a",
      assistantRecordId: "record-local",
      executionMode: "local-chatgpt-codex",
      runtimeMode: "extension-native-bridge-in-page",
      provider: "local-codex",
      model: "gpt-5.5",
      inputTokens: 12,
      outputTokens: 8,
      estimatedCostCents: 0,
      status: "success",
      policyDecision: "allowed",
      requestHash: "local-codex:record-local",
      errorCode: null,
      metadata: { workflow: "daily-task-panel", usageAvailable: true },
      createdAt: "2026-06-02T12:05:00.000Z",
    },
  ],
});
assert.equal(serviceSummary.totals.serviceTotalTokens, 150);
assert.equal(serviceSummary.totals.localCodexTotalTokens, 20);
assert.equal(serviceSummary.buckets[0].serviceRunCount, 1);
assert.equal(serviceSummary.buckets[0].localCodexRunCount, 1);
const combined = buildCombinedUsageMetrics(serviceSummary, {
  schemaVersion: 2,
  scannedAt: "2026-06-05T00:00:00.000Z",
  rangeDays: 30,
  status: "available",
  direct: { inputTokens: 70, outputTokens: 50, totalTokens: 120, entryCount: 1 },
  uncertain: { inputTokens: 40, outputTokens: 40, totalTokens: 80, entryCount: 1 },
  buckets: [
    {
      bucket: "2026-06-02",
      directInputTokens: 70,
      directOutputTokens: 50,
      directTotalTokens: 120,
      directEntryCount: 1,
      uncertainInputTokens: 40,
      uncertainOutputTokens: 40,
      uncertainTotalTokens: 80,
      uncertainEntryCount: 1,
    },
  ],
});
assert.equal(combined.serviceTotalTokens, 150);
assert.equal(combined.serverLocalTotalTokens, 20);
assert.equal(combined.localDirectTotalTokens, 140);
assert.equal(combined.localUncertainTotalTokens, 80);
assert.equal(combined.combinedCertainTotalTokens, 290);

const localCacheSummary = {
  schemaVersion: 2,
  scannedAt: "2026-06-05T00:00:00.000Z",
  rangeDays: 30,
  status: "available",
  direct: { inputTokens: 12, outputTokens: 8, totalTokens: 20, entryCount: 1 },
  uncertain: { inputTokens: 0, outputTokens: 0, totalTokens: 0, entryCount: 0 },
  buckets: [],
} satisfies LocalCodexUsageSummary;
const cacheNowMs = Date.parse("2026-06-05T12:00:00.000Z");
const cacheKey = createLocalUsageCacheKey(30);

const freshStorage = createMemoryStorage();
assert.equal(writeLocalUsageCache(freshStorage, 30, localCacheSummary, new Date(cacheNowMs)), true);
assert.match(freshStorage.getItem(cacheKey) ?? "", /"cachedAt"/);
assert.equal(readLocalUsageCache(freshStorage, 30, cacheNowMs + 1000)?.direct.totalTokens, 20);

const expiredStorage = createMemoryStorage({
  [cacheKey]: JSON.stringify({
    cachedAt: new Date(cacheNowMs - localUsageCacheTtlMs - 1).toISOString(),
    summary: localCacheSummary,
  }),
});
assert.equal(readLocalUsageCache(expiredStorage, 30, cacheNowMs), null);
assert.equal(expiredStorage.getItem(cacheKey), null);

const legacyStorage = createMemoryStorage({ [cacheKey]: JSON.stringify(localCacheSummary) });
assert.equal(readLocalUsageCache(legacyStorage, 30, cacheNowMs), null);
assert.equal(legacyStorage.getItem(cacheKey), null);

const malformedStorage = createMemoryStorage({ [cacheKey]: "{" });
assert.equal(readLocalUsageCache(malformedStorage, 30, cacheNowMs), null);
assert.equal(malformedStorage.getItem(cacheKey), null);

const aiSettingsPage = readSource("src/app/ai-settings/page.tsx");
assert.match(aiSettingsPage, /requirePageUser\("\/ai-settings"\)/);
assert.match(aiSettingsPage, /pending-access/);
assert.match(aiSettingsPage, /no-access/);
assert.doesNotMatch(aiSettingsPage, /role !== "admin"/);

const preferenceRoute = readSource("src/app/api/preferences/ai-settings/route.ts");
assert.match(preferenceRoute, /requireActiveUser/);
assert.match(preferenceRoute, /getAiSettingsPreference\(user\.id\)/);
assert.match(preferenceRoute, /updateAiSettingsPreference\(user\.id/);

const usageRoute = readSource("src/app/api/assistant/usage/me/route.ts");
assert.match(usageRoute, /requireActiveUser/);
assert.match(usageRoute, /getMyAssistantUsageSummary/);
assert.match(usageRoute, /requestHash/);
assert.doesNotMatch(usageRoute, /admin/);

const clientSource = readSource("src/components/ai-settings/ai-settings-client.tsx");
assert.match(clientSource, /sessionStorage/);
assert.match(clientSource, /usage-summary/);
assert.match(clientSource, /model-catalog/);
assert.match(clientSource, /aiLocalCodexNoHistory/);
assert.match(clientSource, /요청 제한 시간/);
assert.match(clientSource, /Local Codex\/브리지 응답을 기다리는 최대 시간/);
assert.match(clientSource, /aiServiceTier: "auto"/);
assert.doesNotMatch(clientSource, /Service tier/);
assert.doesNotMatch(clientSource, /<option value="priority">/);
assert.match(clientSource, /normalizeModelCatalog/);
assert.match(clientSource, /LocalCodexModelCatalog/);
assert.match(clientSource, /aria-live/);
assert.match(clientSource, /readLocalUsageCache\(window\.sessionStorage/);
assert.match(clientSource, /writeLocalUsageCache\(window\.sessionStorage/);
assert.doesNotMatch(clientSource, /fetch\([^)]*usage-summary/);
assert.doesNotMatch(clientSource, /\/api\/assistant\/policy/);
assert.doesNotMatch(clientSource, /sendBeacon|telemetry|audit|error log/i);

const modelCatalogSource = readSource("src/components/ai-settings/model-catalog-normalization.ts");
assert.match(modelCatalogSource, /WINDOWS_CODEX_MODEL_OPTIONS/);
assert.match(modelCatalogSource, /resolveModelCatalogLabel/);
assert.match(modelCatalogSource, /sanitizeModelCatalogLabel/);
assert.match(modelCatalogSource, /normalized === "codex-default" \|\| normalized === "gpt-5-codex" \? CODEX_DEFAULT_MODEL/);
assert.match(modelCatalogSource, /isLegacyDefaultAlias = rawValue === "codex-default" \|\| rawValue === "gpt-5-codex"/);
assert.match(modelCatalogSource, /catalog\?\.models\.forEach\(addModel\);\s*buildKnownWindowsCodexModelOptions\(\)\.forEach\(addModel\);/);
assert.doesNotMatch(modelCatalogSource, /catalog\?\.models\.length \? catalog\.models : buildKnownWindowsCodexModelOptions\(\)/);

const taskPanelSource = readSource("src/components/tasks/task-assistant-panel.tsx");
assert.match(taskPanelSource, /codexOptions/);
assert.match(taskPanelSource, /noHistory: preference\.aiLocalCodexNoHistory/);
assert.match(taskPanelSource, /usageAvailable/);
assert.match(taskPanelSource, /architect:page-local-runtime-ready/);
assert.match(taskPanelSource, /assertLocalCodexReadyBeforeRetrieval/);
assert.match(taskPanelSource, /requestHash: `local-codex:\$\{input\.savedRecord\.id\}`/);
assert.match(taskPanelSource, /\.\.\.\(options\?\.codexOptions \? \{ codexOptions: options\.codexOptions \} : \{\}\)/);
assert.doesNotMatch(taskPanelSource, /configPath/);

const usageService = readSource("src/use-cases/assistant-usage-service.ts");
assert.doesNotMatch(usageService, /\b(prompt|transcript|raw log|session text|configPath|OPENAI_API_KEY)\b/i);
assert.match(usageService, /ASSISTANT_USAGE_RECORD_FORBIDDEN/);
assert.match(usageService, /MAX_LOCAL_CODEX_USAGE_TOKENS/);
assert.match(usageService, /localCodexTotalTokens/);
assert.match(usageService, /normalizeRequestHash/);

const aiSettingsCss = readSource("src/components/ai-settings/ai-settings.module.css");
assert.doesNotMatch(aiSettingsCss, /--theme-text-strong/);

const prismaSchema = readSource("prisma/schema.prisma");
assert.match(prismaSchema, /aiLocalCodexNoHistory\s+Boolean/);
assert.match(prismaSchema, /@map\("ai_local_codex_no_history"\)/);
assert.match(prismaSchema, /@default\("gpt-5\.5"\)/);
assert.match(prismaSchema, /requestHash\s+String\?\s+@map\("request_hash"\)/);

const preferenceTypesSource = readSource("src/domains/preferences/types.ts");
assert.match(preferenceTypesSource, /WINDOWS_CODEX_MODEL_OPTIONS/);
assert.match(preferenceTypesSource, /GPT-5\.5/);
assert.match(preferenceTypesSource, /gpt-5-codex/);

const migration = readSource("prisma/migrations/202606110001_add_ai_settings_local_codex_controls/migration.sql");
assert.match(migration, /ai_local_codex_no_history/);

const modelCatalogMigration = readSource("prisma/migrations/202606110002_use_windows_codex_model_catalog_defaults/migration.sql");
assert.match(modelCatalogMigration, /alter column "ai_default_model" set default 'gpt-5\.5'/);
assert.match(modelCatalogMigration, /'gpt-5-codex', 'codex-default'/);

const usageHashMigration = readSource("prisma/migrations/202606220001_add_assistant_usage_request_hash_unique/migration.sql");
assert.match(usageHashMigration, /assistant_usage_events_request_hash_key/);
assert.match(usageHashMigration, /request_hash/);
assert.match(usageHashMigration, /execution_mode"\s+=\s+'local-chatgpt-codex'/);

console.log("AI settings contract validation passed.");

function readSource(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function createMemoryStorage(initial: Record<string, string> = {}): LocalUsageCacheStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
