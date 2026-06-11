# Verified Legal Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct AI review legal verification so `architect-saas` treats `verified-legal-evidence-api` as the single server-to-server legal evidence provider, with no `LAW_OPEN_DATA_OC` requirement or direct law.go.kr call in SaaS readiness or task-review paths.

**Architecture:** `LAW_OPEN_DATA_OC` remains only in `verified-legal-evidence-api`. `architect-saas` uses `DATABASE_URL` for SaaS runtime readiness and `VERIFIED_LEGAL_EVIDENCE_API_URL` plus `VERIFIED_LEGAL_EVIDENCE_API_SECRET` for centralized legal evidence integration. Optional policy knobs remain `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, `VERIFIED_LEGAL_SEARCH_API_URL`, and `VERIFIED_LEGAL_SEARCH_ENABLED`. Browser/client surfaces receive no server secret or legal API key.

**Tech Stack:** Next.js/TypeScript SaaS services and validators in `D:/architect-workspace/architect-saas`; TypeScript/Node verified legal evidence API in `D:/architect-workspace/verified-legal-evidence-api`; local npm validators, lint, and typecheck.

---

## Harness Mode

Strict mode.

- `choi`: coordinator, scope owner, integration owner, final report.
- `hy`: read-only SaaS boundary/dependency investigator.
- `ung`: read-only verified API contract investigator.
- `ul`: final read-only review against centralization rules, secret exposure, and validator evidence.

Standing approval covers local investigation, local validators/tests, small requested code/doc edits, and worklog updates. Separate approval is still required before DB migrations, Vercel env/deploy/alias changes, production data writes, git push/merge/tag, dependency installs/upgrades, or secret/auth profile changes.

## 2026-06-11 Release Boundary

The Preview centralization work can be closed without running the Production release plan. Production env changes, Production deployment, alias promotion, production data writes, OAuth production callback changes, Chrome Web Store upload, and native-host signing are deferred.

This plan now separates three states:

- Preview closure: centralized verified legal evidence is wired through SaaS Preview and Browser Assistant proof is recorded on the canonical Preview host.
- Production resume gate: the checklist below must pass before production users are served.
- Deferred production execution: no production release commands should be run as part of the current closeout.

## Current Conflicts To Correct

- `architect-saas` readiness currently treats `LAW_OPEN_DATA_OC` as a required SaaS variable.
- `architect-saas` task-review/assistant paths include direct official-law verification helpers and can read `LAW_OPEN_DATA_OC`.
- Some validators and worklogs describe a hybrid model where SaaS owns direct official law verification. These must be corrected or explicitly superseded by a centralization worklog.
- Historical documents should not be silently rewritten. Current active worklogs and new centralization records should state the corrected architecture and list older conflicting documents.

## 2026-06-10 Preview Runtime Closure

- [x] `verified-legal-evidence-api` remains the owner of legal corpus artifacts, official legal source credentials, legal search, and evidence provenance.
- [x] `architect-saas` uses only server-to-server verified legal env names: `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, and optional `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`.
- [x] `LAW_OPEN_DATA_OC` is absent from the SaaS Preview env and is not required by SaaS validators.
- [x] 2026-06-10 follow-up: `architect-start2` Preview branch `codex/multi-user-transition` was explicitly reconfigured with non-empty `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` values, without adding `LAW_OPEN_DATA_OC` to SaaS or printing secret values.
- [x] 2026-06-10 follow-up redeploy: Preview `https://architect-start2-j6pxbb0gs-chois-projects-7b2948cf.vercel.app`, deployment `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC`, is Ready and `/preview/daily` returns HTTP `200`.
- [x] The deployed SaaS Preview runtime was verified on `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app`, deployment `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`, verified code SHA `5724068f543b1f863f163e15a71434f18018de4c`.
- [x] Runtime task-review completion smoke returned HTTP `200`, retrieve evidence count `8`, and saved assistant record `201` without WIKI approval or WIKI auto-candidate creation.
- [x] Vercel deployment protection is handled server-side with the bypass header and the verified API app secret; no secret values are documented or browser-exposed.
- [x] Source policy was configured through `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`; corpus responsibility did not move into SaaS.
- [x] 2026-06-10 verified API/env repair: the protected verified-legal Preview target `https://verified-legal-evidence-hp5490x70-chois-projects-7b2948cf.vercel.app`, deployment `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`, returned HTTP `200` when called with both the verified API app secret header and the Vercel protection bypass header.
- [x] 2026-06-10 SaaS redeploy after API/env repair: canonical authenticated Preview host `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` resolves to deployment `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`; its in-page AI review health check passed centralized verified legal evidence and answer generation readiness.
- [x] 2026-06-10 Browser Assistant patch preserves the centralized legal boundary: Local Codex generation direct-reverifies only legacy `official-law:` evidence. Centralized `verified-legal-search:` evidence and unverified foundation `regulation` seeds do not trigger extension-side direct law.go.kr calls.
- [x] Browser Assistant production readiness passed for the unsigned interim extension/native-host path: `18 pass, 1 warn, 0 fail` with the observed extension id, release owner, Web Store publisher metadata, stable native-host install root, and explicit unsigned waiver.
- [x] Same-task Browser Assistant/Local Codex saved-record proof is closed on canonical Preview task `117`: assistant record `609f065a-e17c-4f1a-a968-50593832037a` was saved with `executionMode: local-chatgpt-codex`, `runtimeMode: extension-native-bridge-in-page`, and `candidateState: candidate` after the fixed extension bundle was reloaded.
- [ ] Production env/deploy/promotion is not done and must pass a separate release gate before serving production users.

