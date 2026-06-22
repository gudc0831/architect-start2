#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const options = parseArgs(process.argv.slice(2));

try {
  const env = await readEnv(options.envFile);
  if (options.backendMode) {
    env.APP_BACKEND_MODE = options.backendMode;
  }
  const backendMode = normalizeBackendMode(env.APP_BACKEND_MODE);
  const events = await readUsageEvents(env, backendMode);
  const matches = filterUsageEvents(events);
  const report = {
    ok: matches.length > 0,
    backendMode,
    criteria: {
      executionMode: options.executionMode,
      runtimeMode: options.runtimeMode,
      taskId: options.taskId,
      assistantRecordId: options.assistantRecordId,
      requestHash: options.requestHash,
      status: options.status,
      sinceMinutes: options.sinceMinutes,
      allowSelfSignedDbCert: options.allowSelfSignedDbCert,
    },
    matchCount: matches.length,
    latest: matches[0] ? sanitizeUsageEvent(matches[0]) : null,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  process.exitCode = options.strict && !report.ok ? 1 : 0;
} catch (error) {
  const message = formatError(error);
  if (options.json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`FAIL assistant usage verifier: ${message}`);
  }
  process.exitCode = 1;
}

function formatError(error) {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => (item instanceof Error ? item.message : String(item))).filter(Boolean);
    return nested.join("; ") || error.message || "Assistant usage verification failed.";
  }

  if (error instanceof Error) {
    return error.message || error.code || "Assistant usage verification failed.";
  }

  return String(error || "Assistant usage verification failed.");
}

async function readEnv(envFile) {
  const envPath = path.resolve(envFile);
  const env = {
    APP_BACKEND_MODE: process.env.APP_BACKEND_MODE || "",
    DATABASE_URL: process.env.DATABASE_URL || "",
    LOCAL_DATA_ROOT: process.env.LOCAL_DATA_ROOT || "",
  };
  if (!existsSync(envPath)) {
    return env;
  }

  const lines = (await readFile(envPath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!["APP_BACKEND_MODE", "DATABASE_URL", "LOCAL_DATA_ROOT"].includes(key)) {
      continue;
    }
    const value = normalizeEnvValue(trimmed.slice(separatorIndex + 1));
    if (!env[key]) {
      env[key] = value;
    }
  }

  return env;
}

function normalizeEnvValue(rawValue) {
  return rawValue
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/(?:\\r|\\n)+$/g, "");
}

function normalizeBackendMode(value) {
  return String(value || "").trim() === "cloud" ? "cloud" : "local";
}

async function readUsageEvents(env, backendMode) {
  if (backendMode === "cloud") {
    return readPostgresUsageEvents(env);
  }

  const localDataRoot = env.LOCAL_DATA_ROOT || (process.platform === "win32" ? "D:/architect-start-data" : path.join(process.cwd(), ".data"));
  const storePath = path.join(localDataRoot, "data", "assistant-records.json");
  const parsed = JSON.parse(await readFile(storePath, "utf8"));
  return Array.isArray(parsed.usageEvents) ? parsed.usageEvents : [];
}

async function readPostgresUsageEvents(env) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when APP_BACKEND_MODE=cloud.");
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: !options.allowSelfSignedDbCert },
  });
  await client.connect();
  try {
    const result = await client.query(
      [
        "select id, project_id, task_id, profile_id, assistant_record_id, execution_mode, runtime_mode, provider, model,",
        "input_tokens, output_tokens, estimated_cost_cents, status, policy_decision, request_hash, error_code, metadata, created_at",
        "from public.assistant_usage_events",
        "where execution_mode = $1",
        "order by created_at desc",
        "limit 100",
      ].join(" "),
      [options.executionMode],
    );
    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      profileId: row.profile_id,
      assistantRecordId: row.assistant_record_id,
      executionMode: row.execution_mode,
      runtimeMode: row.runtime_mode,
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      estimatedCostCents: row.estimated_cost_cents,
      status: row.status,
      policyDecision: row.policy_decision,
      requestHash: row.request_hash,
      errorCode: row.error_code,
      metadata: row.metadata,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  } finally {
    await client.end();
  }
}

