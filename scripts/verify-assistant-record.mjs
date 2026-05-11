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
  const records = await readRecords(env);
  const matches = filterRecords(records);
  const report = {
    ok: matches.length > 0,
    backendMode: env.APP_BACKEND_MODE || "local",
    criteria: {
      executionMode: options.executionMode,
      runtimeMode: options.runtimeMode,
      taskId: options.taskId,
      questionContains: options.questionContains,
      sinceMinutes: options.sinceMinutes,
    },
    matchCount: matches.length,
    latest: matches[0] ? sanitizeRecord(matches[0]) : null,
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
    console.error(`FAIL assistant record verifier: ${message}`);
  }
  process.exitCode = 1;
}

function formatError(error) {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => (item instanceof Error ? item.message : String(item))).filter(Boolean);
    return nested.join("; ") || error.message || "Assistant record verification failed.";
  }

  if (error instanceof Error) {
    return error.message || error.code || "Assistant record verification failed.";
  }

  return String(error || "Assistant record verification failed.");
}

async function readEnv(envFile) {
  const envPath = path.resolve(envFile);
  const env = { ...process.env };
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
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!env[key]) {
      env[key] = value;
    }
  }

  return env;
}

async function readRecords(env) {
  if ((env.APP_BACKEND_MODE || "local") === "cloud") {
    return readPostgresRecords(env);
  }

  const localDataRoot = env.LOCAL_DATA_ROOT || (process.platform === "win32" ? "D:/architect-start-data" : path.join(process.cwd(), ".data"));
  const storePath = path.join(localDataRoot, "data", "assistant-records.json");
  const parsed = JSON.parse(await readFile(storePath, "utf8"));
  return Array.isArray(parsed.records) ? parsed.records : [];
}

async function readPostgresRecords(env) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when APP_BACKEND_MODE=cloud.");
  }

  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      [
        "select id, project_id, task_id, profile_id, question, execution_mode, runtime_mode, confidence_score, created_at",
        "from public.assistant_task_records",
        "where execution_mode = $1",
        "order by created_at desc",
        "limit 50",
      ].join(" "),
      [options.executionMode],
    );
    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      profileId: row.profile_id,
      question: row.question,
      executionMode: row.execution_mode,
      runtimeMode: row.runtime_mode,
      confidenceScore: row.confidence_score,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  } finally {
    await client.end();
  }
}

function filterRecords(records) {
  const cutoff = options.sinceMinutes > 0 ? Date.now() - options.sinceMinutes * 60_000 : null;
  return records
    .filter((record) => record.executionMode === options.executionMode)
    .filter((record) => !options.runtimeMode || record.runtimeMode === options.runtimeMode)
    .filter((record) => !options.taskId || record.taskId === options.taskId)
    .filter((record) => !options.questionContains || String(record.question ?? "").includes(options.questionContains))
    .filter((record) => {
      if (!cutoff) {
        return true;
      }

      const createdAt = Date.parse(record.createdAt ?? "");
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
}

function sanitizeRecord(record) {
  return {
    id: record.id,
    projectId: record.projectId,
    taskId: record.taskId,
    executionMode: record.executionMode,
    runtimeMode: record.runtimeMode,
    confidenceScore: record.confidenceScore,
    createdAt: record.createdAt,
    question: truncate(record.question, 160),
  };
}

function printReport(report) {
  console.log("Assistant record verification");
  console.log(`Backend mode: ${report.backendMode}`);
  console.log(`Criteria: ${JSON.stringify(report.criteria)}`);
  console.log(`Matches: ${report.matchCount}`);
  if (report.latest) {
    console.log(`Latest: ${JSON.stringify(report.latest)}`);
  }
}

function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseArgs(args) {
  const parsed = {
    envFile: ".env.local",
    backendMode: "",
    executionMode: "local-chatgpt-codex",
    json: false,
    questionContains: "",
    runtimeMode: "extension-native-bridge-in-page",
    sinceMinutes: 60,
    strict: false,
    taskId: "",
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
    if (arg === "--question-contains") {
      parsed.questionContains = args[index + 1] ?? "";
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
  }

  if (!Number.isFinite(parsed.sinceMinutes) || parsed.sinceMinutes < 0) {
    throw new Error("--since-minutes must be a non-negative number.");
  }

  return parsed;
}
