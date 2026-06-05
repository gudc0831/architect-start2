# AI-settings Local Codex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/ai-settings` for every active Architect SaaS user to manage personal AI defaults and view service/local Codex usage without moving policy controls out of `/admin/assistant`.

**Architecture:** Store personal defaults in `profile_preferences`, expose self-only active-user APIs, and keep service-run usage in metadata-only `assistant_usage_events`. The browser assistant/native-host bridge provides status immediately and local usage only after explicit lazy scan; local scan results stay in browser memory/sessionStorage and are never sent to SaaS.

**Tech Stack:** Next.js App Router, React client components, Prisma/Postgres plus local JSON repositories, Chrome extension content/background bridge, Node native host, TypeScript validation scripts, CSS semantic theme tokens.

---

## Planning Inputs

- Design source read before planning: `D:\architect-workspace\architect-saas\docs\superpowers\specs\2026-06-05-ai-settings-local-codex-design.md`.
- SaaS worktree: `D:\architect-workspace\architect-saas-ai-settings-worktree`, branch `codex/ai-settings-local-codex`.
- Browser assistant worktree: `D:\architect-workspace\architect-browser-assistant-ai-settings-worktree`, branch `codex/ai-settings-local-codex`.
- Baseline verification:
  - `architect-saas`: `npm ci`, `npm run db:generate`, `npm run typecheck` pass.
  - `architect-browser-assistant`: `npm ci`, `npm run typecheck` pass.
- Original checkout dirty state was left untouched.

## Key Decisions Locked For Implementation

1. Use existing `assistant_usage_events` as the authoritative metadata-only service usage source, extended from `executionMode: "saas-api"` to `executionMode: "saas-api" | "local-chatgpt-codex"`.
2. Do not aggregate from `assistant_task_records` for `/api/assistant/usage/me`, because records contain prompt/answer/evidence fields and would raise projection risk. The usage API may link bounded `assistantRecordId` metadata only.
3. Record Local Codex service-run usage events after Architect SaaS starts a Local Codex run. If token counts are unavailable from the native bridge, store `0` token counts plus metadata flags such as `usageAvailable: false`; do not infer billing-grade token totals.
4. Keep local full usage scan entirely client-side after the browser bridge response. The SaaS page computes combined view in memory only.
5. Preliminary browser-assistant edits are partially compatible only for `codexOptions` shape. The `codex.configPath` status field conflicts with the design privacy rule and must be discarded or replaced with sanitized enum/status fields.

## File Map

### architect-saas

- Modify: `prisma/schema.prisma`
  - Add AI preference fields to `ProfilePreference`.
  - Extend usage event semantics without adding raw text fields.
- Create: `prisma/migrations/202606050001_add_ai_settings_preferences_and_local_usage/migration.sql`
  - Add preference columns and safe defaults.
  - Add comments/checks/indexes only where supported by existing migration style.
- Modify: `src/domains/preferences/types.ts`
  - Add AI settings enums, defaults, sanitizer, and resolver.
- Modify: `src/repositories/contracts.ts`
  - Extend `PreferenceRepository` with `getAiSettings` and `saveAiSettings`.
- Modify: `src/repositories/postgres/store.ts`
  - Persist AI settings on `profile_preferences`.
- Modify: `src/repositories/local/preference-store.ts`
  - Preserve local repository parity for preview/local backend.
- Modify: `src/repositories/index.ts`
  - Proxy new preference methods.
- Modify: `src/use-cases/preference-service.ts`
  - Add self-only AI settings read/write service functions.
- Create: `src/lib/auth/active-user.ts`
  - Add `requireActiveUser()` helper for personal global routes that do not require project membership.
- Create: `src/app/api/preferences/ai-settings/route.ts`
  - `GET` and `PATCH` self-only active-user preference API.
- Modify: `src/domains/assistant/saas-api-mode.ts`
  - Widen usage event execution mode and define sanitized personal usage aggregate DTO types.
- Modify: `src/repositories/assistant/contracts.ts`
  - Widen create/list usage input and add self usage query shape.
- Modify: `src/repositories/assistant/postgres-store.ts`
  - Save local-codex usage events and list by `profileId`/date range for `/me`.
- Modify: `src/repositories/assistant/local-store.ts`
  - Same usage event widening and self query in local store.
