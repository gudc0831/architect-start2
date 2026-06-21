# AI-settings Local Codex Design

> **For agentic workers:** This is a design/specification document, not an implementation plan. Do not implement from this document directly. After user review, write a separate `docs/superpowers/plans/...` implementation plan and execute that plan task-by-task.

**Status:** Recommended approach approved by the user on 2026-06-05.

**Feature name:** `AI-settings`

**Primary route:** `/ai-settings`

**Audience:** Every active SaaS user, not only admins.

---

## Goal

Add an `AI-settings` area where each user can see and manage their own Local Codex usage and default AI execution options for Architect SaaS workflows.

The page must make the service's AI usage transparent without turning `/admin/assistant` into a mixed-purpose page. `/admin/assistant` remains dedicated to SaaS API management and policy.

---

## User Decisions

- Use a new `AI-settings` entry, exposed to all active users.
- Keep `/admin/assistant` as SaaS API management and policy only.
- Store settings as each user's personal global preferences, not project-level settings.
- Use SaaS DB data for fast, accurate service-run usage.
- Use local Codex history only as an optional, transient estimate for "this PC's full local Codex usage."
- Prioritize fast loading over exhaustive usage accounting.
- Default local usage scan range: recent 30 days.
- Offer advanced local ranges: 90 days and full scan.
- Avoid storing full local usage summaries, prompts, answers, session logs, local auth tokens, or Codex secrets in SaaS DB.

---

## Non-Goals

- Do not edit `~/.codex/config.toml` from SaaS.
- Do not expose admin-only API cost policy controls to normal users.
- Do not merge Local Codex configuration into `/admin/assistant`.
- Do not store raw local Codex prompts, responses, session files, or detailed transcript content in SaaS.
- Do not make page initial render depend on native host availability.
- Do not promise exact total usage for all local Codex activity. The local PC view is an estimate unless native-host records can be reliably matched.

---

## Skill Routing

Required skills and how they apply:

- `harness-engineering`: Use Strict mode. Keep plan-first discipline, avoid unauthorized code/deploy/DB changes, and preserve evidence-backed execution.
- `superpowers:brainstorming`: This document captures the approved design before implementation.
- `grill-me`: User-facing unresolved choices were narrowed one at a time before approval.
- `find-skills`: Relevant supporting skills were identified before planning.
- `frontend-design`: Applies during implementation for the actual page layout and interaction quality.
- `build-web-data-visualization:data-visualization`: Applies during implementation for stacked usage charts and clear visual semantics.
- `superpowers:writing-plans`: Use only after this spec is reviewed and approved, to create the implementation plan.

---

## Information Architecture

### Navigation

Add a normal user navigation entry:

- Label: `AI-settings`
- Route: `/ai-settings`
- Visibility: all active users
- Admin separation: `/admin/assistant` remains visible only where current admin rules allow it

Implementation requirement:

- The sidebar entry must live outside admin-only and project-manager-only navigation blocks.
- The route must not be mixed with preview/admin fallback routes.
- Pending, disabled, or otherwise non-active users must not see or use the page.

### Page Sections

1. **Personal AI Defaults**

   Shows and edits the user's global defaults for Architect SaaS AI runs:

   - default model
   - reasoning effort
   - service tier
   - request timeout or conservative runtime limit, if supported by the bridge contract
   - fallback behavior for unavailable Local Codex, if already supported by the product

   These are personal execution defaults only. They must not override `/admin/assistant` SaaS API policy, provider allowlists, tenant budgets, or admin-controlled safety limits.

2. **Local Codex Status**

   Shows local runtime status without blocking the page:

   - signed in / not signed in / unknown
   - Codex CLI found / not found
   - native host reachable / unreachable
   - detected CLI version, if cheaply available
   - last checked time
   - retry check action

3. **This Service's Codex Usage**

   Uses SaaS DB records for Architect SaaS AI runs:

   - daily AI review usage
   - project review usage, if tracked
   - other Architect SaaS Local Codex runs, if tracked
   - model/reasoning/service tier used per run, where available

   This section is the accurate and fast default.

