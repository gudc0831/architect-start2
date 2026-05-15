import { loadEnvConfig } from "@next/env";
import { getFileAnalysisChunkDebugReport } from "@/use-cases/admin/file-analysis-chunk-debug-service";

loadEnvConfig(process.cwd());

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await getFileAnalysisChunkDebugReport(args);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`[file-analysis-chunks-debug] generatedAt=${report.generatedAt}`);
  console.log(
    `[file-analysis-chunks-debug] database=${report.database.available ? "available" : "unavailable"} total=${report.database.totalChunks} embedded=${report.database.embeddedChunks} missing=${report.database.missingEmbeddings} projects=${report.database.projectCount} files=${report.database.fileCount}`,
  );
  for (const blocker of report.blockers) {
    console.warn(`[file-analysis-chunks-debug] blocker ${blocker}`);
  }
  for (const group of report.coverage) {
    console.log(
      `[file-analysis-chunks-debug] group sourceType=${group.sourceType} verificationState=${group.verificationState} total=${group.totalChunks} embedded=${group.embeddedChunks} missing=${group.missingEmbeddings}`,
    );
  }
  for (const hit of report.retrieval) {
    console.log(
      `[file-analysis-chunks-debug] hit file=${hit.fileName} chunk=${hit.id} fts=${hit.ftsRank.toFixed(4)} vectorReady=${hit.vectorReady} preview=${hit.preview}`,
    );
  }
  for (const sample of report.missingSamples) {
    console.log(
      `[file-analysis-chunks-debug] missing chunk=${sample.id} file=${sample.fileId} analysis=${sample.analysisId} hash=${sample.tokenHash} preview=${sample.preview}`,
    );
  }
}

function parseArgs(values: string[]) {
  return {
    json: values.includes("--json"),
    query: readTextArg(values, "--query"),
    sourceType: readTextArg(values, "--source-type"),
    verificationState: readTextArg(values, "--verification-state"),
    sampleLimit: readNumberArg(values, "--sample-limit", 10),
  };
}

function readTextArg(values: string[], name: string) {
  const index = values.indexOf(name);
  const raw = index >= 0 ? values[index + 1] : "";
  return raw?.trim() || null;
}

function readNumberArg(values: string[], name: string, fallback: number) {
  const index = values.indexOf(name);
  const parsed = Number.parseInt(index >= 0 ? values[index + 1] ?? "" : "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