- Modify: `src/use-cases/assistant-saas-mode-service.ts` or create `src/use-cases/assistant-usage-service.ts`
  - Add `getMyAssistantUsageSummary()` with metadata-only projection and bucket aggregation.
- Create: `src/app/api/assistant/usage/me/route.ts`
  - Self-only active-user usage API.
- Modify: `src/components/layout/sidebar.tsx`
  - Add `AI-settings` nav item outside admin/project-manager blocks.
- Modify: `src/components/layout/app-shell.tsx`
  - Add `/ai-settings` to active-user gated app paths, without requiring project membership redirect.
- Modify: `src/lib/ui-copy/catalog.ts`
  - Add nav/copy strings for `AI-settings` in Korean and English.
- Create: `src/app/ai-settings/page.tsx`
  - Server page with active-user guard.
- Create: `src/components/ai-settings/ai-settings-page.tsx`
  - Client page orchestration.
- Create: `src/components/ai-settings/ai-settings-client.ts`
  - Fetch helpers, bridge helpers, sessionStorage cache, DTO validators.
- Create: `src/components/ai-settings/usage-aggregation.ts`
  - KPI formulas and dedupe/uncertain-layer aggregation.
- Create: `src/components/ai-settings/usage-chart.tsx`
  - Accessible SVG stacked usage chart and table fallback.
- Create: `src/components/ai-settings/ai-settings-page.module.css`
  - Page-specific layout using semantic CSS variables only.
- Modify: `src/app/globals.css`
  - Add AI semantic theme roles per theme.
- Modify: `src/components/tasks/task-assistant-panel.tsx`
  - Load personal defaults before Local Codex generation and pass normalized options through the bridge.
  - Create metadata-only local-codex usage event after service-run completion.
- Create: `scripts/ai-settings-contract-validate.ts`
  - Static validator for privacy, route, preference, usage, and bridge constraints.

### architect-browser-assistant

- Modify: `src/runtime/ArchitectLocalAssistantRuntime.ts`
  - Add sanitized status detail, `bridgeSchemaVersion`, `codexOptions`, and usage summary DTOs.
- Modify: `src/runtime/native-bridge-contract.ts`
  - Add `codex.status`/`codex.usageSummary` contract via existing typed message names.
- Modify: `src/runtime/local-runtime-client.ts`
  - Add status/capability/usage summary client helpers if needed by side-panel tests.
- Modify: `src/content/content-script.ts`
  - Add explicit page command allowlist for `status`, `generate`, `usage-summary`; validate inputs/outputs.
- Modify: `src/background/service-worker.ts`
  - Add extension message handling and native request mapping for usage summary.
- Modify: `native-host/codex-bridge-host.mjs`
  - Add schema-versioned status and bounded local usage scan.
- Modify: `native-host/codex-bridge-host.node-test.mjs`
  - Add native scan privacy, limit, symlink/reparse, cancellation/one-at-a-time tests.
- Modify: `src/content/content-script.test.ts`
  - Add page bridge allowlist, invalid payload, unsupported-version, usage-summary tests.
- Modify: `src/runtime/local-runtime-client.test.ts`
  - Add capability/status tests.
- Create: `scripts/ai-settings-bridge-privacy-validate.mjs`
  - Static validator that fails on prompt/session/path leakage in usage summary DTOs.

## Task 0: Reconcile Preliminary Browser Assistant Edits

**Files:**
- Review original dirty files:
  - `D:\architect-workspace\architect-browser-assistant\src\runtime\ArchitectLocalAssistantRuntime.ts`
  - `D:\architect-workspace\architect-browser-assistant\src\content\content-script.ts`
- Implement only in worktree:
  - `D:\architect-workspace\architect-browser-assistant-ai-settings-worktree\src\runtime\ArchitectLocalAssistantRuntime.ts`
  - `D:\architect-workspace\architect-browser-assistant-ai-settings-worktree\src\content\content-script.ts`

- [ ] **Step 1: Confirm original preliminary diff**

Run:

```powershell
git -C D:\architect-workspace\architect-browser-assistant diff -- src/runtime/ArchitectLocalAssistantRuntime.ts src/content/content-script.ts
```

Expected:
- `content-script.ts` adds `codexOptions` sanitizer for model/reasoning/service tier.
- `ArchitectLocalAssistantRuntime.ts` adds `codexOptions`.
- It also adds `codex.configPath`, which must not cross the page bridge.

