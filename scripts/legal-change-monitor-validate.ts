import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasLegalChangeEvidenceImpact } from "../src/domains/assistant/legal-change-impact";
import { listLegalChangeItems, mapLegalChangeEventsToItems } from "../src/use-cases/legal-change-service";

const legalChangeWarningText = "인용된 근거 중 변경 감지된 법령이 있습니다. 적용일자와 최신 조문을 확인하세요.";

async function main() {
  assert.equal(hasLegalChangeEvidenceImpact([{ legal: undefined }]), false);
  assert.equal(hasLegalChangeEvidenceImpact([{
    legal: { sourceId: "law-1", stale: false, legalChangeWarnings: [] },
  }]), false);
  assert.equal(hasLegalChangeEvidenceImpact([{
    legal: { sourceId: "law-1", stale: false },
  }]), true);
  assert.equal(hasLegalChangeEvidenceImpact([{
    legal: { sourceId: "law-1", stale: false, legalChangeWarnings: ["amended"] },
  }]), true);
  assert.equal(hasLegalChangeEvidenceImpact([{ legal: "malformed" }]), true);

  const items = mapLegalChangeEventsToItems([
    {
      eventId: "legal_change:new",
      lawName: "건축법",
      sourceKind: "statute",
      changeKind: "amended",
      effectiveFrom: "2026-06-01",
      detectedAt: "2026-05-31T00:00:00.000Z",
      sourceUrl: "https://open.law.go.kr/LSO/main.do",
      affectedSourceIds: ["law:building-act", "ordinance:seoul"],
      affectedTaskIds: ["task-visible", "task-hidden"],
      reviewState: "new",
    },
    {
      eventId: "legal_change:hidden",
      lawName: "주택법",
      sourceKind: "statute",
      changeKind: "amended",
      effectiveFrom: "2026-07-01",
      detectedAt: "2026-05-31T00:00:00.000Z",
      affectedSourceIds: ["law:housing-act"],
      affectedTaskIds: ["task-hidden"],
      reviewState: "new",
    },
  ], { visibleTaskIds: ["task-visible"] });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    eventId: "legal_change:new",
    lawName: "건축법",
    changeKind: "amended",
    effectiveFrom: "2026-06-01",
    reviewState: "new",
    affectedSourceIds: ["law:building-act", "ordinance:seoul"],
    affectedTaskIds: ["task-visible"],
    affectedTaskCount: 1,
    sourceUrl: "https://open.law.go.kr/LSO/main.do",
    reindexStatus: "needs_reindex",
  });

  const empty = await listLegalChangeItems({ events: [] });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.monitor.status, "missing");

  const currentMonitor = await listLegalChangeItems({
    events: [],
    currentDate: "2026-05-31T00:00:00.000Z",
    monitorReport: {
      status: "legal_change_monitor_report",
      mode: "dry-run",
      days: 31,
      dateWindow: "2026-05-01..2026-05-31",
      detectedAt: "2026-05-30T09:00:00.000Z",
      eventCount: 2,
      unchangedCount: 7,
      staleSourceIds: ["law:building-act"],
      warnings: [
        "upstream path D:\\secret\\legal-change-monitor.json and LEGAL_CHANGE_MONITOR_SECRET must not leak",
        "verified-legal raw report JSON contains internal scheduler details",
      ],
      events: [],
    },
  } as Parameters<typeof listLegalChangeItems>[0]);
  assert.equal(currentMonitor.monitor.status, "current");
  assert.equal(currentMonitor.monitor.cadenceDays, 31);
  assert.equal(currentMonitor.monitor.lastRunAt, "2026-05-30T09:00:00.000Z");
  assert.equal(currentMonitor.monitor.eventCount, 2);
  assert.equal(currentMonitor.monitor.unchangedCount, 7);
  assert.equal(currentMonitor.monitor.staleSourceCount, 1);
  assert.equal(currentMonitor.monitor.dateWindow, "2026-05-01..2026-05-31");
  assert.match(currentMonitor.monitor.warnings.join(" "), /redacted/i);
  assert.doesNotMatch(JSON.stringify(currentMonitor.monitor), /LEGAL_CHANGE_MONITOR_SECRET|D:\\secret|raw report|verified-legal/i);

  const fixedMonitorSecret = "fixture-super-secret-token-12345";
  const previousMonitorSecret = process.env.LEGAL_CHANGE_MONITOR_SECRET;
  process.env.LEGAL_CHANGE_MONITOR_SECRET = fixedMonitorSecret;
  const unsafeMonitor = await listLegalChangeItems({
    events: [],
    currentDate: "2026-05-31T00:00:00.000Z",
    monitorReport: {
      status: "legal_change_monitor_report",
      days: 365,
      dateWindow: "D:\\secret\\verified-legal-raw-report.json",
      detectedAt: "2026-04-01T00:00:00.000Z",
      eventCount: 1,
      unchangedCount: 1,
      staleSourceIds: [],
      warnings: [
        `relative handoff staging/legal-sources/reports/monthly.json contains ${fixedMonitorSecret}`,
        "\\\\server\\share\\legal-change-monitor.json",
      ],
      events: [],
    },
  } as Parameters<typeof listLegalChangeItems>[0]);
  if (previousMonitorSecret === undefined) {
    delete process.env.LEGAL_CHANGE_MONITOR_SECRET;
  } else {
    process.env.LEGAL_CHANGE_MONITOR_SECRET = previousMonitorSecret;
  }
  assert.equal(unsafeMonitor.monitor.status, "stale");
  assert.equal(unsafeMonitor.monitor.cadenceDays, 31);
  assert.equal(unsafeMonitor.monitor.dateWindow, null);
  assert.match(unsafeMonitor.monitor.warnings.join(" "), /redacted/i);
  assert.doesNotMatch(
    JSON.stringify(unsafeMonitor.monitor),
    /fixture-super-secret|staging\/legal-sources|\\\\server|D:\\secret|verified-legal|raw-report|raw report/i,
  );

  const malformedMonitor = await listLegalChangeItems({
    events: [],
    currentDate: "2026-05-31T00:00:00.000Z",
    monitorReport: {
      status: "not_a_monitor_report",
      detectedAt: "2026-05-30T09:00:00.000Z",
      dateWindow: "2026-05-01..2026-05-31",
    },
  } as Parameters<typeof listLegalChangeItems>[0]);
  assert.equal(malformedMonitor.monitor.status, "missing");
  assert.equal(malformedMonitor.monitor.lastRunAt, null);

  const staleMonitor = await listLegalChangeItems({
    events: [],
    currentDate: "2026-05-31T00:00:00.000Z",
    monitorReport: {
      status: "legal_change_monitor_report",
      days: 31,
      dateWindow: "2026-03-01..2026-04-01",
      detectedAt: "2026-04-01T00:00:00.000Z",
      eventCount: 0,
      unchangedCount: 3,
      staleSourceIds: [],
      events: [],
    },
  } as Parameters<typeof listLegalChangeItems>[0]);
  assert.equal(staleMonitor.monitor.status, "stale");
  assert.match(staleMonitor.monitor.warnings.join(" "), /stale|older/i);

  const missingMonitor = await listLegalChangeItems({
    events: [],
    currentDate: "2026-05-31T00:00:00.000Z",
    monitorReportPath: "",
  } as Parameters<typeof listLegalChangeItems>[0]);
  assert.equal(missingMonitor.monitor.status, "missing");
  assert.equal(missingMonitor.monitor.lastRunAt, null);

  const panelSource = await readFile(join(process.cwd(), "src", "components", "admin", "legal-change-monitor-panel.tsx"), "utf8");
  assert.match(panelSource, /New legal changes/);
  assert.match(panelSource, /Legal monitor freshness/);
  assert.match(panelSource, /monitor\?\.status/);
  assert.match(panelSource, /lastRunAt/);
  assert.match(panelSource, /eventCount/);
  assert.match(panelSource, /unchangedCount/);
  assert.match(panelSource, /staleSourceCount/);
  assert.doesNotMatch(panelSource, /LEGAL_CHANGE_MONITOR_SECRET|LEGAL_CHANGE_MONITOR_REPORT_PATH|x-legal-change-monitor-secret|raw report/i);
  assert.match(panelSource, /effectiveFrom/);
  assert.match(panelSource, /affectedSourceIds/);
  assert.match(panelSource, /affectedTaskCount/);
  assert.match(panelSource, /reviewState/);
  assert.match(panelSource, /sourceUrl/);
  assert.match(panelSource, /reindexStatus/);
  assert.doesNotMatch(panelSource, /dismissed|not_required/);
  assert.doesNotMatch(panelSource, /central_knowledge|reviewKnowledgeCandidate|\/approve|\/reject/);

  const knowledgeShellSource = await readFile(join(process.cwd(), "src", "components", "admin", "knowledge-admin-shell.tsx"), "utf8");
  assert.match(knowledgeShellSource, /LegalChangeMonitorPanel/);

  const taskAssistantPanelSource = await readFile(join(process.cwd(), "src", "components", "tasks", "task-assistant-panel.tsx"), "utf8");
  assert.match(taskAssistantPanelSource, new RegExp(escapeRegExp(legalChangeWarningText)));
  assert.match(taskAssistantPanelSource, /hasLegalChangeImpactWarning/);
  assert.match(taskAssistantPanelSource, /appendLegalChangeReviewNotice/);
  assert.match(taskAssistantPanelSource, /requires review/i);

  const assistantServiceSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-service.ts"), "utf8");
  assert.match(assistantServiceSource, /normalizeLegalChangeConfidence/);
  assert.match(assistantServiceSource, /hasLegalChangeEvidenceImpact/);
  assert.match(assistantServiceSource, /hasLegalChangeEvidenceImpact\(evidence\)\s*\?\s*buildConfidenceReason/);
  assert.match(assistantServiceSource, /requires legal-change review/);

  const taskReviewServiceSource = await readFile(join(process.cwd(), "src", "use-cases", "task-review-service.ts"), "utf8");
  assert.match(taskReviewServiceSource, /hasLegalChangeEvidenceImpact\(input\.evidence\)/);
  assert.match(taskReviewServiceSource, /score:\s*Math\.min\(baseScore,\s*45\)/);
  assert.match(taskReviewServiceSource, /status === "failed"[\s\S]*score:\s*Math\.min\(baseScore,\s*25\)/);
  assert.match(taskReviewServiceSource, /requires legal-change review before use as current legal basis/);
  assert.match(
    taskReviewServiceSource,
    /saveTaskReviewSessionRecord[\s\S]*retrieveAssistantEvidence\([\s\S]*buildCentralizedLegalVerificationReport/,
  );
  assert.match(taskReviewServiceSource, /hasLegalChangeEvidenceImpact/);
  assert.match(taskReviewServiceSource, /buildPersistedTaskReviewConfidence[\s\S]*Math\.min\(input\.score,\s*40\)/);
  assert.match(taskReviewServiceSource, /answerBinding:\s*"unverified_client_submission"/);
  assert.doesNotMatch(
    taskReviewServiceSource,
    /const lawReport = input\.officialLawVerification|const legalApplicability = input\.legalApplicability/,
  );

  const assistantSaasModeSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-saas-mode-service.ts"), "utf8");
  assert.match(assistantSaasModeSource, /answer:\s*appendLegalChangeReviewNotice\(providerResult\.answer,\s*retrievalSnapshot\)/);
  assert.match(assistantSaasModeSource, /function appendLegalChangeReviewNotice/);
  assert.match(assistantSaasModeSource, new RegExp(escapeRegExp(legalChangeWarningText)));

  const routeSource = await readFile(join(process.cwd(), "src", "app", "api", "legal-changes", "route.ts"), "utf8");
  assert.match(routeSource, /NextResponse\.json\(\{\s*data\s*\}/);
  assert.match(routeSource, /requireKnowledgeAdmin/);
  assert.doesNotMatch(routeSource, /central_knowledge|reviewKnowledgeCandidate|\/approve|\/reject/);

  const legalChangeTypesSource = await readFile(join(process.cwd(), "src", "domains", "legal", "change-events.ts"), "utf8");
  assert.doesNotMatch(legalChangeTypesSource, /dismissed|not_required/);

  console.log(JSON.stringify({ status: "legal-change-monitor-pass", itemCount: items.length }));
}

main();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
