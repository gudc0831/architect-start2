import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchLegalBatchAuditStatus,
  mapLegalBatchAuditPayloadToStatus,
} from "../src/use-cases/legal-batch-audit-service";

async function main() {
  const cleanPayload = {
    status: "operator_audit",
    reportPath: "seed-pilot.json",
    batchStatus: "synced_batch",
    refreshStatus: "refresh_allowed",
    readyForRefresh: true,
    nextAction: "execute_refresh",
    counts: {
      seedCount: 17,
      supportedSeedCount: 17,
      requestedLimit: 1,
      attemptedCount: 1,
      syncedCount: 1,
      failedCount: 0,
      skippedSupportedCount: 16,
      unsupportedCount: 0,
    },
    syncedSeeds: [{ seed: "building-act", kind: "statute", sourceCount: 1, chunkCount: 166 }],
    failedSeeds: [],
    skippedSeeds: {
      unsupported: [],
      limitSkipped: ["housing-act"],
      stopSkipped: [],
    },
    refreshCommands: ["npm.cmd run build:legal-graph", "npm.cmd run eval:legal-retrieval"],
    warnings: [`upstream warning D:\\artifact\\sources.jsonl OC${"="}raw-token`],
    paths: {
      sourcesJsonl: "D:\\artifact\\sources.jsonl",
      sourceDigestsJson: "D:\\artifact\\source-digests.json",
      chunksJsonl: "D:\\artifact\\chunks.jsonl",
      embeddingsJsonl: "D:\\artifact\\embeddings.jsonl",
    },
  };

  const mapped = mapLegalBatchAuditPayloadToStatus(cleanPayload);
  assert.equal(mapped.status, "operator_audit");
  assert.equal(mapped.readyForRefresh, true);
  assert.equal(mapped.counts.syncedCount, 1);
  assert.equal("reportPath" in mapped, false);
  assert.equal("paths" in mapped, false);
  const mappedText = JSON.stringify(mapped);
  assert.equal(mappedText.includes("D:\\artifact"), false);
  assert.equal(mappedText.includes(`OC${"="}`), false);

  const previousEvidenceApiUrl = process.env.VERIFIED_LEGAL_EVIDENCE_API_URL;
  const previousMonitorSecret = process.env.LEGAL_CHANGE_MONITOR_SECRET;
  const previousReportPath = process.env.LEGAL_BATCH_AUDIT_REPORT_PATH;
  const previousVercelBypassSecret = process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;
  try {
    process.env.VERIFIED_LEGAL_EVIDENCE_API_URL = "http://verified-legal.local";
    process.env.LEGAL_CHANGE_MONITOR_SECRET = "monitor-secret";
    process.env.LEGAL_BATCH_AUDIT_REPORT_PATH = "seed-pilot.json";
    delete process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;

    const blocked = mapLegalBatchAuditPayloadToStatus({
      ...cleanPayload,
      batchStatus: "failed_batch",
      refreshStatus: "refresh_blocked",
      readyForRefresh: false,
      nextAction: "fix_failed_seeds",
      counts: {
        ...cleanPayload.counts,
        syncedCount: 0,
        failedCount: 1,
      },
      syncedSeeds: [],
      failedSeeds: [{ seed: "housing-act", kind: "statute", message: `failed with monitor-secret and OC${"="}raw-token` }],
      refreshCommands: [],
    });
    assert.equal(blocked.status, "operator_audit");
    assert.equal(blocked.readyForRefresh, false);
    assert.equal(blocked.failedSeeds[0]?.message.includes("monitor-secret"), false);
    assert.equal(JSON.stringify(blocked).includes(`OC${"="}`), false);

    const captured: Array<{
      url: string;
      body: unknown;
      secretHeader: string | null;
      bypassHeader: string | null;
      signal?: AbortSignal;
    }> = [];
    const fetched = await fetchLegalBatchAuditStatus({
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        captured.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
          secretHeader: headers.get("x-legal-change-monitor-secret"),
          bypassHeader: headers.get("x-vercel-protection-bypass"),
          signal: init?.signal ?? undefined,
        });
        return Response.json(cleanPayload);
      },
    });
    assert.equal(fetched.status, "operator_audit");
    assert.equal(captured[0]?.url, "http://verified-legal.local/api/legal/batch-refresh/audit-summary");
    assert.deepEqual(captured[0]?.body, { reportPath: "seed-pilot.json" });
    assert.equal(captured[0]?.secretHeader, "monitor-secret");
    assert.equal(captured[0]?.bypassHeader, null);
    assert.ok(captured[0]?.signal instanceof AbortSignal);
    assert.equal(JSON.stringify(fetched).includes("monitor-secret"), false);

    process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET = "fixture-vercel-bypass";
    const bypassCaptured: Array<{ bypassHeader: string | null }> = [];
    await fetchLegalBatchAuditStatus({
      fetchImpl: async (_input, init) => {
        bypassCaptured.push({
          bypassHeader: new Headers(init?.headers).get("x-vercel-protection-bypass"),
        });
        return Response.json(cleanPayload);
      },
    });
    assert.equal(bypassCaptured[0]?.bypassHeader, "fixture-vercel-bypass");
    delete process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;

    let unsafeFetchCalled = false;
    const unsafe = await fetchLegalBatchAuditStatus({
      reportPath: "D:\\artifact\\seed-pilot.json",
      fetchImpl: async () => {
        unsafeFetchCalled = true;
        return Response.json(cleanPayload);
      },
    });
    assert.equal(unsafe.status, "legal_batch_audit_unavailable");
    assert.equal(unsafeFetchCalled, false);
    assert.equal(JSON.stringify(unsafe).includes("D:\\artifact"), false);

    const upstreamForbidden = await fetchLegalBatchAuditStatus({
      reportPath: "seed-pilot.json",
      fetchImpl: async () => Response.json({
        error: "Legal batch audit summary requires a server-side secret.",
        errorCode: "LEGAL_BATCH_AUDIT_FORBIDDEN",
        remediation: "secret monitor-secret D:\\artifact\\report.json via x-legal-change-monitor-secret and LEGAL_CHANGE_MONITOR_SECRET",
      }, { status: 403 }),
    });
    assert.equal(upstreamForbidden.status, "legal_batch_audit_unavailable");
    assert.equal(upstreamForbidden.warnings[0]?.code, "VERIFIED_LEGAL_BATCH_AUDIT_FORBIDDEN");
    assert.equal(JSON.stringify(upstreamForbidden).includes("monitor-secret"), false);
    assert.equal(JSON.stringify(upstreamForbidden).includes("D:\\artifact"), false);
    assert.equal(JSON.stringify(upstreamForbidden).includes("x-legal-change-monitor-secret"), false);
    assert.equal(JSON.stringify(upstreamForbidden).includes("LEGAL_CHANGE_MONITOR_SECRET"), false);

    const upstreamMissing = await fetchLegalBatchAuditStatus({
      reportPath: "missing.json",
      fetchImpl: async () => Response.json({
        errorCode: "LEGAL_BATCH_REPORT_MISSING",
        error: "missing D:\\artifact\\missing.json",
      }, { status: 409 }),
    });
    assert.equal(upstreamMissing.status, "legal_batch_audit_unavailable");
    assert.equal(upstreamMissing.warnings[0]?.code, "VERIFIED_LEGAL_BATCH_AUDIT_REPORT_UNAVAILABLE");
    assert.equal(JSON.stringify(upstreamMissing).includes("D:\\artifact"), false);
  } finally {
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_API_URL", previousEvidenceApiUrl);
    restoreEnv("LEGAL_CHANGE_MONITOR_SECRET", previousMonitorSecret);
    restoreEnv("LEGAL_BATCH_AUDIT_REPORT_PATH", previousReportPath);
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET", previousVercelBypassSecret);
  }

  const missingSecret = await fetchLegalBatchAuditStatus({
    serviceUrl: "http://verified-legal.local",
    reportPath: "seed-pilot.json",
    secret: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called without server secret");
    },
  });
  assert.equal(missingSecret.status, "legal_batch_audit_unavailable");
  assert.equal(missingSecret.warnings[0]?.code, "VERIFIED_LEGAL_BATCH_AUDIT_SECRET_MISSING");

  const invalidPayload = mapLegalBatchAuditPayloadToStatus({
    status: "operator_audit",
    refreshStatus: "refresh_allowed",
  });
  assert.equal(invalidPayload.status, "legal_batch_audit_unavailable");

  const routeSource = await readFile(join(process.cwd(), "src", "app", "api", "legal-batch-audit", "route.ts"), "utf8");
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /requireKnowledgeAdmin\(\)/);
  assert.match(routeSource, /requireCurrentProjectAccess\(user\)/);
  assert.match(routeSource, /fetchLegalBatchAuditStatus/);
  assert.doesNotMatch(routeSource, /searchParams|get\("reportPath"\)/);
  assert.doesNotMatch(routeSource, /LEGAL_CHANGE_MONITOR_SECRET/);
  assert.doesNotMatch(routeSource, /x-legal-change-monitor-secret/i);

  const serviceSource = await readFile(join(process.cwd(), "src", "use-cases", "legal-batch-audit-service.ts"), "utf8");
  assert.match(serviceSource, /assertServerOnlyRuntime\(\);/);
  assert.match(serviceSource, /typeof window !== "undefined"/);

  const panelSource = await readFile(join(process.cwd(), "src", "components", "admin", "legal-batch-audit-status-panel.tsx"), "utf8");
  assert.match(panelSource, /Legal corpus refresh readiness/);
  assert.match(panelSource, /<p>Legal corpus refresh readiness<\/p>/);
  assert.match(panelSource, /<h4>\{readinessTitle\(auditStatus\)\}<\/h4>/);
  assert.match(panelSource, /\/api\/legal-batch-audit/);
  assert.match(panelSource, /readyForRefresh/);
  assert.match(panelSource, /refreshStatus/);
  assert.match(panelSource, /failedSeeds/);
  assert.match(panelSource, /skippedSeeds/);
  assert.match(panelSource, /nextAction/);
  assert.match(panelSource, /legal_batch_audit_unavailable/);
  assert.doesNotMatch(panelSource, /<h2>|<span>Legal corpus refresh readiness<\/span>/);
  assert.doesNotMatch(panelSource, /reportPath|paths|LEGAL_CHANGE_MONITOR_SECRET|x-legal-change-monitor-secret/i);

  const knowledgeShellSource = await readFile(join(process.cwd(), "src", "components", "admin", "knowledge-admin-shell.tsx"), "utf8");
  assert.match(knowledgeShellSource, /LegalBatchAuditStatusPanel/);

  const envExample = await readFile(join(process.cwd(), ".env.example"), "utf8");
  assert.match(envExample, /LEGAL_BATCH_AUDIT_REPORT_PATH=/);
  assert.match(envExample, /LEGAL_CHANGE_MONITOR_SECRET=/);
  assert.match(envExample, /server-only legal batch audit/i);

  console.log(JSON.stringify({ status: "legal-batch-audit-adapter-pass", cases: 20 }));
}

main();

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}
