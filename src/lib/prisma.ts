import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { serviceUnavailable } from "@/lib/api/errors";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw serviceUnavailable("DATABASE_URL이 설정되지 않았습니다.", "DATABASE_URL_MISSING");
  }

  const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX);
  const poolMax = Number.isSafeInteger(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : process.env.NODE_ENV === "production"
      ? 1
      : 4;
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