- [ ] **Step 2: Classify each preliminary change**

Use this classification:

```text
Accept with rewrite:
- AssistantRuntimeCodexOptions model/reasoningEffort/serviceTier shape.
- content-script sanitizer idea, but avoid repeated normalize calls and align enum values with SaaS sanitizer.

Reject/replace:
- codex.configPath in status DTO because absolute local paths/usernames must not be returned.
- Any raw command/stderr/path details in status response.
```

- [ ] **Step 3: Apply accepted parts only in browser-assistant worktree**

Implement the accepted option shape in the worktree after Tasks 1-3 define the final SaaS enum names. Do not apply the original diff verbatim.

- [ ] **Step 4: Leave original dirty checkout untouched until final user decision**

Do not run `git checkout --` or otherwise revert the original preliminary edits without explicit approval. Final report must say whether those original edits should be manually discarded after the worktree implementation supersedes them.

## Task 1: AI Preference Schema And Domain Types

**Files:**
- Modify: `D:\architect-workspace\architect-saas-ai-settings-worktree\prisma\schema.prisma`
- Create: `D:\architect-workspace\architect-saas-ai-settings-worktree\prisma\migrations\202606050001_add_ai_settings_preferences_and_local_usage\migration.sql`
- Modify: `D:\architect-workspace\architect-saas-ai-settings-worktree\src\domains\preferences\types.ts`

- [ ] **Step 1: Add failing sanitizer coverage in a validator script**

Create or extend `scripts/ai-settings-contract-validate.ts` with assertions for:

```ts
assert.deepEqual(sanitizeAiSettingsPreference({}), DEFAULT_AI_SETTINGS_PREFERENCE);
assert.equal(sanitizeAiSettingsPreference({ aiReasoningEffort: "xhigh" }).aiReasoningEffort, "medium");
assert.equal(sanitizeAiSettingsPreference({ aiLocalUsageDefaultRangeDays: 90 }).aiLocalUsageDefaultRangeDays, 90);
assert.equal(sanitizeAiSettingsPreference({ aiRequestTimeoutMs: 9999999 }).aiRequestTimeoutMs, 120000);
```

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: FAIL before implementation because the sanitizer does not exist.

- [ ] **Step 2: Add schema fields**

Add fields to `ProfilePreference`:

```prisma
aiDefaultModel String @default("gpt-5-codex") @map("ai_default_model")
aiReasoningEffort String @default("medium") @map("ai_reasoning_effort")
aiServiceTier String @default("auto") @map("ai_service_tier")
aiRequestTimeoutMs Int @default(120000) @map("ai_request_timeout_ms")
aiLocalUsageDefaultRangeDays Int @default(30) @map("ai_local_usage_default_range_days")
```

Migration SQL:

```sql
alter table "profile_preferences"
  add column "ai_default_model" text not null default 'gpt-5-codex',
  add column "ai_reasoning_effort" text not null default 'medium',
  add column "ai_service_tier" text not null default 'auto',
  add column "ai_request_timeout_ms" integer not null default 120000,
  add column "ai_local_usage_default_range_days" integer not null default 30;

alter table "profile_preferences"
  add constraint "profile_preferences_ai_reasoning_effort_check"
  check ("ai_reasoning_effort" in ('minimal', 'low', 'medium', 'high'));

alter table "profile_preferences"
  add constraint "profile_preferences_ai_service_tier_check"
  check ("ai_service_tier" in ('auto', 'default', 'priority'));

alter table "profile_preferences"
  add constraint "profile_preferences_ai_request_timeout_ms_check"
  check ("ai_request_timeout_ms" between 30000 and 120000);

alter table "profile_preferences"
  add constraint "profile_preferences_ai_local_usage_range_check"
  check ("ai_local_usage_default_range_days" in (30, 90, 0));
```

Use `0` to represent full scan in persisted preference only; DTO labels should expose `"all"` for local bridge scan.

- [ ] **Step 3: Add preference types and sanitizer**

Add:

