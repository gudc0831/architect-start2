# AI-settings Local Codex Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-facing Local Codex privacy and model-selection controls to `/ai-settings` while keeping SaaS API activation/admin policy exclusively under administrator control.

**Architecture:** Treat `/ai-settings` as a personal Local Codex preference surface, not a server AI policy surface. The SaaS page stores only bounded user preferences, asks the installed Browser Assistant bridge for current local model/status metadata, and sends a `noHistory` execution preference to the native host so Local Codex can run with `codex exec --ephemeral` when enabled. Model catalog refresh is bridge-first with a safe fallback catalog because the current Codex CLI help surface exposes no model-list command.

**Tech Stack:** Next.js App Router, React client components, TypeScript preference sanitizers, Prisma/Postgres profile preferences, Chrome MV3 content/background bridge, Node native messaging host, Vitest/Node tests, existing `ai-settings-contract-validate.ts` and Browser Assistant release gates.

---

## Planning Context

- Existing design source: `D:\architect-workspace\architect-saas\docs\superpowers\specs\2026-06-05-ai-settings-local-codex-design.md`.
- Existing implementation plan source: `D:\architect-workspace\architect-saas\docs\superpowers\plans\2026-06-05-ai-settings-local-codex-implementation-plan.md`.
- Existing `/ai-settings` page currently uses a raw text input for `aiDefaultModel`.
- Existing Browser Assistant bridge supports `status`, `usage-summary`, `generate`, and `capabilities`.
- Existing native host calls `codex exec - --json --sandbox read-only --skip-git-repo-check` without `--ephemeral`.
- Existing native host deliberately omits explicit `gpt-5-codex` because this user's ChatGPT-account Codex CLI rejected that explicit model. Preserve that behavior.
- Current Codex CLI help does not expose a model catalog command such as `codex models --json`; therefore refresh must be designed as a bridge metadata refresh now and can later plug into a CLI catalog command if Codex adds one.

## Locked Decisions From User Conversation

1. Add `/ai-settings` option: `Local Codex 기록 저장 안 함`.
2. Add model dropdown plus adjacent refresh button.
3. Add small status copy below model controls:
   - detected Codex CLI version or status, for example `Codex CLI 26.6.11 확인됨`
   - last refreshed timestamp, for example `마지막 갱신: 2026-06-11 14:32`
   - catalog source, for example `목록 출처: Local Codex bridge / fallback catalog`
4. Keep screen value and stored value as close as possible. Use literal model ids as dropdown labels.
5. Use `codex-default` as the explicit stored/displayed sentinel for "let Codex CLI choose its account-compatible default"; the bridge must not forward `codex-default` as `--model`.
6. If a saved model is not in the refreshed catalog, keep it as `사용자 지정 값` rather than deleting or silently changing it.
7. Normal users must not be able to activate SaaS API mode from `/ai-settings`. SaaS API mode remains admin-only under existing `/admin/assistant` policy.
8. Local Codex cannot work when the user's PC lacks the extension/native host/Codex CLI/login. In that state, model selection and test actions should be disabled or clearly marked unavailable.
9. Local Codex prompts include task context and evidence. When no-history is enabled, use Codex ephemeral execution to reduce local session persistence.

## Grill-me Review Answers

- Should `Local Codex 기록 저장 안 함` be default-on?
  - Recommendation: default off for backwards compatibility, but show the privacy implication clearly. Existing users already have history-bearing behavior; a default flip changes diagnostics/usage expectations.
- Should `codex-default` be hidden behind a friendly label?
  - Recommendation: no. The user prefers display value and stored value to match. Show `codex-default` as the value and explain only in helper text.
- Should `/ai-settings` include a SaaS API enable toggle?
  - Recommendation: no. Show read-only policy status only if useful. Activation remains admin-only.
- Should refresh make a billable model call?
  - Recommendation: no. Refresh should be metadata/status only. A separate "현재 모델 테스트" can be added later because it may call the model.
- Should no-history disable local usage scans?
  - Recommendation: no direct disabling in this slice, but label local usage as session-history dependent. If `--ephemeral` is used, future runs may not appear in local history scans.

## File Map

### architect-saas