4. **This PC's Local Codex Usage**

   Hidden behind an explicit toggle.

   When enabled, the browser asks the native host to scan local Codex session summaries. The result is shown as a local-only estimate and is not saved to SaaS DB.

5. **Combined View**

   Optional visual comparison for the same date range:

   - service usage from SaaS DB
   - local direct usage estimate from this PC
   - possible overlap/duplicate indicator

   The combined number must be labeled as a convenience view, not as billing-grade accounting.

---

## Data Model

### SaaS Preferences

Extend `profile_preferences` with AI default settings, or add a closely related one-to-one preference table if schema shape makes that cleaner.

Recommended fields on `profile_preferences`:

- `aiDefaultModel`: string enum, default from current Local Codex default
- `aiReasoningEffort`: string enum, default from current Local Codex default
- `aiServiceTier`: string enum, default from current Local Codex default
- `aiRequestTimeoutMs`: integer, bounded by a conservative minimum and maximum
- `aiLocalUsageDefaultRangeDays`: enum-like integer, default `30`
- `aiSettingsUpdatedAt`: only if useful beyond existing `updatedAt`

The concrete field names should follow existing Prisma and repository naming conventions when implementing.

Implementation requirement:

- Define final field names, TypeScript types, defaults, nullable behavior, and sanitizer allowlists before writing the migration.
- Extend the same contract through `ProfilePreference`, `PreferenceRepository`, Postgres preference store, local preference store, and `preference-service`.
- Unsupported model/reasoning/service-tier combinations must be rejected or downgraded by a sanitizer before persistence.
- Local repository parity is required so preview/local backend modes do not behave differently.

### Usage Records

Service-run usage should be read from existing assistant/task AI review records where possible. If current records do not contain enough detail, add minimal metadata to future records:

- user/profile id
- source workflow, for example `daily-ai-review`
- execution mode, for example `local-codex`
- model
- reasoning effort
- service tier
- started at / completed at
- input/output/total token counts, if the bridge can supply them
- native run id or `architectRunId` for local dedupe
- status and error class, without raw prompt or answer text

The implementation plan must decide the authoritative source for service usage:

- Option A: create explicit metadata-only usage events for Local Codex service runs
- Option B: aggregate from assistant record metadata after adding the missing metadata fields

Either way, `/api/assistant/usage/me` must return sanitized aggregates, not raw assistant records. Allowed fields are date buckets, workflow/source, execution mode, model/options, status/error class, and token counts. Raw `question`, `answer`, `evidence`, `conversationMemory`, thread messages, local transcripts, and file-evidence text must be excluded at the projection layer.

### Local Usage Summary

Local full usage scan result is transient:

- keep in browser memory and optionally `sessionStorage`
- cache for 5-10 minutes
- never write the full local summary to SaaS DB
- never send the local scan result to SaaS through request body, query string, telemetry, audit logs, error logs, or combined-usage save calls
- never send raw local prompt/answer/session body to SaaS
- compute combined service/local views in browser memory only

---

## Native Host Contract

The page should use the browser assistant/native host bridge already used by Local Codex execution.

Bridge compatibility requirements:

- Add a `bridgeSchemaVersion` to status/capability responses.
- Gate new commands through explicit capability negotiation.
- Keep `codex.usageSummary` separate from existing generation commands.
- Enforce a command allowlist in the page bridge, content script/background layer, and native host.
- Validate input and output DTOs at each bridge boundary.
- Return an unsupported-version error for old extensions/native hosts instead of attempting the scan.
- Keep old bridge fallback states user-visible but non-blocking.

Recommended additional commands:

- `codex.status`
- `codex.usageSummary`

### `codex.status`

Purpose: short timeout health check.

Input:

- no sensitive data
- optional request id

Output:

