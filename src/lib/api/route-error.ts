import { NextResponse } from "next/server";
import { AppError } from "@/lib/api/errors";

export type ClassifiedRouteDatabaseError = {
  status: number;
  code: string;
  message: string;
};

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

const schemaUnavailableCodes = new Set(["P2021", "P2022", "42P01", "42703"]);
const retryableConflictCodes = new Set(["P2034", "40001", "40P01"]);
const databasePermissionCodes = new Set(["42501"]);
const databaseInvalidInputCodes = new Set(["22P02"]);

const safeMetaKeys = new Set([
  "code",
  "column",
  "constraint",
  "field_name",
  "modelName",
  "table",
  "target",
]);

function redactSensitiveText(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted-postgres-url]")
    .replace(/(DATABASE(?:_RUNTIME)?_URL=)[^\s"'<>]+/gi, "$1[redacted]")
    .replace(/(password|passwd|pwd|token|secret|key)=([^&\s"'<>]+)/gi, "$1=[redacted]");
}

function sanitizeRouteErrorMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!safeMetaKeys.has(key)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value;
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeRouteErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const meta = "meta" in error ? sanitizeRouteErrorMeta((error as { meta?: unknown }).meta) : undefined;
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
      code: "code" in error ? (error as { code?: unknown }).code : undefined,
      clientVersion: "clientVersion" in error ? (error as { clientVersion?: unknown }).clientVersion : undefined,
      meta,
    };
  }

  if (error && typeof error === "object") {
    return {
      code: "code" in error ? (error as { code?: unknown }).code : undefined,
      meta: "meta" in error ? sanitizeRouteErrorMeta((error as { meta?: unknown }).meta) : undefined,
    };
  }

  return { valueType: typeof error };
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  return "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
}

function getErrorMetaCode(error: unknown) {
  if (!error || typeof error !== "object" || !("meta" in error)) {
    return "";
  }

  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || !("code" in meta)) {
    return "";
  }

  return String((meta as { code?: unknown }).code ?? "");
}

export function classifyRouteDatabaseError(error: unknown): ClassifiedRouteDatabaseError | null {
  const code = getErrorCode(error);
  const metaCode = getErrorMetaCode(error);
  const effectiveCode = metaCode || code;

  if (schemaUnavailableCodes.has(code) || schemaUnavailableCodes.has(metaCode)) {
    return {
      status: 503,
      code: "DATABASE_SCHEMA_UNAVAILABLE",
      message: "Database schema is temporarily unavailable",
    };
  }

  if (code === "P2028") {
    return {
      status: 503,
      code: "DATABASE_TRANSACTION_UNAVAILABLE",
      message: "Database transaction is temporarily unavailable",
    };
  }

  if (code === "P2003") {
    return {
      status: 409,
      code: "DATABASE_CONSTRAINT_VIOLATION",
      message: "Database constraint prevented the change",
    };
  }

  if (code === "P2025") {
    return {
      status: 409,
      code: "DATABASE_RECORD_CONFLICT",
      message: "Database record changed before the request completed",
    };
  }

  if (retryableConflictCodes.has(effectiveCode)) {
    return {
      status: 409,
      code: "DATABASE_RETRYABLE_CONFLICT",
      message: "Database transaction conflict. Please retry.",
    };
  }

  if (databasePermissionCodes.has(effectiveCode)) {
    return {
      status: 503,
      code: "DATABASE_PERMISSION_DENIED",
      message: "Database permission is not available for this operation",
    };
  }

  if (databaseInvalidInputCodes.has(effectiveCode)) {
    return {
      status: 400,
      code: "DATABASE_INVALID_INPUT",
      message: "Request contains invalid database input",
    };
  }

  return null;
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

function shouldExposePreviewErrorDetails() {
  return process.env.VERCEL_ENV === "preview";
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

  const details = sanitizeRouteErrorDetails(error);

  if (isDatabaseConnectivityError(error)) {
    console.warn("[route-error] database connectivity error", details);
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database connection is temporarily unavailable",
        },
        ...(shouldExposePreviewErrorDetails() ? { debug: details } : {}),
      },
      { status: 503 },
    );
  }

  const databaseError = classifyRouteDatabaseError(error);
  if (databaseError) {
    console.warn("[route-error] classified database error", details);
    return NextResponse.json(
      {
        error: {
          code: databaseError.code,
          message: databaseError.message,
        },
        ...(shouldExposePreviewErrorDetails() ? { debug: details } : {}),
      },
      { status: databaseError.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      },
      ...(shouldExposePreviewErrorDetails() ? { debug: details } : {}),
    },
    { status: 500 },
  );
}
