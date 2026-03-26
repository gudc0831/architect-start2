import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { runLocalWorkTypeMigration } from "../src/use-cases/task-work-type-migration";

loadEnvConfig(process.cwd());

async function main() {
  const apply = hasFlag("--apply");
  const reportPath = getArg("--report");
  const updatedBy = getArg("--updated-by");
  const report = await runLocalWorkTypeMigration({
    apply,
    updatedBy: updatedBy || null,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (reportPath) {
    const targetPath = resolve(process.cwd(), reportPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, serialized, "utf8");
  }

  process.stdout.write(serialized);
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getArg(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