- Modify: `D:\architect-workspace\architect-saas\prisma\schema.prisma`
  - Add `aiLocalCodexNoHistory` boolean preference.
- Create: `D:\architect-workspace\architect-saas\prisma\migrations\202606110001_add_ai_settings_local_codex_controls\migration.sql`
  - Add `ai_local_codex_no_history boolean not null default false`.
- Modify: `D:\architect-workspace\architect-saas\src\domains\preferences\types.ts`
  - Add `aiLocalCodexNoHistory`, `codex-default`, model sanitizer, and model catalog DTO types if colocated.
- Modify: `D:\architect-workspace\architect-saas\src\app\api\preferences\ai-settings\route.ts`
  - Persist the new preference through existing self-only API.
- Modify: `D:\architect-workspace\architect-saas\src\components\ai-settings\ai-settings-client.tsx`
  - Replace model text input with dropdown.
  - Add refresh button, refresh state, catalog status text, unavailable/failed states, and no-history checkbox/toggle.
- Modify: `D:\architect-workspace\architect-saas\src\components\ai-settings\ai-settings.module.css`
  - Add compact model control row, status microcopy, disabled states, and toggle layout.
- Modify: `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-panel.tsx`
  - Pass no-history preference through `codexOptions` during Local Codex generation.
- Modify: `D:\architect-workspace\architect-saas\scripts\ai-settings-contract-validate.ts`
  - Assert privacy boundary, admin-only SaaS API boundary, new preference, model dropdown, refresh command, and no-history bridge option.
- Optional docs update: `D:\architect-workspace\architect-saas\docs\worklogs\YYYY-MM-DD-ai-settings-local-codex-controls.md`
  - Capture implementation evidence after execution.

### architect-browser-assistant

- Modify: `D:\architect-workspace\architect-browser-assistant\src\runtime\ArchitectLocalAssistantRuntime.ts`
  - Extend `CodexOptions` with `noHistory?: boolean`.
  - Add typed `LocalCodexModelCatalog`.
- Modify: `D:\architect-workspace\architect-browser-assistant\src\runtime\native-bridge-contract.ts`
  - Add `modelCatalog` native request and `architect:local-runtime-model-catalog` extension message.
  - Normalize `codex-default` as omitted model.
- Modify: `D:\architect-workspace\architect-browser-assistant\src\content\content-script.ts`
  - Allow page command `model-catalog`.
- Modify: `D:\architect-workspace\architect-browser-assistant\src\background\service-worker.ts`
  - Route model catalog requests to native host and sanitize response.
- Modify: `D:\architect-workspace\architect-browser-assistant\native-host\codex-bridge-host.mjs`
  - Return model catalog metadata.
  - Add `--ephemeral` to `codex exec` when `codexOptions.noHistory === true`.
  - Preserve existing omission of `gpt-5-codex` and add omission of `codex-default`.
- Modify: `D:\architect-workspace\architect-browser-assistant\native-host\codex-bridge-host.node-test.mjs`
  - Cover model catalog, no-history args, and default model omission.
- Modify: `D:\architect-workspace\architect-browser-assistant\src\content\content-script.test.ts`
  - Cover page command allowlist and invalid payload rejection.
- Modify: `D:\architect-workspace\architect-browser-assistant\src\runtime\local-runtime-client.test.ts`
  - Cover model catalog response handling if client helpers exist.

## Contract Shapes

### SaaS Preference

```ts
export type AiSettingsPreference = {
  aiDefaultModel: string;
  aiReasoningEffort: AiReasoningEffort;
  aiServiceTier: AiServiceTier;
  aiRequestTimeoutMs: number;
  aiLocalUsageDefaultRangeDays: AiLocalUsageRangeDays;
  aiLocalCodexNoHistory: boolean;
};

export const CODEX_DEFAULT_MODEL = "codex-default";
```

### Bridge Model Catalog

```ts
export type LocalCodexModelCatalog = {
  bridgeSchemaVersion: number;
  refreshedAt: string;
  source: "local-codex-bridge" | "fallback-catalog";
  codexCliVersion?: string;
  models: Array<{
    value: string;
    label: string;
    source: "codex-default" | "known-catalog" | "saved-custom";
    available: boolean;
  }>;
  warnings: Array<{
    code: string;
    label: string;
  }>;
};
```

