import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listLegalChangeItems, mapLegalChangeEventsToItems } from "../src/use-cases/legal-change-service";

async function main() {
  const items = mapLegalChangeEventsToItems([
    {
      eventId: "legal_change:abc123",
      lawName: "건축법",
      sourceKind: "statute",
      changeKind: "amended",
      effectiveFrom: "2026-06-01",
      detectedAt: "2026-05-30T00:00:00.000Z",
      affectedSourceIds: ["law:building"],
      affectedTaskIds: [],
      reviewState: "new",
    },
  ]);

  assert.deepEqual(items, [
    {
      eventId: "legal_change:abc123",
      lawName: "건축법",
      changeKind: "amended",
      effectiveFrom: "2026-06-01",
      reviewState: "new",
      affectedSourceIds: ["law:building"],
      affectedTaskIds: [],
      affectedTaskCount: 0,
      sourceUrl: undefined,
      reindexStatus: "needs_reindex",
    },
  ]);

  const scoped = await listLegalChangeItems({
    visibleTaskIds: ["task-visible"],
    events: [
      {
        eventId: "legal_change:scoped",
        lawName: "주택법",
        sourceKind: "statute",
        changeKind: "amended",
        effectiveFrom: "2026-06-01",
        detectedAt: "2026-05-30T00:00:00.000Z",
        affectedSourceIds: ["law:housing"],
        affectedTaskIds: ["task-visible", "task-other-project"],
        reviewState: "new",
      },
      {
        eventId: "legal_change:other-project",
        lawName: "주차장법",
        sourceKind: "statute",
        changeKind: "amended",
        effectiveFrom: "2026-06-01",
        detectedAt: "2026-05-30T00:00:00.000Z",
        affectedSourceIds: ["law:parking"],
        affectedTaskIds: ["task-other-project"],
        reviewState: "new",
      },
    ],
  });
  assert.equal(scoped.items.length, 1);
  assert.deepEqual(scoped.items[0]?.affectedTaskIds, ["task-visible"]);

  const routePath = join(process.cwd(), "src", "app", "api", "legal-changes", "route.ts");
  const routeSource = await readFile(routePath, "utf8");
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /NextResponse\.json\(\{\s*data\s*\}/);
  assert.match(routeSource, /requireKnowledgeAdmin/);
  assert.doesNotMatch(routeSource, /assertRequestIntegrity/);
  assert.doesNotMatch(routeSource, /central_knowledge|reviewKnowledgeCandidate|approve|reject/);

  console.log(JSON.stringify({ status: "legal-change-service-fixture-pass", itemCount: items.length }));
}

main();
