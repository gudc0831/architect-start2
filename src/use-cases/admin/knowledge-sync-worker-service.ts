import {
  listKnowledgeExportSyncAudits,
  listKnowledgeProviderExecutions,
  listKnowledgeProviderPreviews,
  listKnowledgeSyncTargetConfigs,
  type KnowledgeExportSyncAudit,
  type KnowledgeExportSyncTarget,
} from "@/use-cases/admin/knowledge-service";

export type KnowledgeExternalSyncWorkerReport = {
  generatedAt: string;
  dryRun: true;
  queue: {
    pendingProviderReadyAudits: number;
    pendingPreviewCount: number;
    executionCount: number;
    targetCounts: Record<KnowledgeExportSyncTarget, number>;
  };
  targets: Array<{
    target: KnowledgeExportSyncTarget;
    enabled: boolean;
    dryRunOnly: boolean;
    credentialStatus: string;
    remoteWriteReady: boolean;
    remoteWriteBlockers: string[];
    liveWriteFeatureFlag: string | null;
    liveWriteFeatureFlagEnabled: boolean;
  }>;
  nextActions: Array<{
    auditId: string;
    target: KnowledgeExportSyncTarget;
    packageName: string;
    status: KnowledgeExportSyncAudit["status"];
    action: "blocked" | "preflight_only" | "ready_for_guarded_execution";
    blockers: string[];
  }>;
  blockers: string[];
  warnings: string[];
};

export async function getKnowledgeExternalSyncWorkerReport(): Promise<KnowledgeExternalSyncWorkerReport> {
  const [audits, previews, executions, configs] = await Promise.all([
    listKnowledgeExportSyncAudits(),
    listKnowledgeProviderPreviews(),
    listKnowledgeProviderExecutions(),
    listKnowledgeSyncTargetConfigs(),
  ]);
  const executedAuditIds = new Set(executions.map((execution) => execution.auditId));
  const pendingAudits = audits.filter((audit) => audit.status === "provider_ready" && !executedAuditIds.has(audit.id));
  const targetCounts = buildTargetCounts(pendingAudits);
  const configsByTarget = new Map(configs.map((config) => [config.target, config]));
  const nextActions = pendingAudits.map((audit) => {
    const config = configsByTarget.get(audit.target);
    const blockers = [
      ...(!config?.enabled ? ["sync target is disabled"] : []),
      ...(config?.credentialStatus === "missing" ? ["provider credential is missing"] : []),
      ...(config?.dryRunOnly ? ["target is marked dry-run-only"] : []),
      ...(config && audit.target !== "portable_archive" && !config.remoteWriteReady ? config.remoteWriteBlockers : []),
      ...(audit.target !== "portable_archive" && audit.target !== "obsidian" ? ["live adapter is not enabled for this target"] : []),
    ];
    return {
      auditId: audit.id,
      target: audit.target,
      packageName: audit.packageName,
      status: audit.status,
      action: blockers.length ? "blocked" as const : audit.target === "obsidian" ? "preflight_only" as const : "ready_for_guarded_execution" as const,
      blockers,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    queue: {
      pendingProviderReadyAudits: pendingAudits.length,
      pendingPreviewCount: previews.length,
      executionCount: executions.length,
      targetCounts,
    },
    targets: configs.map((config) => ({
      target: config.target,
      enabled: config.enabled,
      dryRunOnly: config.dryRunOnly,
      credentialStatus: config.credentialStatus,
      remoteWriteReady: config.remoteWriteReady,
      remoteWriteBlockers: config.remoteWriteBlockers,
      liveWriteFeatureFlag: config.liveWriteFeatureFlag,
      liveWriteFeatureFlagEnabled: config.liveWriteFeatureFlagEnabled,
    })),
    nextActions,
    blockers: nextActions.flatMap((item) => item.blockers.map((blocker) => `${item.target}/${item.auditId}: ${blocker}`)),
    warnings: [
      "This worker report does not write to Obsidian, Notion, retrieval storage, or archive delivery.",
      "Server-side audit/preflight records remain separate from future external provider mutations.",
      ...(pendingAudits.length === 0 ? ["No provider-ready export audits are waiting for guarded execution."] : []),
    ],
  };
}

function buildTargetCounts(audits: KnowledgeExportSyncAudit[]) {
  const counts: Record<KnowledgeExportSyncTarget, number> = {
    portable_archive: 0,
    obsidian: 0,
    notion: 0,
    assistant_retrieval: 0,
  };
  for (const audit of audits) {
    counts[audit.target] += 1;
  }
  return counts;
}