- `reachable`
- `codexCliFound`
- `codexSignedIn`, if cheaply and safely detectable
- `codexVersion`, if cheaply available
- `checkedAt`
- sanitized error code

Status privacy rules:

- Sign-in detection must use a cheap, non-mutating probe only.
- Do not return raw stderr, env values, absolute executable paths, usernames, or full local filesystem paths to the page.
- Return enum-like error codes plus short labels.

Timeout:

- 3-5 seconds
- failure must not block the page

### `codex.usageSummary`

Purpose: scan local Codex session metadata only after explicit user action.

Input:

- range: `30d`, `90d`, or `all`
- maximum file/session count
- include/exclude service-run estimate flag
- no caller-supplied filesystem path

Output:

- date buckets
- input/output/total token counts where found
- scanned session count
- skipped session count
- estimated service-run overlap count
- confidence level
- sanitized warnings

Privacy rule:

- The native host scans only usage/token-count lines or structured token fields.
- The native host must not return raw prompts, messages, answers, command transcripts, or session text.
- The allowed scan root is fixed to the local Codex session directory.
- Symlink/reparse-point traversal is forbidden.
- Per-file byte limit, total byte limit, session count limit, and absolute deadline are required.
- Absolute paths, usernames, and session file names must not be returned.
- Only one local usage scan may run at a time.
- Scan cancellation must be supported or represented as a controlled terminal state.

---

## Usage Calculation

### Service Usage

The default view uses SaaS DB records and is treated as the accurate source for usage created inside Architect SaaS.

This covers workflows such as:

- `/daily` AI review
- project review
- future Architect SaaS assistant actions that run through the service bridge

### Local Direct Usage

The local full usage scan is a PC-local estimate.

Default behavior:

- recent 30 days
- scan only after explicit toggle
- speed-first scan with limits
- skip slow or malformed files
- return partial result with warning when needed

Advanced behavior:

- recent 90 days
- full scan
- full scan should be clearly marked as potentially slower

### Duplicate Avoidance

Risk: a Local Codex run started by Architect SaaS may also be present in the user's Codex app/session history. If service usage and local usage are naively added, the same usage can be counted twice.

Recommended dedupe strategy:

1. **Future runs**

   Attach an opaque `architectRunId` to Local Codex runs where the bridge contract allows metadata. Persist the same id in the SaaS assistant usage record or usage event.

   The id must be a UUID/HMAC-style opaque identifier, not a raw DB record id. If the CLI/native channel does not support safe metadata, do not insert the id into prompts, session text, or user-visible content.

2. **Existing local logs**

   Estimate service-origin runs using:

   - working directory
   - command/source marker, if present
   - time proximity to SaaS assistant records
   - model and token count similarity, if available

3. **Display rule**

   - Service usage: exact, from SaaS DB.
   - Local direct usage: estimate, excluding confidently matched service-origin local entries.
   - Ambiguous local entries: keep visible but mark as possibly overlapping.
   - Combined usage: `service exact + confidently local-direct`.
   - Ambiguous local entries are not silently added to the combined total; show them as a separate uncertain layer or note.
   - Combined usage is approximate unless all local entries are confidently deduped.

UI note when needed:

> Local Codex usage may include runs started by this service when older local records cannot be matched exactly.

---

## Loading And Performance

Initial page load must not wait for local Codex.

Performance targets:

- First page render: within 1 second without native host response.
- SaaS preference load: normal app API query only.
- SaaS service usage graph: fast DB-backed aggregate query.
- Local status check: async with 3-5 second timeout.
- Local full usage scan: lazy loaded only after explicit toggle.
- Local usage cache: 5-10 minutes in memory or `sessionStorage`.
- Default scan: recent 30 days and bounded session/file count.
- Full scan: advanced option only, with slower-state UI.
- Only one local usage scan can run at a time.
- A local scan must expose cancel or controlled stop behavior.

Failure handling:

