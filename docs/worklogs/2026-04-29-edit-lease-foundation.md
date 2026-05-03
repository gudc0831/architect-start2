Req: Continue collaboration expansion Step 10 with authoritative task-field edit leases.
Diff: Added `edit_leases` Prisma model/migration, acquire/release API, and task-list inline edit lease acquisition/release wiring.
Why: Active editing conflicts should be prevented at field/cell edit entry without blocking task viewing, selection, or unrelated fields.
Verify/Time: `npm run db:generate`; `npx prisma validate`; `npm run typecheck`; `npm run lint`; `npm run build`; `npm run deps:audit`; `git diff --check`; GitHub checks for `1b534c5`; Preview migration `202604290004_add_edit_leases` after backup `cloud-2026-04-29T05-02-00-257Z-f243f4b9`, migration backup `cloud-2026-04-30T00-59-31-077Z-dfe599c9`, and clean `npm run data:doctor` / 2026-04-30 KST.
