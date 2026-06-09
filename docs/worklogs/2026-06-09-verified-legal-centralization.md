# Verified Legal Centralization Worklog

Date: 2026-06-09 KST

## Request

Correct AI review legal verification to the centralized `verified-legal-evidence-api` architecture.

- `LAW_OPEN_DATA_OC` belongs only in `verified-legal-evidence-api`.
- `architect-saas` must not require, store, or directly use `LAW_OPEN_DATA_OC`.
- SaaS uses `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` for server-to-server legal evidence.
- Browser/client code must not expose legal API keys or server secrets.
- Keep `projectContextChunks` and `legalEvidence` separate.
- Do not bypass or auto-approve WIKI approval from `/api/assistant/task-review`.

## Harness / Multi-Agent

- Mode: Harness Engineering Strict.
- `choi`: coordinator and integration owner.
- `hy`: read-only SaaS dependency/boundary audit.
- `ung`: read-only verified API contract audit.
- `ul`: final boundary and validation review role.

Subagent findings were integrated into the patch:

- `hy` found the remaining Local Codex `verify-official-law` bridge fallback and stale `legalEvidence` snapshot risk.
- `ung` confirmed `/api/legal/search` and `/api/evidence/bundle` already exist, require `x-verified-legal-evidence-api-secret`, and do not need a new endpoint for this correction.

## Architecture Result

`architect-saas` now treats `verified-legal-evidence-api` as the single server-to-server legal evidence provider.

- Query-time legal evidence uses the verified legal search path.
- Latest bundle/source filtering remains available through the verified evidence bundle path.
- SaaS task-review no longer imports or calls a direct official-law verifier.
- Local Codex/browser generation no longer falls back to a `verify-official-law` client bridge.
- Legal/regulation tasks without answer-ready verified legal evidence block with a centralized verified API readiness reason.
- Nonlegal tasks are not blocked solely because legal API integration is unavailable.

## Modified Files

- `.env.example`
- `src/domains/legal/legal-verification-intent.ts`
- `src/domains/legal/official-law-api.ts` deleted from SaaS
- `src/domains/assistant/task-review.ts`
- `src/domains/assistant/legal-manual-smoke-report.ts`
- `src/components/tasks/task-assistant-panel.tsx`
- `src/use-cases/task-review-service.ts`
- `src/use-cases/assistant-saas-mode-service.ts`
- `src/use-cases/assistant-service.ts`
- `src/use-cases/verified-legal-search-service.ts`
- `src/use-cases/legal-batch-audit-service.ts`
- `scripts/ai-review-readiness-validate.ts`
- `scripts/task-review-orchestrator-validate.ts`
- `scripts/legal-search-adapter-validate.ts`
- `scripts/assistant-thread-memory-validate.ts`
- `scripts/legal-manual-smoke-report-validate.ts`
- `docs/superpowers/plans/2026-06-09-verified-legal-centralization-plan.md`
- `docs/superpowers/plans/2026-06-09-ai-review-full-pass-plan.md`
- `docs/runbooks/ai-review-service-readiness.md`
- `docs/worklogs/2026-06-09-ai-review-full-pass.md`
- `docs/worklogs/2026-06-09-verified-legal-centralization.md`

## Verified API Contract

Existing contract is sufficient for this correction.

- `POST /api/legal/search`
  - Auth: `x-verified-legal-evidence-api-secret`, checked against `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
  - Input: `query`, optional `jurisdiction`, optional `effectiveDate`, optional `limit`.
  - Output: legal query id, hits, warnings, optional graph expansion.
  - Failure: 400 invalid/missing query, 403 missing/bad secret, 409 missing/malformed legal corpus artifacts, 500 internal.
- `POST /api/evidence/bundle`
  - Auth: same header/secret.
  - Input: optional `sourceIds`.
  - Output: latest `EvidenceBundle`, filtered by `sourceIds` when supplied.
  - Failure: 400 invalid JSON/body too large, 403 missing/bad secret, 409 missing bundle artifact, 500 internal.

No new endpoint was implemented. `verified-legal-evidence-api/docs/implementation-plan.md` still has stale question-aware bundle wording and should be cleaned up on a verified API docs branch if needed.

## Validation

### architect-saas

- `npm run ai-review:readiness`: PASS, status `ready`.
  - `DATABASE_URL`: pass.
  - `LAW_OPEN_DATA_OC`: pass because absent from SaaS.
  - `VERIFIED_LEGAL_EVIDENCE_API_URL`: pass, configured in local SaaS runtime env.
  - `VERIFIED_LEGAL_EVIDENCE_API_SECRET`: pass, configured in local SaaS runtime env.
  - Optional source/search policy settings: pass when missing.
- `npm run task-review:validate`: PASS.
- `npm run project-context:validate`: PASS.
- `npm run legal-search:validate`: PASS, `legal-search-adapter-pass`, cases 72.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS, with Git CRLF normalization warnings only.
- Secret scan over added diff lines: PASS after excluding known test fixture/validator assertion literals.

### verified-legal-evidence-api

- `npm run smoke:legal:preflight`: PASS, status `ready`.
- `npm run test:legal-search-api`: PASS, cases 30.
- `npm run test:legal-source-registry`: PASS.
- `npm run test:legal-credential-policy`: PASS.

## Remaining Blockers

- No local AI review readiness blocker remains after configuring the SaaS runtime with the centralized verified API URL and secret.
- Deployment readiness still depends on the deployed SaaS runtime having non-loopback verified API URL/secret values.
- Do not add `LAW_OPEN_DATA_OC` to `architect-saas`.
- No DB migration, Vercel env change, alias change, production data write, push, or merge was performed during the centralization patch itself.

## Secret Handling

- No secret values were printed or written.
- Env reporting was limited to variable names, status, and URL/contract shape.
- `LAW_OPEN_DATA_OC` remains a verified API credential, not a SaaS credential.
- Local SaaS runtime env stores only the centralized verified API URL/secret needed for server-to-server integration; it does not store `LAW_OPEN_DATA_OC`.
