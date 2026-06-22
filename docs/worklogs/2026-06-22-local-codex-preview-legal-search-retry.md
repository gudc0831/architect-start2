# Local Codex Preview Legal Search Retry - 2026-06-22

Mode: Harness Strict.

Request: Fix the deployed Preview `/daily` Local Codex AI review failure and re-verify that evidence, answer generation, and usage recording complete.

## Failure

- In the in-app browser, Local Codex health failed before generation because the browser context had no Architect Browser Assistant content script/native bridge.
- In the actual Chrome profile with Architect Browser Assistant installed, content script and native host checks passed, but task review generation was blocked by centralized official-law verification.
- The UI surfaced `VERIFIED_LEGAL_SEARCH_API_UNREACHABLE`, then blocked answer generation and usage recording.

## Cause

- The task-review server correctly fails closed when legal/regulation evidence is required and the centralized verified legal search does not return answer-ready legal evidence.
- Current Vercel branch env for `architect-start2` includes encrypted branch-scoped `VERIFIED_LEGAL_SEARCH_API_URL`, `VERIFIED_LEGAL_SEARCH_ENABLED`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`.
- The verified legal API Preview is protected and R2-backed. Its `/api/legal/search` route loads the active search index into function memory and reuses a warm cache.
- The SaaS adapter previously used a single 5s request attempt. A cold protected Preview/R2 search abort or transient 5xx surfaced as `UNREACHABLE`, which blocked generation before any assistant record or usage row could be created.

## Fix

- Added bounded retry to `src/use-cases/verified-legal-search-service.ts`:
  - default timeout is now 8000 ms,
  - default attempts are 2,
  - retry applies only to network/abort failures and HTTP 408, 425, 429, 500, 502, 503, 504,
  - auth/protection failures such as 401/403 are not retried.
- Documented optional server-only knobs in `.env.example`:
  - `VERIFIED_LEGAL_SEARCH_TIMEOUT_MS`
  - `VERIFIED_LEGAL_SEARCH_MAX_ATTEMPTS`
- Added regression coverage to `scripts/legal-search-adapter-validate.ts` for transient network recovery, transient 503 recovery, and non-retry of 403.

## Evidence

- Pre-fix regression failure: `npm run legal-search:validate` failed with `AssertionError: 1 !== 2` for the transient network retry case.
- Post-fix `npm run legal-search:validate`: `{"status":"legal-search-adapter-pass","cases":75}`.
- Post-fix `npm run task-review:validate`: `status: passed`.
- Post-fix `npm run typecheck`: passed.
- Post-fix `npm run build`: passed.
- `npm run ai-review:readiness` against local `.env.preview.local` remains blocked because that local file lacks `VERIFIED_LEGAL_SEARCH_API_URL`; this is local-env drift. Read-only Vercel env inventory shows the deployed branch Preview has the encrypted branch-scoped search env names.

## Prevention

- Treat Local Codex bridge readiness and official-law verification readiness as separate gates during Preview verification.
- For protected R2-backed verified legal Preview, do not sign off from a single cold request. Either prove the route warm or keep bounded retry enabled in the SaaS server-to-server adapter.
- Do not add `LAW_OPEN_DATA_OC`, R2 credentials, or verified legal secrets to browser code or worklogs.