### Page Bridge Command

```ts
type PageLocalRuntimeRequest = {
  type: "architect:page-local-runtime-request";
  requestId: string;
  command: "status" | "usage-summary" | "generate" | "model-catalog" | "select-region" | "verify-official-law";
  input?: unknown;
  codexOptions?: unknown;
};
```

### Native Codex Args

```ts
export function buildCodexExecArgs(codexOptions) {
  const options = normalizeCodexOptions(codexOptions);
  const args = ["exec", "-", "--json", "--sandbox", "read-only", "--skip-git-repo-check"];
  if (options.noHistory) {
    args.push("--ephemeral");
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.reasoningEffort) {
    args.push("-c", `model_reasoning_effort=${options.reasoningEffort}`);
  }
  return args;
}
```

## Task 1: SaaS Preference Schema And Sanitizer

**Files:**
- Modify: `D:\architect-workspace\architect-saas\prisma\schema.prisma`
- Create: `D:\architect-workspace\architect-saas\prisma\migrations\202606110001_add_ai_settings_local_codex_controls\migration.sql`
- Modify: `D:\architect-workspace\architect-saas\src\domains\preferences\types.ts`

- [ ] **Step 1: Add a failing domain assertion to the contract validator**

Add assertions that expect `aiLocalCodexNoHistory`, `codex-default`, and the new migration name.

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: FAIL because the preference field and migration are absent.

- [ ] **Step 2: Add the Prisma field and migration**

Add to `ProfilePreference`:

```prisma
aiLocalCodexNoHistory Boolean @default(false) @map("ai_local_codex_no_history")
```

Migration:

```sql
alter table "profile_preferences"
  add column if not exists "ai_local_codex_no_history" boolean not null default false;
```

- [ ] **Step 3: Extend preference type and sanitizer**

Add the field to `AiSettingsPreference`, default it to `false`, and coerce any non-boolean input to `false`.

- [ ] **Step 4: Verify generated DB types and contract**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npm run db:generate
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: PASS for the updated contract assertions.

## Task 2: Browser Assistant Bridge Catalog And No-History Contract

**Files:**
- Modify: `D:\architect-workspace\architect-browser-assistant\src\runtime\ArchitectLocalAssistantRuntime.ts`
- Modify: `D:\architect-workspace\architect-browser-assistant\src\runtime\native-bridge-contract.ts`
- Modify: `D:\architect-workspace\architect-browser-assistant\src\content\content-script.ts`
- Modify: `D:\architect-workspace\architect-browser-assistant\src\background\service-worker.ts`

- [ ] **Step 1: Write bridge contract tests**

Add tests that prove:

- `model-catalog` is accepted by the page bridge.
- invalid catalog payloads are rejected.
- `codex-default` and `gpt-5-codex` are normalized away before native execution.
- `noHistory: true` survives sanitization.

Run:

```powershell
cd D:\architect-workspace\architect-browser-assistant
npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts
```

Expected: FAIL before implementation.

- [ ] **Step 2: Extend shared runtime types**

Add `noHistory?: boolean` to `CodexOptions` and add `LocalCodexModelCatalog` with the shape defined above.

- [ ] **Step 3: Add native bridge request/response support**

Extend `NativeBridgeRequest` with:

```ts
{
  type: "modelCatalog";
  requestId: string;
  savedModel?: string;
}
```

Extend `NativeBridgeResponse` with:

```ts
modelCatalog?: LocalCodexModelCatalog;
```

- [ ] **Step 4: Route the page command through content and service worker**

Allow `command === "model-catalog"` in `content-script.ts`, map it to `architect:local-runtime-model-catalog`, and route it in `service-worker.ts`.

- [ ] **Step 5: Verify bridge tests**

Run:

```powershell
cd D:\architect-workspace\architect-browser-assistant
npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts
```

Expected: PASS.

## Task 3: Native Host Catalog And Ephemeral Execution

