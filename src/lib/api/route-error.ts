import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/api/errors";

const databaseConnectivityErrorCodes = new Set([
  "EACCES",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EMAXCONNSESSION",
  "P1001",
  "P1002",
  "P1017",
  "P2024",
  "08000",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
  "55P03",
  "57014",
]);

function getErrorLogContext(error: unknown, correlationId: string) {
  const meta = error && typeof error === "object" && "meta" in error ? (error as { meta?: unknown }).meta : null;
  const metaCode =
    meta && typeof meta === "object" && "code" in meta
      ? normalizeDiagnosticCode((meta as { code?: unknown }).code)
      : undefined;

  return {
    correlationId,
    name: error instanceof Error ? normalizeDiagnosticCode(error.name) ?? "Error" : "UnknownError",
    code:
      error && typeof error === "object" && "code" in error
        ? normalizeDiagnosticCode((error as { code?: unknown }).code)
        : undefined,
    metaCode,
  };
}

function normalizeDiagnosticCode(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(normalized) ? normalized : undefined;
}

export function isDatabaseConnectivityError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (databaseConnectivityErrorCodes.has(code)) {
    return true;
  }

  const meta = "meta" in error ? (error as { meta?: unknown }).meta : null;
  const metaCode =
    meta && typeof meta === "object" && "code" in meta ? String((meta as { code?: unknown }).code ?? "") : "";
  if (databaseConnectivityErrorCodes.has(metaCode)) {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return (
    /Can't reach database server/i.test(message) ||
    /Timed out fetching a new connection/i.test(message) ||
    /max clients reached/i.test(message) ||
    /max client connections reached/i.test(message) ||
    /Connection terminated/i.test(message) ||
    /connection timeout/i.test(message) ||
    /canceling statement due to (statement|lock) timeout/i.test(message) ||
    /\b(EACCES|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/i.test(message)
  );
}

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  const correlationId = randomUUID();
  const logContext = getErrorLogContext(error, correlationId);

  if (isDatabaseConnectivityError(error)) {
    console.warn("[route-error] database connectivity error", logContext);
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database connection is temporarily unavailable",
          correlationId,
        },
      },
      { status: 503 },
    );
  }

  console.error("[route-error] unexpected error", logContext);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
        correlationId,
      },
    },
    { status: 500 },
  );
}
