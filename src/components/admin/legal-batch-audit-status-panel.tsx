"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

type LegalBatchAuditCounts = {
  seedCount: number;
  supportedSeedCount: number;
  requestedLimit: number;
  attemptedCount: number;
  syncedCount: number;
  failedCount: number;
  skippedSupportedCount: number;
  unsupportedCount: number;
};

type LegalBatchAuditSeed = {
  seed: string;
  kind: string;
  sourceCount?: number;
  chunkCount?: number;
  message?: string;
};

type LegalBatchAuditSkippedSeeds = {
  unsupported: string[];
  limitSkipped: string[];
  stopSkipped: string[];
};

type LegalBatchAuditWarning = {
  code: string;
  message: string;
};

type LegalBatchAuditStatus =
  | {
    status: "operator_audit";
    batchStatus: "synced_batch" | "partial_batch" | "failed_batch";
    refreshStatus: "refresh_allowed" | "refresh_blocked";
    readyForRefresh: boolean;
    nextAction: "execute_refresh" | "fix_failed_seeds";
    counts: LegalBatchAuditCounts;
    syncedSeeds: LegalBatchAuditSeed[];
    failedSeeds: LegalBatchAuditSeed[];
    skippedSeeds: LegalBatchAuditSkippedSeeds;
    refreshCommands: string[];
    warnings: string[];
  }
  | {
    status: "legal_batch_audit_unavailable";
    refreshStatus: "unavailable";
    readyForRefresh: false;
    nextAction: "check_verified_legal_service";
    counts: LegalBatchAuditCounts;
    syncedSeeds: [];
    failedSeeds: [];
    skippedSeeds: LegalBatchAuditSkippedSeeds;
    refreshCommands: [];
    warnings: LegalBatchAuditWarning[];
  };

type LegalBatchAuditPayload = {
  data?: LegalBatchAuditStatus;
};

export function LegalBatchAuditStatusPanel() {
  const [auditStatus, setAuditStatus] = useState<LegalBatchAuditStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function refreshBatchAudit() {
    setLoading(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/legal-batch-audit", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`legal batch audit request failed: ${response.status}`);
      }
      const payload = await response.json() as LegalBatchAuditPayload;
      if (!payload.data) {
        throw new Error("legal batch audit response is empty");
      }
      setAuditStatus(payload.data);
      setStatusMessage("Legal batch audit refreshed.");
    } catch (error) {
      setAuditStatus(null);
      setStatusMessage(error instanceof Error ? error.message : "Legal batch audit request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBatchAudit();
  }, []);

  const warnings = useMemo(() => {
    if (!auditStatus) {
      return [];
    }
    return auditStatus.warnings.map((warning) => typeof warning === "string" ? warning : `${warning.code}: ${warning.message}`);
  }, [auditStatus]);

  const failedSeeds = auditStatus?.failedSeeds ?? [];
  const skippedSeeds = auditStatus?.skippedSeeds;
  const counts = auditStatus?.counts;
  const readyForRefresh = auditStatus?.readyForRefresh === true;
  const refreshStatus = auditStatus?.refreshStatus ?? "unknown";
  const nextAction = auditStatus?.nextAction ?? "check_verified_legal_service";

  return (
    <section className={styles.exportPanel} aria-label="Legal corpus refresh readiness">
      <div className={styles.exportHeader}>
        <div>
          <p>Legal corpus refresh readiness</p>
          <h4>{readinessTitle(auditStatus)}</h4>
        </div>
        <div className={styles.editorTools}>
          <button disabled={loading} onClick={refreshBatchAudit} type="button">
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className={styles.sourceChips} aria-label="Legal batch audit summary">
        <span>{readyForRefresh ? "Ready for refresh" : "Refresh not ready"}</span>
        <span>Refresh status {refreshStatus}</span>
        <span>Next action {nextAction}</span>
        <span>Attempted {counts?.attemptedCount ?? 0}</span>
        <span>Synced {counts?.syncedCount ?? 0}</span>
        <span>Failed {counts?.failedCount ?? 0}</span>
        <span>Skipped {counts?.skippedSupportedCount ?? 0}</span>
      </div>

      <div className={styles.syncHistory} aria-label="Legal batch audit rows">
        {auditStatus?.status === "legal_batch_audit_unavailable" ? (
          <article>
            <strong>Legal batch audit unavailable</strong>
            <span>Next action {auditStatus.nextAction}</span>
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </article>
        ) : null}

        {failedSeeds.length ? failedSeeds.map((seed) => (
          <article key={`${seed.kind}:${seed.seed}`}>
            <strong>{seed.seed}</strong>
            <span>Kind {seed.kind}</span>
            <span>Refresh status refresh_blocked</span>
            <p>{seed.message ?? "Failed seed requires operator review."}</p>
          </article>
        )) : null}

        {auditStatus?.status === "operator_audit" && !failedSeeds.length ? (
          <article>
            <strong>{readyForRefresh ? "Batch is ready for graph/eval refresh" : "Batch requires operator review"}</strong>
            <span>Batch status {auditStatus.batchStatus}</span>
            <span>Supported seeds {auditStatus.counts.supportedSeedCount}</span>
            <span>Limit skipped {skippedSeeds?.limitSkipped.length ?? 0}</span>
            <span>Unsupported {skippedSeeds?.unsupported.length ?? 0}</span>
            <span>Stop skipped {skippedSeeds?.stopSkipped.length ?? 0}</span>
          </article>
        ) : null}

        {skippedSeeds && (skippedSeeds.limitSkipped.length || skippedSeeds.unsupported.length || skippedSeeds.stopSkipped.length) ? (
          <article>
            <strong>Skipped seed buckets</strong>
            <span>Limit skipped {skippedSeeds.limitSkipped.join(", ") || "none"}</span>
            <span>Unsupported {skippedSeeds.unsupported.join(", ") || "none"}</span>
            <span>Stop skipped {skippedSeeds.stopSkipped.join(", ") || "none"}</span>
          </article>
        ) : null}

        {!auditStatus && !loading ? (
          <p className={styles.empty}>Legal batch audit status is not loaded.</p>
        ) : null}
      </div>

      {warnings.length && auditStatus?.status === "operator_audit" ? (
        <div className={styles.syncWarnings} aria-label="Legal batch audit warnings">
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}

      {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
    </section>
  );
}

function readinessTitle(auditStatus: LegalBatchAuditStatus | null): string {
  if (!auditStatus) {
    return "Audit status";
  }
  if (auditStatus.status === "legal_batch_audit_unavailable") {
    return "Audit unavailable";
  }
  return auditStatus.readyForRefresh ? "Refresh ready" : "Refresh blocked";
}