function filterUsageEvents(events) {
  const cutoff = options.sinceMinutes > 0 ? Date.now() - options.sinceMinutes * 60_000 : null;
  return events
    .filter((event) => event.executionMode === options.executionMode)
    .filter((event) => !options.runtimeMode || event.runtimeMode === options.runtimeMode)
    .filter((event) => !options.taskId || event.taskId === options.taskId)
    .filter((event) => !options.assistantRecordId || event.assistantRecordId === options.assistantRecordId)
    .filter((event) => !options.requestHash || event.requestHash === options.requestHash)
    .filter((event) => !options.status || event.status === options.status)
    .filter((event) => {
      if (!cutoff) {
        return true;
      }

      const createdAt = Date.parse(event.createdAt ?? "");
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
}

function sanitizeUsageEvent(event) {
  return {
    id: event.id,
    projectId: event.projectId,
    taskId: event.taskId,
    assistantRecordId: event.assistantRecordId,
    executionMode: event.executionMode,
    runtimeMode: event.runtimeMode,
    provider: event.provider,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    totalTokens: Number(event.inputTokens ?? 0) + Number(event.outputTokens ?? 0),
    status: event.status,
    requestHash: event.requestHash,
    createdAt: event.createdAt,
    metadata: sanitizeMetadata(event.metadata),
  };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return {
    workflow: typeof metadata.workflow === "string" ? metadata.workflow : undefined,
    usageAvailable: typeof metadata.usageAvailable === "boolean" ? metadata.usageAvailable : undefined,
    bridgeSchemaVersion: typeof metadata.bridgeSchemaVersion === "number" ? metadata.bridgeSchemaVersion : undefined,
  };
}

function printReport(report) {
  console.log("Assistant usage verification");
  console.log(`Backend mode: ${report.backendMode}`);
  console.log(`Criteria: ${JSON.stringify(report.criteria)}`);
  console.log(`Matches: ${report.matchCount}`);
  if (report.latest) {
    console.log(`Latest: ${JSON.stringify(report.latest)}`);
  }
}

function parseArgs(args) {
  const parsed = {
    envFile: ".env.local",
    backendMode: "",
    executionMode: "local-chatgpt-codex",
    runtimeMode: "extension-native-bridge-in-page",
    taskId: "",
    assistantRecordId: "",
    requestHash: "",
    status: "",
    sinceMinutes: 60,
    json: false,
    strict: false,
    allowSelfSignedDbCert: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env-file") {
      parsed.envFile = args[index + 1] ?? parsed.envFile;
      index += 1;
      continue;
    }
    if (arg === "--backend-mode") {
      parsed.backendMode = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--execution-mode") {
      parsed.executionMode = args[index + 1] ?? parsed.executionMode;
      index += 1;
      continue;
    }
    if (arg === "--runtime-mode") {
      parsed.runtimeMode = args[index + 1] ?? parsed.runtimeMode;
      index += 1;
      continue;
    }
    if (arg === "--task-id") {
      parsed.taskId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--assistant-record-id") {
      parsed.assistantRecordId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--request-hash") {
      parsed.requestHash = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--status") {
      parsed.status = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--since-minutes") {
      parsed.sinceMinutes = Number(args[index + 1] ?? parsed.sinceMinutes);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (arg === "--allow-self-signed-db-cert") {
      parsed.allowSelfSignedDbCert = true;
      continue;
    }
  }

  if (!Number.isFinite(parsed.sinceMinutes) || parsed.sinceMinutes < 0) {
    throw new Error("--since-minutes must be a non-negative number.");
  }

  return parsed;
}
