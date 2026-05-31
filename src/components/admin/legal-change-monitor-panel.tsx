"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/admin/knowledge-admin-shell.module.css";
import type { LegalChangeItem, LegalChangeMonitorFreshness } from "@/domains/legal/change-events";

type LegalChangeListPayload = {
  data?: {
    items?: LegalChangeItem[];
    monitor?: LegalChangeMonitorFreshness;
  };
};

const reviewStateLabels: Record<LegalChangeItem["reviewState"], string> = {
  new: "new",
  acknowledged: "acknowledged",
};

const reindexStatusLabels: Record<LegalChangeItem["reindexStatus"], string> = {
  needs_reindex: "needs re-index",
};

export function LegalChangeMonitorPanel() {
  const [items, setItems] = useState<LegalChangeItem[]>([]);
  const [monitor, setMonitor] = useState<LegalChangeMonitorFreshness | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function refreshLegalChanges() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/legal-changes", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`legal changes request failed: ${response.status}`);
      }
      const payload = await response.json() as LegalChangeListPayload;
      setItems(Array.isArray(payload.data?.items) ? payload.data.items : []);
      setMonitor(payload.data?.monitor ?? null);
      setStatus("Legal changes refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Legal changes request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshLegalChanges();
  }, []);

  const newChangeCount = useMemo(() => items.filter((item) => item.reviewState === "new").length, [items]);
  const affectedTaskTotal = useMemo(
    () => items.reduce((total, item) => total + item.affectedTaskCount, 0),
    [items],
  );
  const monitorStatus = monitor?.status ?? "missing";
  const lastRunAt = monitor?.lastRunAt ?? null;
  const eventCount = monitor?.eventCount ?? 0;
  const unchangedCount = monitor?.unchangedCount ?? 0;
  const staleSourceCount = monitor?.staleSourceCount ?? 0;

  return (
    <section className={styles.exportPanel} aria-label="Legal change monitor">
      <div className={styles.exportHeader}>
        <div>
          <span>Legal change monitor</span>
          <h2>New legal changes</h2>
        </div>
        <div className={styles.editorTools}>
          <button disabled={loading} onClick={refreshLegalChanges} type="button">
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
      <div className={styles.sourceChips} aria-label="Legal monitor freshness">
        <span>Legal monitor freshness {monitorStatus}</span>
        <span>Last run {lastRunAt ?? "not configured"}</span>
        <span>Monthly cadence {monitor?.cadenceDays ?? 31} days</span>
        <span>Detected events {eventCount}</span>
        <span>Unchanged sources {unchangedCount}</span>
        <span>Stale sources {staleSourceCount}</span>
      </div>
      {monitor?.warnings.length ? (
        <p className={styles.status}>{monitor.warnings[0]}</p>
      ) : null}
      <div className={styles.sourceChips} aria-label="Legal change summary">
        <span>New legal changes {newChangeCount}</span>
        <span>Affected task count {affectedTaskTotal}</span>
        <span>Review states {Array.from(new Set(items.map((item) => item.reviewState))).join(", ") || "none"}</span>
      </div>
      <div className={styles.syncHistory} aria-label="Legal change rows">
        {items.length ? items.map((item) => (
          <article className={styles.evidence} key={item.eventId}>
            <strong>{item.lawName}</strong>
            <span>Effective date {item.effectiveFrom ?? "unknown"}</span>
            <span>Review state {reviewStateLabels[item.reviewState]}</span>
            <span>Re-index status {reindexStatusLabels[item.reindexStatus]}</span>
            <span>Affected source ids {item.affectedSourceIds.join(", ") || "none"}</span>
            <span>Affected task count {item.affectedTaskCount}</span>
            {item.sourceUrl ? (
              <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                Open source link
              </a>
            ) : null}
          </article>
        )) : (
          <p className={styles.empty}>{loading ? "Loading legal changes..." : "No legal changes are currently visible."}</p>
        )}
      </div>
      {status ? <p className={styles.status}>{status}</p> : null}
    </section>
  );
}