- Native host unreachable: show `응답 없음` and retry action.
- Codex CLI missing: show installation/status guidance already consistent with existing local assistant UX.
- Login unknown: show `확인 불가`, not a blocking error.
- Slow scan: return partial results and skipped count.
- Malformed session files: skip and count, never crash the page.
- Old extension/native host unsupported: show upgrade/reload guidance and keep the page usable.
- Permission denied: show a sanitized permission-denied state.
- Scan cancelled: show cancelled state without clearing the last successful cached result unless the user requests refresh.
- Scan limit reached or response too large: show partial result with limit reason.
- Retry local scan only after user action.

---

## UX And Visualization

The user-approved visual direction is a soft, polished usage-dashboard layout similar to a modern "Usage Overview" analytics card:

- bright surface
- soft shadows
- light borders
- rounded chart panels
- large usage overview chart
- compact KPI panels
- segmented period control
- simple icon accents
- clean donut/bar/line chart composition

This visual direction should be integrated with the existing SaaS theme system. Colors must be theme-driven, not hard-coded to the blue example.

### Visual Design Contract

Layout:

- use an unframed page canvas with framed content panels
- avoid a marketing hero
- avoid decorative gradient/orb backgrounds
- keep the main content above the fold focused on status, settings, and usage
- use chart cards only for real chart/KPI modules
- avoid cards nested inside cards
- keep border radius moderate and consistent with the existing SaaS UI

Top region:

- left: page title `AI-settings`
- right: date range selector
- below: segmented period control such as `D / W / M / Y` or app-native equivalents
- compact Local Codex status strip with `로그인`, `CLI`, `Native host`, and `마지막 확인`

Control semantics:

- Date range selector defines the queried time window.
- `D / W / M / Y` defines aggregation granularity, not a second date range.
- Unsupported combinations should be disabled or normalized visibly.
- The selected range/granularity must drive both KPI totals and chart buckets consistently.

Main grid:

- primary wide panel: service/local usage trend
- side KPI panels:
  - service usage total
  - local direct usage estimate
  - average daily tokens
  - overlap/uncertain count
- secondary wide panel: per-day usage bars
- secondary side panel: usage breakdown donut or compact stacked composition
- bottom insight/status strip for warnings such as duplicate risk, skipped local sessions, or stale local status

Responsive layout:

- Desktop: two-column analytical grid with the primary chart wider than KPI/breakdown panels.
- Tablet: primary chart first, KPI panels in a two-column grid, secondary charts below.
- Mobile portrait: status strip, settings summary, KPI totals, primary chart, local toggle, secondary details.
- Disable sticky side sections on mobile.
- Maintain stable chart heights so loading labels, legends, and axis labels do not resize panels.
- Preserve the distinction between "not scanned yet" and "0 usage" on every breakpoint.

Settings area:

- personal AI defaults should sit near the top or in a sticky side section when space allows
- model/reasoning/service tier controls should use compact selects or segmented controls
- advanced scan options should be collapsed by default
- local full usage toggle should be explicit and visually separate from the default SaaS usage graph
- show dirty, saving, saved, failed, and reverted states
- provide save/cancel behavior or app-consistent optimistic-save behavior with rollback
- validate unsupported model/reasoning/service-tier combinations inline
- show local scan progress, cancel, retry, and partial-result states

### Theme Color Rules

Use semantic roles that each theme can remap:

- `aiUsageService`: accurate Architect SaaS usage from DB
- `aiUsageLocal`: estimated local direct Codex usage
- `aiUsageOverlap`: possible duplicate or uncertain usage
- `aiUsageNeutral`: grid lines, inactive bars, secondary labels
- `aiStatusOk`: reachable/signed in/healthy
- `aiStatusWarning`: partial, estimated, stale, skipped
- `aiStatusError`: unreachable, failed, missing
- `aiSurfacePage`: page background
- `aiSurfacePanel`: chart/KPI panel background
- `aiSurfaceElevated`: raised control or selected segment background
- `aiChartPlot`: chart plot background
- `aiBorderSoft`: panel and chart border
- `aiShadowPanel`: soft dashboard panel elevation
- `aiFocusRing`: keyboard focus indicator