## 2026-06-10 Remaining Centralization Gates

- [ ] Keep the verified-legal Preview project-level secret configuration durable for future redeploys. Immediate runtime proof is complete on `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`, but future deployments must still prove the same `VERIFIED_LEGAL_EVIDENCE_API_SECRET` boundary and Vercel protection bypass configuration before they are used by SaaS.
- [ ] Rerun the authenticated SaaS completion smoke on the canonical alias only after an `ARCHITECT_SMOKE_COOKIE` is intentionally provided to the shell. Do not inspect browser/session stores just to obtain it; current Preview Browser Assistant proof is covered by the Chrome UI and saved-record verifier path.
- [ ] Do not promote to production until the Production resume gate below passes without printing secret values.

## Production Resume Gate

Production release execution may resume only after these items are explicitly satisfied:

- [ ] Production `architect-saas` env shape is confirmed for production-only values: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, Supabase URL/anon/service role values, storage bucket, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
- [ ] `LAW_OPEN_DATA_OC` remains absent from `architect-saas`; official legal-source credentials stay in `verified-legal-evidence-api`.
- [ ] Production `verified-legal-evidence-api` target is deployed or selected, protected, and proven with matching server secret behavior from SaaS server-side calls.
- [ ] Vercel deployment protection and bypass policy are confirmed for production without exposing bypass or app secrets to the browser.
- [ ] Production OAuth/canonical host configuration is exact: app root, `/auth/callback`, Supabase Auth Site URL, Supabase redirect URL, and Google provider redirect URI.
- [ ] Browser Assistant production origin allowlist, Web Store metadata/upload path, signed native-host installer, production install root, and extension id are finalized.
- [ ] Authenticated production smoke proves `/daily`, centralized verified legal task review, Local Codex/native bridge saved records, and WIKI candidate boundary on the production host.

## Verified API Contract Gate

Before changing SaaS to depend on a server-to-server boundary, confirm whether `verified-legal-evidence-api` already exposes a usable contract:

- Endpoint path for evidence bundle retrieval.
- Endpoint path for legal search if used by SaaS search adapter.
- Auth mechanism and required secret header.
- Request input shape: task/query/context/source IDs.
- Response output shape: `legalEvidence`/evidence bundle, readiness, provenance, warnings/errors.
- Failure semantics: missing secret, bad secret, missing official source, no evidence, upstream failure.
- Test scripts and validators proving source registry and credential policy.

If the contract is missing or insufficient, document the minimum endpoint/contract plan first. Do not add `LAW_OPEN_DATA_OC` to SaaS as a workaround.

## Implementation Tasks

- [x] Inventory current SaaS `LAW_OPEN_DATA_OC` and direct law.go.kr dependencies.
  - Use `rg` across `src`, `scripts`, `docs`, and package scripts.
  - Classify each hit as code path, validator, test fixture, historical doc, or active worklog.
  - Acceptance: every active code/validator dependency has an owner task below.