**Files:**
- Modify: `D:\architect-workspace\architect-browser-assistant\native-host\codex-bridge-host.mjs`
- Modify: `D:\architect-workspace\architect-browser-assistant\native-host\codex-bridge-host.node-test.mjs`

- [ ] **Step 1: Add failing native-host tests**

Cover:

- `handleRequest({ type: "modelCatalog" })` returns `codex-default`.
- catalog includes `refreshedAt`, `source`, and `bridgeSchemaVersion`.
- saved unknown model appears as `saved-custom`.
- `buildCodexExecArgs({ noHistory: true })` includes `--ephemeral`.
- `buildCodexExecArgs({ model: "codex-default" })` omits `--model`.

Run:

```powershell
cd D:\architect-workspace\architect-browser-assistant
node --test native-host/codex-bridge-host.node-test.mjs
```

Expected: FAIL before implementation.

- [ ] **Step 2: Implement `buildModelCatalog`**

Return a conservative catalog:

```js
const FALLBACK_MODELS = [
  { value: "codex-default", label: "codex-default", source: "codex-default", available: true },
];
```

If a saved model exists and is not in the catalog, append:

```js
{ value: savedModel, label: savedModel, source: "saved-custom", available: false }
```

- [ ] **Step 3: Detect CLI version when cheap**

Use the existing Codex command path and run `codex --version` with a short timeout. If unavailable, return a warning and omit `codexCliVersion`.

- [ ] **Step 4: Add ephemeral arg handling**

In `buildCodexExecArgs`, add `--ephemeral` when `normalizeCodexOptions` returns `noHistory: true`.

- [ ] **Step 5: Verify native host**

Run:

```powershell
cd D:\architect-workspace\architect-browser-assistant
node --test native-host/codex-bridge-host.node-test.mjs
npm run native-host:self-test
```

Expected: PASS.

## Task 4: `/ai-settings` UI Controls

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\components\ai-settings\ai-settings-client.tsx`
- Modify: `D:\architect-workspace\architect-saas\src\components\ai-settings\ai-settings.module.css`

- [ ] **Step 1: Add UI contract assertions**

In `scripts/ai-settings-contract-validate.ts`, assert the page source contains:

- `model-catalog`
- `aiLocalCodexNoHistory`
- `codex-default`
- no user-facing SaaS API activation toggle

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: FAIL before implementation.

- [ ] **Step 2: Add catalog state**

Add React state:

```ts
const [modelCatalog, setModelCatalog] = useState<LocalCodexModelCatalog | null>(null);
const [modelCatalogState, setModelCatalogState] = useState<LoadState>("idle");
const [modelCatalogMessage, setModelCatalogMessage] = useState("");
```

- [ ] **Step 3: Add refresh action**

Implement `refreshModelCatalog`:

```ts
const data = await requestLocalRuntime<LocalCodexModelCatalog>(
  "model-catalog",
  { savedModel: preference.aiDefaultModel },
  5000,
);
```

On failure, create a fallback catalog with `codex-default` and the current saved value as `saved-custom`.

- [ ] **Step 4: Replace model input with dropdown and refresh button**

Render a compact row:

- select value: `preference.aiDefaultModel || "codex-default"`
- button: `새로고침`
- disabled when local bridge is unavailable and only fallback is present

Use literal values as labels.

- [ ] **Step 5: Add status microcopy**

Render:

```text
Codex CLI <version> 확인됨
마지막 갱신: <localized timestamp>
목록 출처: <source label>
```

If bridge failed:

```text
목록 출처: fallback catalog
Local Codex bridge에서 모델 목록을 읽지 못했습니다.
```

- [ ] **Step 6: Add no-history option**

Add checkbox/toggle label:

```text
Local Codex 기록 저장 안 함
```

Helper copy:

```text
켜면 AI 검토 실행 시 Local Codex를 ephemeral 모드로 호출합니다. 이전/외부 Codex 기록은 삭제하지 않습니다.
```

- [ ] **Step 7: Verify UI source contract**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: PASS.

## Task 5: Local Codex Generation Uses No-History Preference

**Files:**
- Modify: `D:\architect-workspace\architect-saas\src\components\tasks\task-assistant-panel.tsx`
- Modify: `D:\architect-workspace\architect-saas\scripts\ai-settings-contract-validate.ts`

- [ ] **Step 1: Add contract assertion**

Assert Local Codex generation passes:

```ts
noHistory: preference.aiLocalCodexNoHistory
```

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: FAIL before implementation.

- [ ] **Step 2: Extend `codexOptions` in Local Codex generation**

Update:

```ts
const codexOptions = {
  model: preference.aiDefaultModel,
  reasoningEffort: preference.aiReasoningEffort,
  serviceTier: preference.aiServiceTier,
  timeoutMs: preference.aiRequestTimeoutMs,
  noHistory: preference.aiLocalCodexNoHistory,
};
```

- [ ] **Step 3: Verify contract**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx tsx scripts/ai-settings-contract-validate.ts
```

