# SaaS Open Items Closeout - 2026-06-18

Status: MACHINE-EXECUTABLE CLOSEOUT COMPLETE. Remaining open items require real Google OAuth provider identities or explicit future restore/Production/scale approvals.

Plan: `D:\architect-workspace\architect-saas\docs\superpowers\plans\2026-06-18-saas-open-items-closeout-plan.md`.

## Current Repo State

- Repo: `D:\architect-workspace\architect-saas`.
- Branch: `codex/multi-user-transition`.
- Final canonical Preview deployment: `dpl_CfpmGz6YZMaCTd9bGfQRab9k1dLE`.
- Canonical Preview alias: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`.

## Closed By Verification

Dependency audit:
- `hono` override updated to `4.12.25`.
- `protobufjs` override updated to `7.6.3`.
- `npm run deps:audit`: PASS, `found 0 vulnerabilities`.

Collaboration Preview machine checks:
- API role/invitation/access probe: PASS.
- Browser daily viewer/editor/no-access acceptance: PASS.
- Two-window CRDT collaboration: PASS after transaction retry fix and redeploy.
- Browser file upload/open/authorization: PASS.
- Route reachability: `/preview/daily` HTTP `200`.

Verified-legal Preview boundary:
- Canonical alias points to Ready Preview deployment `dpl_CfpmGz6YZMaCTd9bGfQRab9k1dLE`.
- Branch-scoped Preview env names include verified-legal URL/secret/bypass names; values remained encrypted and unprinted.
- `LAW_OPEN_DATA_OC` absent from SaaS.
- `ai-review:readiness`, `task-review:validate`, `project-context:validate`, `legal-search:validate`, `legal-batch-audit:validate`: PASS.

R2/backup operational proof:
- `backup:recovery:validate`, `r2-recovery-report`, `r2-runtime-gate`, `r2-security-gate`: PASS.
- Active R2 snapshot: `2026-06-18-full-architecture-law-corpus-local-approved`, `1436` sources, `58660` chunks.
- SaaS `data:doctor`: PASS, local strict backend, cloud configured false.
- SaaS `data:backup`: PASS, local snapshot `local-2026-06-18T08-30-24-975Z-b9bd574a`, cloud backup id `null`.

Local repo gates:
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npx prisma validate`: PASS.
- `node --import tsx scripts/daily-editing-responsiveness-verify.ts`: PASS.
- `node --import tsx scripts/daily-cell-collaboration-verify.ts`: PASS.

## Closed As Conditional Deferred

- SaaS legal corpus metadata table/schema/repository/UI.
- Raw LAW OPEN DATA payload archival.
- R2 retention/deletion policy and current-pointer rollback.
- SaaS local restore, cloud DB export/restore, Production DB restore.
- Paid/scale expansion, pgvector, embeddings, active-index DB tables, scheduler/Cron.

## Still Open

User/provider-owned Preview checks:
- Real Google OAuth provider UI against the canonical Preview alias.
- Unsafe external `next` redirect through the actual Google provider flow.
- Wrong-email, revoked, expired invitation negative checks when those fixtures/accounts are provided.
- Explicit rejected-request audit/history negative case.

Production resume gate:
- Production URL/env/deploy/alias.
- Production Supabase/Postgres/OAuth configuration.
- Production verified-legal API target and secret parity.
- Authenticated Production smoke.
- Browser Assistant Web Store upload, signed native-host installer, and production origin allowlist.

Explicit approval-gated operations:
- Any R2 write/current-pointer movement/restore-current.
- Any SaaS restore or cloud DB export/restore.
- Any Production deploy/env/alias/OAuth action.
- Any scheduler/Cron, pgvector, embedding, or paid-plan expansion.

## Non-Actions

No secret values, cookies, OTP token hashes, auth sessions, DB URLs, signed URLs, OC URLs, authorization headers, or bypass token values were recorded. No Production action was performed. No DB migration/seed/restore was performed. No R2 write, retention, deletion, raw payload archival write, or current-pointer movement was performed.

## Review Status

Subagent review passes completed for dependency remediation and prior closeout slices. Final read-only review flagged direct-upload fallback breadth and live mutation-probe Production guards; both P2 findings were addressed before final redeploy and verification. Remaining P3 risk: file-flow verifier cleanup follows existing app delete semantics and may leave retained storage objects, matching current product behavior but worth tracking if repeated verifier storage residue becomes a concern.
