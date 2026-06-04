import { readFile, writeFile } from "node:fs/promises";
import {
  buildAssistantLegalManualSmokeReportFromCaptures,
  validateAssistantLegalManualSmokeReport,
} from "../src/domains/assistant/legal-manual-smoke-report";

async function main() {
  const inputPath = readArgValue("--input");
  const outputPath = readArgValue("--output");
  if (!inputPath) {
    throw new Error(
      "Usage: npm run legal-manual-smoke:capture -- --input <assistant-captures.json> [--output <manual-smoke-report.json>]",
    );
  }

  const captures = JSON.parse(stripJsonBom(await readFile(inputPath, "utf8")));
  const report = buildAssistantLegalManualSmokeReportFromCaptures(captures);
  const validation = validateAssistantLegalManualSmokeReport(report);
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    await writeFile(outputPath, serializedReport);
  } else {
    process.stdout.write(serializedReport);
  }

  process.stderr.write(`${JSON.stringify(validation, null, 2)}\n`);
  if (validation.status !== "passed") {
    process.exitCode = 1;
  }
}

function readArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1]?.trim();
  return value || undefined;
}

function stripJsonBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

main();
