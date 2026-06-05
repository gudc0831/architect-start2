# 2026-06-05 AI Settings Review Fixes

## Request

- Fix verified review findings across the AI settings SaaS worktree and browser-assistant worktree.
- Use multi-agent review and `harness-engineering`.
- Leave a worklog before merge validation.

## Harness

- Mode: Strict
- Coordinator: parent Codex thread
- Worker agent: `019e9731-ae61-76a0-8df3-4240fda3f599` for browser-assistant native bridge fixes
- Review agent: `019e9738-3cd1-70e1-9614-4b64ea51a2e9` for read-only final diff review
- Follow-up review agent: `019e973b-c0fa-7e92-9323-1328f5794d68` for cache TTL regression review

## Fixes

- Moved SaaS local Codex `codexOptions` to the top-level page bridge request so personal model, reasoning effort, service tier, and timeout settings reach the extension contract.
- Hardened `/api/assistant/usage/me` POST so local usage events require server-owned task and assistant record validation, profile matching, local execution mode, status normalization, and bounded token counts.
- Changed AI settings local usage cache to require a `{ cachedAt, summary }` envelope and remove legacy or malformed sessionStorage entries instead of returning them indefinitely.
- Split local usage cache read/write into `src/components/ai-settings/local-usage-cache.ts` so the contract validator can execute fresh, expired, legacy, and malformed cache cases with a mock storage implementation.
- Preserved `serviceTier` as a sanitized bridge DTO field while keeping unsupported values out of native Codex CLI args.
- Replaced the undefined `--theme-text-strong` CSS reference with semantic theme variables.
- Added/updated the AI settings contract validator to cover the bridge options, usage trust boundary, cache TTL envelope, and CSS variable regression.

## Accidental Preliminary Edits

- The earlier accidental edits in `D:\architect-workspace\architect-browser-assistant` were reviewed separately before implementation.
- The final accepted bridge behavior was implemented in `D:\architect-workspace\architect-browser-assistant-ai-settings-worktree`.
- The original `D:\architect-workspace\architect-browser-assistant` worktree was left clean.

## Learning

- Failure: personal AI settings could be configured in SaaS but not reliably applied to local Codex generation.
- Cause: the SaaS bridge request nested `codexOptions` inside `input`, while the browser-assistant content script only consumed top-level `request.codexOptions`.
- Fix: top-level `codexOptions` contract plus browser-assistant contract tests.
- Prevention: keep cross-worktree bridge contract assertions in `scripts/ai-settings-contract-validate.ts` and browser-assistant runtime/content/native tests.

- Failure: local usage recording trusted too much client-provided metadata.
- Cause: usage POST accepted task, record, and token fields without enough server-side ownership and bounds checks.
- Fix: server-side task/record/profile/execution-mode validation and token caps.
- Prevention: treat all local bridge usage POSTs as untrusted input even when they come from first-party UI.

- Failure: a final read-only review found legacy sessionStorage entries could bypass the new cache TTL.
- Cause: `readLocalUsageCache` returned unwrapped parsed summaries as a compatibility fallback.
- Fix: remove unwrapped cache entries and return `null`.
- Prevention: cache readers must require timestamped envelopes when TTL behavior is part of the privacy/performance contract.

- Failure: a follow-up review found the cache contract validator only regex-checked for TTL-related strings.
- Cause: cache read/write behavior was private to the React client and not executable from the validator.
- Fix: extracted pure cache helpers and added behavioral assertions for fresh, expired, legacy, and malformed entries.
- Prevention: privacy/performance contracts should be validated with behavior checks, not only source-string checks.

## Verification

- SaaS: `npm run typecheck` passed.
- SaaS: `npm run lint` passed with one existing unrelated warning in `src/components/project-context/project-materials-page.tsx`.
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts` passed.
- SaaS: `npm run build` passed and included `/ai-settings`, `/api/preferences/ai-settings`, and `/api/assistant/usage/me`.
- SaaS: `git diff --check` passed; only Git line-ending warnings were printed.
- SaaS: `npm run worklog:check` passed.
- Browser assistant: `npm run typecheck` passed.
- Browser assistant: `npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts` passed, 10 tests.
- Browser assistant: `node --test native-host/codex-bridge-host.node-test.mjs` passed, 11 tests.
- Browser assistant: `npm run release:check` passed with local-dev and production-promotion warnings only, 0 failures.
- Browser assistant: `git diff --check` passed; only Git line-ending warnings were printed.

## Remaining Risks

- No commit or push was made.
- Browser-assistant production promotion still requires production extension metadata and non-local SaaS origin settings, as reported by `release:check`.
- SaaS lint still has the pre-existing `project-materials-page.tsx` hook dependency warning outside this change scope.
