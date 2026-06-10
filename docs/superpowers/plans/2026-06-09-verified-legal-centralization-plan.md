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
- [ ] Production env/readiness/promotion is not done and must pass a separate production release gate.

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
