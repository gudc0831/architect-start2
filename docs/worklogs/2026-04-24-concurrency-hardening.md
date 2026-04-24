Req: harden task numbering, task reorder, and file version creation against concurrent writes.
Diff: added per-project task-number advisory locking, reorder expected-version checks with 409 responses, file group/version uniqueness, and file version conflict handling.
Why: concurrent writes should fail clearly instead of duplicating task numbers, overwriting task order, or creating duplicate file versions.
Verify/Time: `npm run typecheck`, `npx prisma validate`, `npm run lint`, `npm run build`, `npm run deps:audit`; GitHub checks after push.
