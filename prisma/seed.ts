import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { prisma } from "@/lib/prisma";

async function main() {
  const name = process.env.DEFAULT_PROJECT_NAME?.trim() || "Architect Start";
  const existing = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!existing) {
    await prisma.project.create({
      data: { name },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });