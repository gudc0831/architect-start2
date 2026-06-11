# 2026-06-11 - AI Settings Local Codex Controls

Req: Implement `/ai-settings` Local Codex controls for no-history execution, model dropdown refresh, catalog status microcopy, and preserve admin-only SaaS API activation.

Diff:
- Added `aiLocalCodexNoHistory` profile preference and migration `202606110001_add_ai_settings_local_codex_controls`.
- Changed default personal Local Codex model to `codex-default`, with existing saved custom values preserved in the dropdown.
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