Expected: PASS.

## Task 6: Admin SaaS API Boundary Guard

**Files:**
- Modify: `D:\architect-workspace\architect-saas\scripts\ai-settings-contract-validate.ts`
- Review: `D:\architect-workspace\architect-saas\src\app\admin\assistant`
- Review: `D:\architect-workspace\architect-saas\src\app\api\assistant\policy\route.ts`
- Review: `D:\architect-workspace\architect-saas\docs\assistant-extension-contract.md`

- [ ] **Step 1: Assert `/ai-settings` has no SaaS API activation mutation**

The validator must fail if `/ai-settings` client source contains a policy mutation route such as:

```text
/api/assistant/policy
```

Expected allowed behavior: `/ai-settings` may display Local Codex status and personal defaults only.

- [ ] **Step 2: Confirm admin route remains the policy mutation owner**

Review existing admin policy route and confirm it still requires admin/global admin guards.

- [ ] **Step 3: Add a short contract note**

Update `docs/assistant-extension-contract.md` only if current text lacks this explicit boundary:

```text
Normal users cannot activate SaaS API Mode from /ai-settings. SaaS API Mode activation remains an administrator policy action.
```

## Task 7: Cross-Repo Verification

**Files:**
- Validate repo-wide behavior; no new source files required.

- [ ] **Step 1: Verify Browser Assistant**

Run:

```powershell
cd D:\architect-workspace\architect-browser-assistant
npm run typecheck
npm run lint
npm test
npm run build
npm run native-host:self-test
```

Expected: PASS.

- [ ] **Step 2: Verify architect-saas**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npm run db:generate
npm run typecheck
npm run build
npx tsx scripts/ai-settings-contract-validate.ts
npm run worklog:check
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Manual browser verification on target preview/local URL**

Open `/ai-settings` and verify:

- model dropdown defaults to `codex-default` or the saved value
- refresh button updates timestamp/status
- fallback catalog appears when bridge is unavailable
- `Local Codex 기록 저장 안 함` saves and reloads
- no SaaS API activation control appears for normal user

- [ ] **Step 4: Installed native-host smoke**

After extension rebuild/reload, send an installed native-host framed `generate` request with `noHistory: true` and confirm:

- request returns `ok: true`
- generated command contains `--ephemeral`
- generated command omits `--model` for `codex-default`

## Rollout Notes

- The browser extension must be rebuilt and reloaded for the target SaaS origin before the page can use the new `model-catalog` command.
- Existing saved `gpt-5-codex` preferences should not be force-migrated. The dropdown should show them as saved custom/unavailable until the user chooses `codex-default`.
- `--ephemeral` reduces new Codex session persistence. It does not delete existing local Codex sessions or guarantee provider-side non-retention.
- Local usage scan may show fewer future Local Codex runs when no-history is enabled.
- SaaS API Mode remains managed by `/admin/assistant`; this plan intentionally does not add any normal-user API-mode enablement path.

## Completion Criteria

- `/ai-settings` contains a model dropdown, refresh button, catalog status microcopy, and no-history option.
- Bridge supports `model-catalog`.
- Native host supports `noHistory` through `--ephemeral`.
- `codex-default` is stored/displayed literally and is never forwarded as `--model codex-default`.
- Users without Local Codex see disabled/fallback states rather than an apparently usable model selector.
- Normal users cannot activate SaaS API mode from `/ai-settings`.
- SaaS and Browser Assistant validation gates pass.