In the default light theme, the visual balance can resemble the reference image:

- service usage: primary blue
- local direct estimate: teal or green-blue
- overlap/uncertain: amber with pattern or dashed treatment
- neutral surfaces: white to very light gray
- text: high-contrast near-black
- borders: low-contrast neutral

For other themes, these roles should inherit theme palette values while preserving meaning. Do not use color alone to encode uncertainty; pair the color with labels, patterns, dashed lines, or status badges.

### Chart Contract

Analytical job:

- compare accurate service usage, estimated local direct usage, and possible overlap over time
- show composition without implying billing-grade precision for local estimates

Primary chart:

- stacked bar is the default because it makes service/local/overlap composition easy to compare by day
- stacked area can be used as a secondary trend view only when the data is continuous enough
- line chart can be used for average daily trend or token-rate trend, not as the only usage composition chart

Secondary charts:

- daily usage bar chart for quick range scanning
- donut or compact stacked list for breakdown by workflow/source
- KPI cards for exact totals and estimates

Chart readability:

- show direct values for current totals
- keep legends visible
- use grid lines lightly
- avoid hover-only discovery
- on mobile, preserve the summary numbers before the chart and make chart labels tap/focus friendly

Numeric grammar:

- Do not mix token counts, run counts, and average-per-day values on the same axis.
- Do not mix exact service usage and estimated local usage in one KPI without labeling the estimate.
- Show `overlap/uncertain` as a separate visual layer, not as an invisible subtraction.
- Define each KPI formula in code and tests:
  - service total = SaaS service-run token total
  - local direct estimate = local entries confidently not matched to service runs
  - combined estimate = service total + local direct estimate
  - uncertain local = ambiguous local entries displayed separately
- Keep units visible on every KPI and axis.

### Accessibility And Clarity

- Use clear labels in addition to color.
- Do not rely only on hover tooltips.
- Keep chart legends visible on desktop and mobile.
- Make uncertainty explicit in copy and legends.
- Avoid exposing raw prompts or response content in usage details.
- Support reduced motion.
- Maintain contrast for light and dark themes.
- Check color-deficiency resilience for service/local/overlap roles.
- Provide a text summary for every chart.
- Provide a table view or data-list fallback for chart values.
- Make legends and data points keyboard focusable where interactive.
- Use `aria-live` for status changes such as scan complete, partial result, timeout, and save failure.

---

## Security And Privacy

Rules:

- No Codex/OpenAI/ChatGPT tokens in SaaS DB.
- No local session body, prompts, responses, command transcripts, or raw logs sent to SaaS.
- Local full usage scan result remains client-local and transient.
- SaaS stores only user-selected defaults and service-run metadata.
- Native host responses must be sanitized before crossing into the page bridge.
- All settings writes are scoped to the authenticated user's own profile.
- Admins do not edit another user's personal Local Codex settings through this page unless a separate admin feature is explicitly planned later.

---

## API And Repository Shape

Recommended app-side API shape:

- `GET /api/preferences/ai-settings`
- `PATCH /api/preferences/ai-settings`
- `GET /api/assistant/usage/me`

Access boundary:

- Every route must require an authenticated active user.
- Every preference read/write is scoped to `profileId = currentUser.id`.
- Every personal usage query is scoped to `profileId = currentUser.id`.
- Admin users on `/ai-settings` still see only their own personal settings and personal usage.
- Cross-user, project-wide, or organization-wide usage belongs to a separate admin feature, not this page.

Usage response shape:

- Return bucketed aggregates and KPI totals, not raw event lists.
- Keep any recent-run list metadata-only and bounded.
- Exclude prompt, answer, evidence, transcript, local file path, and raw diagnostic strings.

Repository changes:

- extend existing preference repository rather than creating a disconnected settings path
- add a focused usage query/repository if existing assistant records do not already expose the needed aggregation