- [x] Confirm verified API centralized contract.
  - Inspect `verified-legal-evidence-api` API server, docs, and npm scripts.
  - Acceptance: report whether existing `/api/evidence/bundle` and/or `/api/legal/search` is sufficient, including auth, input, output, and failure behavior.

- [x] Correct `ai-review:readiness`.
  - SaaS required: `DATABASE_URL`.
  - Legal integration required: `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
  - Optional/policy: `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, `VERIFIED_LEGAL_SEARCH_API_URL`, `VERIFIED_LEGAL_SEARCH_ENABLED`.
  - Remove `LAW_OPEN_DATA_OC` from SaaS required envs.
  - Add a guard that fails or warns clearly if SaaS tries to use `LAW_OPEN_DATA_OC`, without printing values.
  - Acceptance: readiness no longer asks for a law.go.kr key and reports centralized legal API readiness.

- [x] Refactor `/api/assistant/task-review` legal verification boundary.
  - Remove direct official-law API calls from the SaaS task-review path.
  - Use verified API server-to-server evidence/search as the single legal evidence source.
  - Legal/regulation tasks without configured verified API or with verified API failure must be blocked or carry a clear readiness warning.
  - Nonlegal general tasks must not be blocked just because legal API integration is unavailable.
  - Keep WIKI approval untouched: no bypass and no auto-approval in task-review.
  - Acceptance: validator proves task-review does not import/call the direct official law API and preserves legal vs project context separation.

- [x] Preserve `projectContextChunks` and `legalEvidence` separation.
  - Project context remains user/project material.
  - Legal evidence remains verified legal evidence from the centralized API.
  - Acceptance: project-context validator continues to pass and no implementation merges the arrays.

- [x] Correct legal search adapter and validators.
  - SaaS legal search must use verified API URL/secret/search policy only.
  - Remove validator/test assumptions that set or require `LAW_OPEN_DATA_OC` inside SaaS.
  - Check loopback restrictions for verified API URLs where applicable.
  - Acceptance: `task-review:validate`, `legal-search:validate`, and readiness pass under centralized assumptions.

- [x] Correct active runtime proof/worklog language.
  - Add a new worklog under `docs/worklogs/` for this centralization.
  - Update the current AI review full-pass worklog if it says SaaS is waiting for a law.go.kr key.
  - List older conflicting historical docs as superseded rather than silently rewriting all history.
  - Acceptance: worklog states "verified legal API integration pending/verified" instead of "SaaS LAW key pending".

- [x] Run verification.
  - `architect-saas`: `npm run ai-review:readiness`, `npm run task-review:validate`, `npm run project-context:validate`, `npm run legal-search:validate`, `npm run typecheck`, `npm run lint`.
  - `verified-legal-evidence-api`: `npm run smoke:legal:preflight`, `npm run test:legal-search-api`, plus source registry / credential policy validators found during contract inspection.
  - Browser Assistant verifier only if needed by changed surface.
  - Acceptance: all applicable validators pass, or any block is explicit and caused by missing verified API configuration rather than `LAW_OPEN_DATA_OC`.

## Stop Rules

- Stop and report if `architect-saas` still requires `LAW_OPEN_DATA_OC` after the validator changes.
- Stop and report if verified API lacks a required endpoint contract; do not add the law.go.kr key to SaaS.
- Stop and report any conflicting active plan/worklog before overwriting it.
- Do not perform DB migrations, Vercel env/deploy/alias changes, production data writes, dependency installs/upgrades, pushes, merges, or secret/auth changes without separate approval.

## Done Criteria

- `architect-saas` can pass AI review readiness without `LAW_OPEN_DATA_OC`, or it blocks only because centralized verified API URL/secret is missing.
- `LAW_OPEN_DATA_OC` is removed from SaaS required env and active validators.
- SaaS task-review treats `verified-legal-evidence-api` as the single server-to-server legal verification provider.
- Browser/client code does not expose legal API keys or server secrets.
- `projectContextChunks` and `legalEvidence` remain separate.
- WIKI approval is not bypassed or auto-approved by `/api/assistant/task-review`.
- Relevant validators pass and the result is recorded in `docs/worklogs/`.
