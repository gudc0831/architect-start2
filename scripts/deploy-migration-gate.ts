import { loadEnvConfig } from "@next/env";
import { captureNpmExec, runCheckedNpmExec } from "./lib/run-command";

loadEnvConfig(process.cwd());

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function isCloudTargetConfigured() {
  return process.env.APP_BACKEND_MODE?.trim() === "cloud" && Boolean(process.env.DATABASE_URL?.trim());
}

function statusOutput(stdout: string, stderr: string) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

if (!isCloudTargetConfigured()) {
  console.log("deploy:migration-gate skipped: APP_BACKEND_MODE=cloud and DATABASE_URL are not both configured.");
  process.exit(0);
}

const schemaArgs = ["--schema", "prisma/schema.prisma"];

if (isTruthy(process.env.ARCHITECT_DEPLOY_MIGRATIONS)) {
  console.log("deploy:migration-gate applying pending Prisma migrations because ARCHITECT_DEPLOY_MIGRATIONS is enabled.");
  runCheckedNpmExec(["prisma", "migrate", "deploy", ...schemaArgs]);
  process.exit(0);
}

const result = captureNpmExec(["prisma", "migrate", "status", ...schemaArgs]);
if (result.error) {
  throw result.error;
}

const output = statusOutput(result.stdout, result.stderr);
if ((result.status ?? 1) !== 0) {
  console.error(output);
  throw new Error(
    [
      "Cloud database migrations are not clean for this deployment.",
      "Apply pending migrations with the repo's guarded command against the exact deployment DATABASE_URL before redeploying:",
      "  npm run data:backup",
      "  npm run db:migrate:safe",
      "Set ARCHITECT_DEPLOY_MIGRATIONS=1 only for an approved, isolated deployment environment where build-time migration is intentional.",
    ].join("\n"),
  );
}

console.log(output || "Cloud database migrations are clean.");
