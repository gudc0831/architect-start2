# Operations Deferred Closeout - 2026-06-18

Status: CLOSED AS CONDITIONAL DEFERRED for SaaS legal corpus metadata, restore/rollback operations, and paid/scale expansion. R2 read/runtime/security proof is current.

## R2 Recovery And Runtime Proof

Repo: `D:\architect-workspace\verified-legal-evidence-api`.

Commands and results:
- `npm run backup:recovery:validate`: PASS.
- `node --env-file=.env --import tsx scripts/r2-recovery-report.ts`: PASS.
- `node --env-file=.env --import tsx scripts/r2-runtime-gate.ts`: PASS.
- `node --env-file=.env --import tsx scripts/r2-security-gate.ts`: PASS.

Recovery report evidence:
- Current pointer key: `legal-corpus/current/current.json`.
- Current manifest alias byte-identical: true.
- Current snapshot id: `2026-06-18-full-architecture-law-corpus-local-approved`.
- Source count: `1436`.
- Chunk count: `58660`.
- Sources bytes/SHA verified: `12252937`, `a9777323a160619531320197ead4528254e9046dc779d78e92dac463acb30a54`.
- Chunks bytes/SHA verified: `14079524`, `baf93677484852572415451f090d7a3223a436427ed641bb9ad5fe7bab067c11`.
- Active index bytes/SHA verified: `17408586`, `c53fabeeb8ee1b9bfaf97b03283c292212201d85d31d1724f40815d4a02767ce`.

Runtime gate evidence:
- 3 simulated cold-start instances, 2 warm searches each.
- Query: `건축법 제11조`.
- Max initial load: `1349.2ms`.
- Max manual reload: `1236.6ms`.
- Max heap delta: `212091832` bytes.
- Warm searches did not reread the active-index object.

Security gate evidence:
- Public unauthenticated active-index access denied, status `400`.
- Read-token write denied, status `403`, `verifiedMissing: true`.
- Deletion status: `not_requested`.

## SaaS Backup Boundary

Repo: `D:\architect-workspace\architect-saas`.

Commands and results:
- `npm run data:doctor`: PASS; local guard mode `strict`, backend mode `local`, cloud configured `false`.
- `npm run data:backup`: PASS; local snapshot id `local-2026-06-18T08-30-24-975Z-b9bd574a`, cloud backup id `null`.

No `npm run data:restore` was run. No cloud DB export/restore was run.

## Conditional Deferrals

SaaS legal corpus metadata:
- No `legal_corpus_metadata` table, Prisma schema, migration, repository, route, or UI is required now.
- Continue using R2 `legal-corpus/current/current.json` and verified-legal manifests as source of truth.
- Reopen only when Knowledge Admin active/stale display, SaaS batch audit snapshot queries, multi-instance activation state, or restore/compliance history needs DB-visible metadata.
- Supabase/Postgres must not store full corpus bodies, raw LAW OPEN DATA payload bodies, full active-index artifacts, or historical snapshot bodies.

Restore/rollback:
- R2 current-pointer rollback is a write and still requires explicit target snapshot approval.
- SaaS local restore requires selected local snapshot id and explicit approval.
- Cloud/Production DB restore requires explicit approval, rollback or forward-fix plan, and post-restore validation.
- R2 rollback is not SaaS DB rollback. SaaS DB restore is not R2 corpus rollback.

Paid/scale expansion:
- No paid/scale expansion is implemented now.
- Reopen only with measured pressure from Supabase/R2 quotas, active-index cold-start/reload time, memory, concurrency, retrieval quality, or legal refresh cadence.
- Do not add pgvector, embeddings, D1/Postgres active-index tables, scheduler/Cron, or paid-plan assumptions in this closeout.

No R2 write, current-pointer movement, snapshot deletion, retention change, raw payload archival write, DB migration, restore, Production action, scheduler, or paid-scale change was performed.
