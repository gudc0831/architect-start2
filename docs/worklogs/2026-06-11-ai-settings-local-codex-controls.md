# 2026-06-11 - AI Settings Local Codex Controls

Req: Implement `/ai-settings` Local Codex controls for no-history execution, model dropdown refresh, catalog status microcopy, and preserve admin-only SaaS API activation.

Diff:
- Added `aiLocalCodexNoHistory` profile preference and migration `202606110001_add_ai_settings_local_codex_controls`.
- Added Local Codex default-model handling, with existing saved custom values preserved in the dropdown. This was superseded below by the Windows Codex model catalog follow-up.
- Replaced the model text input on `/ai-settings` with a model dropdown, refresh button, catalog source/CLI/timestamp status, and `Local Codex 기록 저장 안 함` option.
- Passed `noHistory` through Local Codex AI review generation.
- Added Browser Assistant `model-catalog` bridge command and native-host catalog response.
- Added native-host `--ephemeral` execution when `noHistory` is true.
- Preserved omission of explicit `gpt-5-codex` and `codex-default` model flags so Codex CLI can choose the account-compatible default.
- Added contract/test coverage for model catalog, default alias omission, no-history sanitization, and admin-only SaaS API boundary.

Verify:
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts` passed.
- SaaS: `npm run db:generate` passed.
- SaaS: `npm run typecheck` passed.
- SaaS: `npm run build` passed and included `/ai-settings` and `/api/preferences/ai-settings`.
- SaaS: `npm run worklog:check` passed.
- SaaS: `git diff --check` passed.
- Browser Assistant: `npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts` passed.
- Browser Assistant: `node --test native-host/codex-bridge-host.node-test.mjs` passed.
- Browser Assistant: `npm run release:check` passed with local-dev/production-promotion warnings only.
- Browser Assistant: `git diff --check` passed.
- UI: Playwright opened `http://127.0.0.1:3000/ai-settings` and confirmed the model dropdown/refresh button, fallback catalog status text, `Local Codex 기록 저장 안 함`, and no normal-user SaaS API activation control.

Boundary:
- `--ephemeral` reduces new Local Codex session persistence; it does not delete existing local Codex sessions or guarantee provider-side retention policy.
- SaaS API Mode activation remains an admin policy action under existing admin routes and is not exposed from `/ai-settings`.

## Follow-up: Windows Codex Model Catalog

Req: Make `/ai-settings` model selection match the Windows Codex app model presentation and deploy the preview.

Diff:
- Changed the personal Local Codex default model id from legacy aliases (`gpt-5-codex` / `codex-default`) to `gpt-5.5`.
- Added a Prisma migration to set the `ai_default_model` default to `gpt-5.5` and rewrite legacy saved profile values to `gpt-5.5`.
- Added a shared Windows Codex model option list: `GPT-5.5`, `GPT-5.4`, `GPT-5.4-Mini`, `GPT-5.3-Codex-Spark`.
- Updated `/ai-settings` fallback model catalog so the dropdown displays Windows Codex labels while saving/executing model ids.
- Merged known Windows Codex options into bridge-provided catalogs so older installed Browser Assistant bridges that still return legacy aliases do not hide the app-style model list.
- Split model value and label sanitization so future Windows Codex display names can include display-safe spacing.
- Extracted the model catalog normalizer into a pure module and added a stale-bridge fixture to validate that `codex-default` / `gpt-5-codex` collapse to `GPT-5.5` while preserving the Windows Codex model list.
- Updated Local Codex usage fallback model metadata to use the same default model id.
- Updated Browser Assistant native host model catalog to prefer `codex debug models`, map `slug` to `value` and `display_name` to `label`, filter to `visibility: "list"`, and fall back to the known Windows Codex catalog when the CLI catalog is unavailable.
- Preserved admin-only SaaS API activation boundary and Local Codex no-history behavior.
- Hid the personal `Service tier` control and force personal AI settings to the automatic API processing tier, because this is not a meaningful user-facing Local Codex setting.
- Renamed `Timeout` to `요청 제한 시간`, replaced the raw millisecond input with second-based options, and added explanatory copy for the Local Codex/bridge wait limit.

Harness:
- `hy` read-only pass reviewed the SaaS `/ai-settings` model value/label contract, sanitizer split, and focused validation path.
- `ung` read-only pass reviewed the Browser Assistant native bridge contract, confirmed `codex debug models` as the authoritative CLI catalog source, and flagged the need to use `visibility: "list"` plus fallback source metadata.

Verify:
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts` passed.
- SaaS: `npm run db:generate` passed.
- SaaS: `npm run typecheck` passed.
- SaaS: `npm run build` passed and included `/ai-settings` and `/api/preferences/ai-settings`.
- SaaS: `npm run worklog:check` passed.
- SaaS: `git diff --check` passed.
- SaaS Preview: `npm run data:backup` created local snapshot `local-2026-06-11T06-57-29-400Z-430fcd49` and cloud backup `cloud-2026-06-11T06-57-30-803Z-aea341cd`.
- SaaS Preview: `npm run db:migrate:safe` applied `202606110002_use_windows_codex_model_catalog_defaults`.
- SaaS Preview: `npm run deploy:migration-gate` passed with `Database schema is up to date!`.
- SaaS Preview: `npm run vercel-build` passed with Preview env loaded from branch `codex/multi-user-transition`.
- SaaS compatibility refresh: `npx tsx scripts/ai-settings-contract-validate.ts`, `npm run typecheck`, `npm run build`, `npm run worklog:check`, `git diff --check`, Preview `deploy:migration-gate`, and Preview `vercel-build` passed after adding stale-bridge legacy-alias normalization.
- Browser Assistant: `npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts` passed.
- Browser Assistant: `node --test native-host/codex-bridge-host.node-test.mjs` passed.
- Browser Assistant: `npm run release:check` passed with local-dev/production-promotion warnings only.

## Follow-up: Personal Settings Simplification and Preview Prep (2026-06-12)

Req: Commit the current `/ai-settings` follow-up, deploy it to Preview, and leave verification evidence.

Diff:
- Forced personal AI settings writes through `aiServiceTier: "auto"` and updated preference sanitization so stale client values cannot keep `priority`.
- Removed the personal `Service tier` selector from `/ai-settings`.
- Renamed `Timeout` to `요청 제한 시간`, switched the control to second-based options, and added Local Codex/bridge wait-limit helper copy.
- Kept admin usage report metrics under an explicit summary section and only shows the Local Codex connection setup hint when diagnostics fail.
- Adjusted the materials page neutral controls/background styling that was already in the pending diff.

Verify:
- Workspace repo inventory: `architect-browser-assistant`, `architect-saas`, and `verified-legal-evidence-api` were fetched and all matched their upstream refs before this commit; only `architect-saas` had pending file changes.
- SaaS: `git diff --check` passed.
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts` passed.
- SaaS: `npm run worklog:check` passed.
- SaaS: `npm run typecheck` passed.
- SaaS: `npm run lint` passed.
- SaaS: `npm run build` passed and included `/ai-settings` plus `/api/preferences/ai-settings`.
- Vercel: `with-ascii-host npx vercel whoami` authenticated as `gudc083111-4864`.
- Vercel: `with-ascii-host npx vercel ls architect-start2 --scope chois-projects-7b2948cf` listed existing Ready Preview deployments before the new deployment.
