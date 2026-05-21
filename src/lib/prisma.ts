import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { serviceUnavailable } from "@/lib/api/errors";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const DEFAULT_DATABASE_POOL_MAX = 3;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw serviceUnavailable("DATABASE_URL is not configured.", "DATABASE_URL_MISSING");
  }

  const poolMax = parsePositiveInteger(process.env.DATABASE_POOL_MAX, DEFAULT_DATABASE_POOL_MAX);
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: poolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
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