The implementation should follow existing route-handler auth and repository patterns.

---

## Error States

Show state-specific messages instead of blocking the page:

- `설정 저장 실패`: preference write failed
- `로컬 Codex 응답 없음`: native host timeout/unreachable
- `Codex CLI 확인 불가`: CLI not found or version command failed
- `로그인 상태 확인 불가`: status check cannot determine sign-in
- `일부 세션 제외됨`: local scan skipped slow/malformed files
- `중복 가능성 있음`: local usage may include service-origin runs
- `아직 스캔 안 함`: local scan has not run and must not be displayed as zero usage
- `사용량 없음`: confirmed zero usage for the selected source/range
- `확장 버전 미지원`: old extension/native host does not support usage summary
- `스캔 취소됨`: user cancelled the local scan
- `스캔 제한 도달`: local scan hit session/byte/deadline limit and returned partial data
- `권한 없음`: current user is not active or is not allowed to access the personal settings page

These messages should be concise and paired with retry or detail disclosure where useful.

---

## Implementation Planning Notes

Task 0 for the future implementation plan:

- Reconcile accidental preliminary edits in `architect-browser-assistant`.
- If they match the final bridge contract, fold them into the planned changes with tests.
- If they do not match the final contract, revert or replace them deliberately.
- Do not silently leave unreviewed bridge-contract changes in place.

Likely implementation tracks:

1. SaaS preference schema/repository/API
2. Navigation and `/ai-settings` page shell
3. Service usage aggregation from SaaS records
4. Native host status command
5. Native host local usage summary command
6. Dedupe and display semantics
7. Visualization and responsive UX
8. Verification and regression tests

Preference application path:

- Load the user's AI defaults before starting a service Local Codex run.
- Apply defaults to `/daily` AI review and future Architect SaaS Local Codex workflows.
- Fall back to existing local-codex defaults when preferences are missing or invalid.
- Pass normalized `codexOptions` through the page bridge only after bridge compatibility is confirmed.
- Verify that personal defaults do not mutate admin policy or local `~/.codex/config.toml`.

---

## Verification Criteria

Before considering the implementation complete:

- `/ai-settings` renders for a normal active user.
- pending/disabled users cannot access `/ai-settings` or the preference/usage APIs.
- `/admin/assistant` remains admin/API-policy focused and unchanged in purpose.
- User can save personal global AI defaults.
- preference read/write is self-only, including for admins.
- Saved defaults are applied to Architect SaaS Local Codex runs without editing `~/.codex/config.toml`.
- Initial page render does not wait for native host.
- Local status check times out cleanly.
- Service usage graph loads from SaaS data.
- `/api/assistant/usage/me` returns bucketed metadata-only aggregates scoped to the current user.
- Local full usage scan runs only after explicit toggle.
- Default local scan uses recent 30 days.
- 90-day and full scan options are available as advanced choices.
- Local scan never returns prompt/answer/session body to SaaS.
- Local scan results are not sent to SaaS through telemetry, audit, error logs, or combined save calls.
- Duplicate/overlap risk is labeled clearly.
- Combined estimate follows `service total + confidently local-direct`; uncertain local entries stay separate.
- Browser verification covers desktop and mobile widths.
- Visual verification covers light/dark or representative themes, desktop/tablet/mobile, empty state, zero state, partial local scan, local scan enabled, keyboard-only use, reduced motion, and color-deficiency resilience.
- Automated tests cover active access, pending/disabled denial, self-only preference read/write, self-only usage aggregation, admin policy non-mutation, local repository parity, bridge unsupported fallback, usage aggregate DTO projection, dedupe formulas, and native-host privacy filtering.

---

## Open Risks

- Existing Local Codex session files may not expose consistent token-count data.
- Older service-origin local runs may be impossible to dedupe exactly.
- Codex sign-in status may not be cheaply detectable without invoking commands that take too long.
- Native host schema changes must stay backward-compatible with installed browser assistant versions.

No unresolved user decision remains for the design phase.
