# 2026-06-22 Local Codex review usage closeout

## Summary

- Added Browser Assistant page ready event: `architect:page-local-runtime-ready`.
- Added native host parsing for per-run `codex exec --json` usage metadata.
- Added SaaS Local Codex preflight before retrieval/generation.
- Changed Daily Local Codex usage recording from fire-and-forget to awaited, retryable state.
- Added `requestHash` idempotency for assistant usage events.
- Split `/ai-settings` server usage summary into SaaS API tokens and Local Codex recorded tokens.
- Added usage verifier script and runbook.

## Validation

- Browser Assistant: `npx vitest run src/content/content-script.test.ts`
- Browser Assistant: `node --test native-host/codex-bridge-host.node-test.mjs`
- Browser Assistant: `npm run typecheck`
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts`
- SaaS: `node --check scripts/verify-assistant-usage.mjs`
- SaaS: `npm run typecheck`
- SaaS: `npx prisma validate`

## Notes

The verified local machine state showed the Browser Assistant manifest, native host manifest, native host verifier, and Codex CLI were ready. The failure direction is therefore the active browser page/profile attachment: the current page must have the content script attached and answering before retrieval begins.

## Preview Failure Fix And Final Verification

Request: fix the deployed Preview `/daily` Local Codex AI review failure and verify that evidence retrieval, answer generation, assistant record persistence, and usage recording all pass on the Preview branch without enabling SaaS API generation.

Root causes:

- The Codex in-app browser cannot be the Local Codex execution surface because it does not have the Architect Browser Assistant content script/native bridge. The real verification surface is the installed Chrome extension profile.
- The deployed Preview path then failed before answer generation because centralized verified legal search could surface cold/protected Preview/R2 transient failures as `VERIFIED_LEGAL_SEARCH_API_UNREACHABLE`.
- After retry hardening, health/preflight passed, but generation still failed closed because mapped `verified-legal-search` evidence did not preserve Browser Assistant-compatible top-level official-law metadata. Browser Assistant requires verified regulation evidence to carry metadata such as `verificationStatus`, `checkedAt`, `officialSourceName`, and `apiSourceUrl` before Local Codex generation.

Fixes:

- `src/use-cases/verified-legal-search-service.ts`
  - Added bounded retry for verified legal search.
  - Default timeout is `8000ms`.
  - Default attempts are `2`, capped at `3`.
  - Retries only network/abort failures and HTTP `408`, `425`, `429`, `500`, `502`, `503`, `504`.
  - Does not retry auth/protection failures such as `401` or `403`.
- `.env.example`
  - Documented `VERIFIED_LEGAL_SEARCH_TIMEOUT_MS`.
  - Documented `VERIFIED_LEGAL_SEARCH_MAX_ATTEMPTS`.
- `src/use-cases/verified-legal-search-service.ts`
  - Preserved Browser Assistant-compatible legal evidence metadata in mapped search results:
    - `verificationStatus: "verified"`
    - `officialSourceName: "Verified Legal Evidence API"`
    - `checkedAt`
    - `apiSourceUrl`
    - law/article/effective-date metadata when extractable.
- `scripts/legal-search-adapter-validate.ts`
  - Added regression coverage for transient network recovery, transient `503` recovery, non-retry of `403`, and mapped verified legal metadata.

Commits and deployment:

- `4140d8df72668f0898d26cd592565045bd094860` - `Harden verified legal search retry for preview`.
- `a7c8681c0fc64e7eacacfdedf82801cfc44ca896` - `Preserve verified legal metadata for local Codex`.
- PR `#18` merged to `origin/main` as merge commit `bc8d25cdd489ff11e50e03b4c91476eb6e8b8283`.
- `origin/codex/multi-user-transition` was updated to the same `bc8d25cdd489ff11e50e03b4c91476eb6e8b8283` so the Preview branch follows the integrated content.
- Preview alias:
  - `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`
- Final Ready Preview deployment:
  - `dpl_EhXLhVYgV9djYAFFtmasdRwnyrw8`
  - `https://architect-start2-khu1h4w2q-chois-projects-7b2948cf.vercel.app`
- The alias was explicitly repointed to the final Ready deployment after Vercel initially kept the branch alias on the previous deployment.

Validation:

- `npm run legal-search:validate` passed with `{"status":"legal-search-adapter-pass","cases":75}`.
- `npm run task-review:validate` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run worklog:check` passed.
- `git diff --check` had only pre-existing CRLF warnings.
- Local `npm run ai-review:readiness` against `.env.preview.local` remained blocked because the local env file lacks `VERIFIED_LEGAL_SEARCH_API_URL`; this is local-env drift, not the deployed Preview state. Vercel Preview has the required branch-scoped verified legal env names.

Final browser proof on deployed Preview branch:

- Surface: installed Chrome profile with Architect Browser Assistant extension/native host, not the Codex in-app browser.
- URL: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily`.
- Task: `864`.
- Health check passed:
  - extension content script connection,
  - Native host / Codex CLI,
  - credential boundary,
  - centralized verified legal evidence,
  - answer generation readiness.
- Ran `근거 조회 + 의견 생성`.
- UI completed without failure/error.
- UI showed generated review content, evidence count `11`, legal evidence count `6`, confidence `51%`, and saved status.
- UI showed Local Codex usage recording as reflected:
  - `event 60924718-c5fc-4167-8576-4f8779b24115`.
- Local Codex did not return per-run token metadata, so the usage event was recorded as `0 tokens` with `usageAvailable: false`; the run still counts as a recorded Local Codex usage event.

Cloud DB verification:

- `npm run assistant:verify-record -- --backend-mode cloud --env-file .env.preview.local --execution-mode local-chatgpt-codex --runtime-mode extension-native-bridge-in-page --since-minutes 20 --strict --json --allow-self-signed-db-cert`
  - `ok: true`
  - latest assistant record: `e10b48c9-8e80-49f6-bfe6-751923be0c95`
  - task DB id: `19c372fb-e410-47f7-bc4b-798acd647cb5`
  - confidence: `51`
  - created at: `2026-06-22T03:38:37.502Z`
- `npm run assistant:verify-usage -- --backend-mode cloud --env-file .env.preview.local --execution-mode local-chatgpt-codex --runtime-mode extension-native-bridge-in-page --status success --since-minutes 20 --strict --json --allow-self-signed-db-cert`
  - `ok: true`
  - latest usage event: `60924718-c5fc-4167-8576-4f8779b24115`
  - linked assistant record: `e10b48c9-8e80-49f6-bfe6-751923be0c95`
  - provider: `local-codex`
  - model: `gpt-5.5`
  - status: `success`
  - total tokens: `0`
  - metadata: `workflow=daily-task-panel`, `usageAvailable=false`, `bridgeSchemaVersion=3`

Boundary:

- This closeout does not enable SaaS API generation.
- This closeout does not move Codex credentials, prompt text, raw evidence, cookies, R2 credentials, or verified legal secrets into the worklog or browser code.
- Live Local Codex generation still depends on the user's installed Chrome extension, native host, Codex CLI, and local Codex login.
