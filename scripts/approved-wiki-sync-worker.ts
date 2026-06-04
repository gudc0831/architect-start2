import { loadEnvConfig } from "@next/env";
import { getKnowledgeExternalSyncWorkerReport } from "@/use-cases/admin/knowledge-sync-worker-service";

loadEnvConfig(process.cwd());

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await getKnowledgeExternalSyncWorkerReport();
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`[approved-wiki-sync-worker] generatedAt=${report.generatedAt} dryRun=${report.dryRun}`);
  console.log(
    `[approved-wiki-sync-worker] pending=${report.queue.pendingProviderReadyAudits} previews=${report.queue.pendingPreviewCount} executions=${report.queue.executionCount}`,
  );
  for (const target of report.targets) {
    console.log(
      `[approved-wiki-sync-worker] target=${target.target} enabled=${target.enabled} dryRunOnly=${target.dryRunOnly} credential=${target.credentialStatus} remoteWriteReady=${target.remoteWriteReady}`,
    );
  }
  for (const action of report.nextActions) {
    console.log(`[approved-wiki-sync-worker] action=${action.action} target=${action.target} audit=${action.auditId} package=${action.packageName}`);
    for (const blocker of action.blockers) {
      console.warn(`[approved-wiki-sync-worker] blocker ${blocker}`);
    }
  }
  for (const warning of report.warnings) {
    console.warn(`[approved-wiki-sync-worker] warning ${warning}`);
  }
}

function parseArgs(values: string[]) {
  return {
    json: values.includes("--json"),
  };
}