```ts
export const aiReasoningEfforts = ["minimal", "low", "medium", "high"] as const;
export const aiServiceTiers = ["auto", "default", "priority"] as const;
export const aiLocalUsageRangeDays = [30, 90, 0] as const;

export type AiReasoningEffort = (typeof aiReasoningEfforts)[number];
export type AiServiceTier = (typeof aiServiceTiers)[number];
export type AiLocalUsageRangeDays = (typeof aiLocalUsageRangeDays)[number];

export type AiSettingsPreference = {
  aiDefaultModel: string;
  aiReasoningEffort: AiReasoningEffort;
  aiServiceTier: AiServiceTier;
  aiRequestTimeoutMs: number;
  aiLocalUsageDefaultRangeDays: AiLocalUsageRangeDays;
};
```

Defaults:

```ts
export const DEFAULT_AI_SETTINGS_PREFERENCE: AiSettingsPreference = {
  aiDefaultModel: "gpt-5-codex",
  aiReasoningEffort: "medium",
  aiServiceTier: "auto",
  aiRequestTimeoutMs: 120000,
  aiLocalUsageDefaultRangeDays: 30,
};
```

Rules:
- model pattern: `/^[A-Za-z0-9._:-]{1,80}$/`
- timeout clamp: `30000..120000`
- no `xhigh`
- no arbitrary local paths, tokens, prompt text, transcript text.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run db:generate
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: all pass.

## Task 2: Preference Repository And API

**Files:**
- Modify: `src/repositories/contracts.ts`
- Modify: `src/repositories/postgres/store.ts`
- Modify: `src/repositories/local/preference-store.ts`
- Modify: `src/repositories/index.ts`
- Modify: `src/use-cases/preference-service.ts`
- Create: `src/lib/auth/active-user.ts`
- Create: `src/app/api/preferences/ai-settings/route.ts`

- [ ] **Step 1: Add failing contract assertions**

Extend `scripts/ai-settings-contract-validate.ts` to assert:

```ts
assert.match(preferenceServiceSource, /getAiSettingsPreference/);
assert.match(preferenceServiceSource, /updateAiSettingsPreference/);
assert.match(aiSettingsRouteSource, /requireActiveUser\(\)/);
assert.doesNotMatch(aiSettingsRouteSource, /requireRole\("admin"\)/);
```

Run and confirm failure before implementation.

- [ ] **Step 2: Add active-user helper**

Create `src/lib/auth/active-user.ts`:

```ts
import type { AuthUser } from "@/domains/auth/types";
import { forbidden } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";

export async function requireActiveUser(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.accessStatus !== "active") {
    throw forbidden("Active profile access is required", "PROFILE_ACCESS_NOT_ACTIVE");
  }
  return user;
}
```

- [ ] **Step 3: Add repository methods**

Add to `PreferenceRepository`:

```ts
getAiSettingsPreference(profileId: string): Promise<AiSettingsPreference>;
saveAiSettingsPreference(profileId: string, preference: AiSettingsPreference): Promise<AiSettingsPreference>;
```

Postgres upsert must select only the AI preference fields. Local store must preserve existing fields when saving AI settings.

- [ ] **Step 4: Add service and API**

`GET /api/preferences/ai-settings`:

```ts
const user = await requireActiveUser();
const preference = await getAiSettingsPreference(user.id);
return NextResponse.json({ data: preference });
```

`PATCH /api/preferences/ai-settings`:

```ts
assertRequestIntegrity(request);
const user = await requireActiveUser();
const body = await request.json();
const preference = await updateAiSettingsPreference(user.id, body);
return NextResponse.json({ data: preference });
```

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 3: Service Usage Event Contract And Self Usage API

