import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { serviceUnavailable } from "@/lib/api/errors";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const DEFAULT_DATABASE_POOL_MAX = process.env.VERCEL ? 1 : 3;
const DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS = process.env.VERCEL ? 2_000 : 10_000;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRuntimeDatabaseUrl(databaseUrl: string) {
  const explicitRuntimeUrl = process.env.DATABASE_RUNTIME_URL?.trim();
  if (explicitRuntimeUrl) {
    return explicitRuntimeUrl;
  }

  if (!process.env.VERCEL || process.env.DATABASE_USE_TRANSACTION_POOLER === "false") {
    return databaseUrl;
  }

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.hostname.endsWith(".pooler.supabase.com") && parsed.port === "5432") {
      parsed.port = "6543";
      parsed.searchParams.set("pgbouncer", "true");
      return parsed.toString();
    }
  } catch {
    return databaseUrl;
  }

  return databaseUrl;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw serviceUnavailable("DATABASE_URL is not configured.", "DATABASE_URL_MISSING");
  }

  const poolMax = parsePositiveInteger(process.env.DATABASE_POOL_MAX, DEFAULT_DATABASE_POOL_MAX);
  const idleTimeoutMillis = parsePositiveInteger(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS);
  const adapter = new PrismaPg({
    connectionString: buildRuntimeDatabaseUrl(databaseUrl),
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrismaClient() as object, property, receiver);
  },
});
