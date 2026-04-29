Req: Continue collaboration expansion Step 10 with authoritative task-field edit leases.
Diff: Added `edit_leases` Prisma model/migration, acquire/release API, and task-list inline edit lease acquisition/release wiring.
Why: Active editing conflicts should be prevented at field/cell edit entry without blocking task viewing, selection, or unrelated fields.
Verify/Time: `npm run db:generate`; `npx prisma validate`; `npm run typecheck`; `npm run lint`; `npm run build`; `npm run deps:audit`; `git diff --check` / 2026-04-29 KST.