**Files:**
- Modify: `src/domains/assistant/saas-api-mode.ts`
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`
- Create: `src/use-cases/assistant-usage-service.ts`
- Create: `src/app/api/assistant/usage/me/route.ts`

- [ ] **Step 1: Add failing privacy/projection assertions**

Extend validator to assert:

```ts
assert.match(usageRouteSource, /requireActiveUser\(\)/);
assert.match(usageServiceSource, /profileId:\s*user\.id/);
assert.doesNotMatch(usageServiceSource, /question|answer|evidence|conversationMemory|threadMessages|transcript|rawLog/);
assert.match(usageServiceSource, /bucket/);
assert.match(usageServiceSource, /metadataOnly/);
```

- [ ] **Step 2: Widen usage event type**

Change:

```ts
executionMode: "saas-api";
```

to:

```ts
executionMode: "saas-api" | "local-chatgpt-codex";
```

Add workflow/source metadata extraction from `event.metadata.workflow` only after sanitizing to a short enum-like string.

- [ ] **Step 3: Add self usage query**

Repository input:

```ts
export type ListAssistantUsageEventsForProfileInput = {
  profileId: string;
  from: string;
  to: string;
  limit?: number;
};
```

Postgres `where`:

```ts
where: {
  profileId: input.profileId,
  createdAt: {
    gte: new Date(input.from),
    lt: new Date(input.to),
  },
}
```

Do not include assistant records, thread messages, prompt, answer, evidence, or audit metadata in this query.

- [ ] **Step 4: Build aggregate DTO**

Return shape:

```ts
{
  range: { from: string; to: string; granularity: "day" | "week" | "month" };
  totals: {
    serviceInputTokens: number;
    serviceOutputTokens: number;
    serviceTotalTokens: number;
    serviceRunCount: number;
    failedRunCount: number;
  };
  buckets: Array<{
    bucket: string;
    serviceInputTokens: number;
    serviceOutputTokens: number;
    serviceTotalTokens: number;
    serviceRunCount: number;
    workflowCounts: Record<string, number>;
  }>;
  metadataOnly: true;
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 4: Route, Sidebar, And Page Shell

**Files:**
- Create: `src/app/ai-settings/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/lib/ui-copy/catalog.ts`

- [ ] **Step 1: Add failing route/nav assertions**

Validator assertions:

```ts
assert.match(aiSettingsPageSource, /requireActiveUser\(\)/);
assert.match(sidebarSource, /href:\s*"\/ai-settings"/);
assert.doesNotMatch(sidebarSource, /role === "admin"[\s\S]{0,200}\/ai-settings/);
assert.match(appShellSource, /pathname === "\/ai-settings"/);
```

- [ ] **Step 2: Add page guard**

`src/app/ai-settings/page.tsx`:

```tsx
import { AiSettingsPage } from "@/components/ai-settings/ai-settings-page";
import { requireActiveUser } from "@/lib/auth/active-user";

export default async function Page() {
  await requireActiveUser();
  return <AiSettingsPage />;
}
```

- [ ] **Step 3: Add sidebar item**

Add `{ href: "/ai-settings", mode: "aiSettings" }` or a separate non-dashboard nav item. If `DashboardMode` cannot be widened cleanly, use explicit labels to avoid breaking task dashboard logic.

Requirements:
- visible to all active users
- not visible in preview mode unless a separate preview page is built
- not inside admin-only link
- `/admin/assistant` untouched

- [ ] **Step 4: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 5: Native Host Status And Local Usage Summary Contract

**Files:**
- Modify browser-assistant files listed in Task 0 file map.

- [ ] **Step 1: Add failing bridge tests**

Add tests for:
- `status` includes `bridgeSchemaVersion`.
- `status` does not include `configPath`, absolute path, username, raw stderr, env values.
- `usage-summary` is rejected when range is not `30d`, `90d`, or `all`.
- only one usage scan can run at a time.
- scan result never includes `prompt`, `answer`, `transcript`, `rawLog`, `path`, `fileName`.

- [ ] **Step 2: Extend contract**

Use page command names:

```ts
type PageCommand = "status" | "generate" | "usage-summary" | "select-region" | "verify-official-law";
```

Native request types:

```ts
{ type: "status"; requestId: string }
{ type: "capabilities"; requestId: string }
{ type: "generate"; requestId: string; payload: AssistantRuntimeInput }
{ type: "usageSummary"; requestId: string; range: "30d" | "90d" | "all"; maxSessions: number; includeServiceEstimate: boolean }
```

- [ ] **Step 3: Implement sanitized status**

Status DTO:

```ts
{
  bridgeSchemaVersion: 2;
  reachable: boolean;
  available: boolean;
  mode: "local-chatgpt-codex";
  codexCliFound: boolean;
  codexSignedIn: "signed-in" | "not-signed-in" | "unknown";
  codexVersion?: string;
  checkedAt: string;
  errorCode?: "native_host_unavailable" | "codex_cli_missing" | "codex_status_timeout" | "unsupported_version";
  reason?: string;
}
```

Do not return command path, config path, stderr, env, username, or filesystem path.

- [ ] **Step 4: Implement lazy local usage scan**

Scan rules:
- root fixed to local Codex sessions directory resolved internally
- no caller path
- no symlink/reparse traversal
- per-file byte limit
- total byte limit
- session count limit
- absolute deadline
- no raw text returned
- cancellation or controlled terminal state
- partial result with warnings

Return:

```ts
{
  bridgeSchemaVersion: 2;
  range: "30d" | "90d" | "all";
  scannedSessionCount: number;
  skippedSessionCount: number;
  estimatedServiceRunOverlapCount: number;
  confidence: "high" | "medium" | "low";
  buckets: Array<{ date: string; inputTokens: number; outputTokens: number; totalTokens: number; localDirectConfidence: "direct" | "uncertain" }>;
  warnings: Array<{ code: string; label: string }>;
  checkedAt: string;
}
```

- [ ] **Step 5: Verify**

Run in browser-assistant worktree:

```powershell
npm run typecheck
npm run test
npm run build
node scripts/ai-settings-bridge-privacy-validate.mjs
```

Expected: all pass.

## Task 6: AI Settings Page Client, Lazy Local Scan, And Cache

**Files:**
- Create: `src/components/ai-settings/ai-settings-page.tsx`
- Create: `src/components/ai-settings/ai-settings-client.ts`
- Create: `src/components/ai-settings/ai-settings-page.module.css`

- [ ] **Step 1: Add client contract assertions**

Validator checks:

```ts
assert.match(clientSource, /sessionStorage/);
assert.match(clientSource, /usage-summary/);
assert.doesNotMatch(clientSource, /fetch\([^)]*usage-summary/);
assert.doesNotMatch(clientSource, /sendBeacon|telemetry|audit|error log/i);
assert.match(pageSource, /aria-live/);
```

- [ ] **Step 2: Fetch initial data without native dependency**

Initial load must run:

```ts
Promise.all([
  fetch("/api/preferences/ai-settings", { cache: "no-store" }),
  fetch("/api/assistant/usage/me?range=30d&granularity=day", { cache: "no-store" }),
]);
```

Then run bridge `status` asynchronously with a 3-5 second timeout. Do not block first paint on bridge status.

- [ ] **Step 3: Implement explicit local usage toggle**

Before toggle:
- show `아직 스캔 안 함`, not zero usage.
- no native usage scan request.
- no local usage chart layer.

After toggle:
- call `window.postMessage` page bridge command `usage-summary`.
- cache sanitized result in memory and `sessionStorage` for 5-10 minutes.
- never send local scan result to SaaS.

- [ ] **Step 4: Implement settings save states**

States:
- clean
- dirty
- saving
- saved
- failed with rollback
- reverted

Controls:
- model select/input constrained by sanitizer
- reasoning effort segmented/select
- service tier segmented/select
- timeout select/stepper
- default local range select: 30d, 90d, full

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 7: Usage Aggregation And Visualization

**Files:**
- Create: `src/components/ai-settings/usage-aggregation.ts`
- Create: `src/components/ai-settings/usage-chart.tsx`
- Modify: `src/components/ai-settings/ai-settings-page.tsx`
- Modify: `src/components/ai-settings/ai-settings-page.module.css`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add failing formula assertions**

Validator or small unit-like script should assert:

```ts
assert.equal(metrics.serviceTotal, 300);
assert.equal(metrics.localDirectEstimate, 120);
assert.equal(metrics.combinedEstimate, 420);
assert.equal(metrics.uncertainLocal, 80);
```

with fixture buckets:

```ts
service = [{ totalTokens: 300 }];
local = [
  { totalTokens: 120, layer: "local-direct" },
  { totalTokens: 80, layer: "uncertain" },
];
```

- [ ] **Step 2: Add semantic theme roles**

Add CSS variables under each `[data-theme="..."]`:

```css
--ai-usage-service: var(--theme-accent);
--ai-usage-local: ...;
--ai-usage-overlap: var(--theme-warn);
--ai-usage-neutral: var(--theme-text-muted);
--ai-status-ok: ...;
--ai-status-warning: var(--theme-warn);
--ai-status-error: var(--theme-warn);
--ai-surface-page: var(--theme-page-bg);
--ai-surface-panel: var(--theme-surface-panel-strong);
--ai-surface-elevated: var(--theme-surface-soft-strong);
--ai-chart-plot: var(--theme-surface-soft);
--ai-border-soft: var(--theme-border-subtle);
--ai-shadow-panel: var(--theme-shadow-soft);
--ai-focus-ring: var(--theme-accent-focus-ring);
```

Use variables only in page CSS; do not hard-code chart colors in components.

- [ ] **Step 3: Build chart**

Use SVG stacked bars with:
- visible legend
- direct value labels for KPI totals
- keyboard-focusable bucket groups
- `aria-label`/text summary
- data table fallback below chart
- fixed chart height
- no hover-only information

- [ ] **Step 4: Layout**

Implement:
- top title and range/granularity controls
- status strip
- personal defaults panel
- primary wide stacked usage chart
- KPI panels
- secondary daily bars
- workflow breakdown panel
- bottom warnings strip
- mobile order: status, settings, KPI totals, primary chart, local toggle, table/details

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 8: Apply Personal Defaults To Local Codex Runs

**Files:**
- Modify: `src/components/tasks/task-assistant-panel.tsx`
- Modify browser-assistant bridge files from Task 5.
- Modify: `src/repositories/assistant/contracts.ts`
- Modify: `src/repositories/assistant/postgres-store.ts`
- Modify: `src/repositories/assistant/local-store.ts`

- [ ] **Step 1: Add failing assertions**

Validator checks:

```ts
assert.match(taskAssistantSource, /\/api\/preferences\/ai-settings/);
assert.match(taskAssistantSource, /codexOptions/);
assert.match(taskAssistantSource, /createLocalCodexUsageEvent|\/api\/assistant\/usage/);
assert.doesNotMatch(taskAssistantSource, /~\/\.codex\/config\.toml|config\.toml/);
```

- [ ] **Step 2: Load settings before local generation**

Fetch personal defaults when local mode is selected. If fetch fails, fall back to current default local behavior.

Bridge payload:

```ts
codexOptions: {
  model: preference.aiDefaultModel,
  reasoningEffort: preference.aiReasoningEffort,
  serviceTier: preference.aiServiceTier,
  timeoutMs: preference.aiRequestTimeoutMs,
  architectRunId,
}
```

Do not insert `architectRunId` into prompt text. Pass it only through metadata if the bridge supports it; otherwise omit.

- [ ] **Step 3: Create local-codex service usage event**

After local generation returns, call a SaaS API that records metadata-only usage for this service-run:

```ts
{
  assistantRecordId: savedRecord.id,
  taskId: savedRecord.taskId,
  executionMode: "local-chatgpt-codex",
  runtimeMode: "extension-native-bridge-in-page",
  provider: "local-codex",
  model,
  inputTokens,
  outputTokens,
  status: "success",
  metadata: {
    workflow: "daily-ai-review",
    architectRunId,
    usageAvailable,
    bridgeSchemaVersion
  }
}
```

If tokens are unavailable, store zero token counts with `usageAvailable: false`. Do not store prompt, answer, evidence, transcript, or local session id.

- [ ] **Step 4: Verify**

Run:

```powershell
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
```

Expected: pass.

## Task 9: Automated Validation Suite

**Files:**
- Create/modify: `scripts/ai-settings-contract-validate.ts`
- Create/modify browser-assistant privacy validator/tests.

- [ ] **Step 1: Validate access boundaries**

Assertions must cover:
- `/ai-settings` page uses `requireActiveUser`.
- pending/disabled denied by page and APIs.
- admin does not see cross-user data.
- `/admin/assistant` page still uses admin-only guard.

- [ ] **Step 2: Validate privacy**

Assertions must fail if any of these appear in usage API DTO projection or local scan SaaS request path:

```text
question
answer
evidence
conversationMemory
threadMessages
prompt
transcript
rawLog
configPath
OPENAI_API_KEY
CODEX
```

Use targeted regexes so legitimate type names do not cause noisy failures.

- [ ] **Step 3: Validate visualization formulas**

Test:
- service total exact
- local direct estimate
- uncertain local separate
- combined = service exact + local direct only
- not scanned vs zero usage distinct

- [ ] **Step 4: Run broad checks**

SaaS:

```powershell
npm run db:generate
npx tsx scripts/ai-settings-contract-validate.ts
npm run typecheck
npm run lint
npm run build
```

Browser assistant:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
node scripts/ai-settings-bridge-privacy-validate.mjs
```

## Task 10: Browser Verification

**Files:**
- No source edits unless verification finds a bug.

- [ ] **Step 1: Start local app**

Run in SaaS worktree:

```powershell
npm run dev
```

Open exact local route:

```text
http://localhost:3000/ai-settings
```

- [ ] **Step 2: Verify initial render performance intent**

Use browser devtools or Playwright timing:
- first visible page content renders before native status resolves
- no native `usage-summary` command before local usage toggle
- no SaaS request body/query contains local scan summary

- [ ] **Step 3: Verify desktop/tablet/mobile**

Viewports:
- 1440x900
- 1024x768
- 390x844

States:
- active normal user
- admin user sees only own data
- pending/disabled redirect or 403
- native host unreachable
- old bridge unsupported
- local scan not run
- confirmed zero usage
- partial local scan
- local scan cancelled
- local scan limit reached
- dark/alternate theme if available
- reduced motion
- keyboard-only navigation

- [ ] **Step 4: Verify visual/data semantics**

Confirm:
- chart labels are visible without hover
- service/local/uncertain have separate legend entries
- uncertainty uses label/pattern/dashed treatment, not color alone
- combined estimate excludes uncertain local entries
- table fallback matches chart buckets
- no overlapping text at mobile width
- `/admin/assistant` remains policy/admin focused

## Task 11: Final Review, Commit Readiness, And Preliminary Edit Outcome

**Files:**
- All touched files.

- [ ] **Step 1: Check worktrees**

Run:

```powershell
git -C D:\architect-workspace\architect-saas-ai-settings-worktree status --short --branch
git -C D:\architect-workspace\architect-browser-assistant-ai-settings-worktree status --short --branch
git -C D:\architect-workspace\architect-browser-assistant diff -- src/runtime/ArchitectLocalAssistantRuntime.ts src/content/content-script.ts
```

- [ ] **Step 2: Verify accidental preliminary edits outcome**

Report one of:

```text
Outcome A: Superseded by worktree implementation. Original dirty preliminary edits should be discarded after user approval because they contain privacy-incompatible status fields.
Outcome B: Fully incorporated after rewrite. Original dirty preliminary edits are obsolete duplicates and should be discarded after merge.
Outcome C: Not incorporated because bridge contract changed. Original dirty preliminary edits should be reverted after explicit approval.
```

Expected for current diff: Outcome A or B, not silent leave.

- [ ] **Step 3: Run final verification**

Run all commands from Task 9 and browser checks from Task 10.

- [ ] **Step 4: Commit only after user asks**

Do not push, merge, or delete worktrees without explicit approval.

Suggested commits after implementation:

```powershell
git add prisma src scripts
git commit -m "feat: add personal AI settings page"
```

For browser assistant:

```powershell
git add src native-host scripts
git commit -m "feat: add local Codex usage bridge"
```

## Self-Review

### Spec Coverage

- `/admin/assistant` remains policy-only: Tasks 4, 9, 10.
- `/ai-settings` active-only and visible to all active users: Tasks 2, 4, 9.
- Admin self-only behavior: Tasks 2, 3, 9, 10.
- `profile_preferences` personal global settings: Tasks 1, 2.
- No token/prompt/session/transcript/raw log storage or SaaS transmission: Tasks 3, 5, 6, 8, 9.
- Local full usage lazy scan only after toggle: Tasks 5, 6, 10.
- Browser memory/sessionStorage only for local scan: Task 6.
- Combined usage formula avoids duplicates: Task 7.
- First render without native host dependency: Tasks 6, 10.
- Default 30d and advanced 90d/full scan: Tasks 1, 5, 6.
- Theme semantic roles, no hard-coded chart colors: Task 7.
- Preliminary edits reviewed and handled: Task 0, Task 11.

### Placeholder Scan

This plan intentionally avoids placeholder markers, unbounded "add tests" steps, and unspecified implementation areas. Every task names concrete files, commands, and expected behavior.

### Type Consistency

Use `AiSettingsPreference`, `aiReasoningEffort`, `aiServiceTier`, `aiRequestTimeoutMs`, and `aiLocalUsageDefaultRangeDays` consistently across schema, repository, API, and UI. Use `usage-summary` for page bridge command and `usageSummary` for native host request type.

## Execution Handoff

Plan complete and saved to `D:\architect-workspace\architect-saas-ai-settings-worktree\docs\superpowers\plans\2026-06-05-ai-settings-local-codex-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (recommended): dispatch a fresh subagent per task, review between tasks, fastest for the two-repo scope.
2. Inline Execution: execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each task group.

Implementation must not start until the user approves one option.
