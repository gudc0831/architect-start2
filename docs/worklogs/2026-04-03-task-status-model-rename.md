# 2026-04-03 Task Status Model Rename

## User request

- Rename task status model from `waiting | todo | in_progress | blocked | done` to `new | in_review | in_discussion | blocked | done`.
- Update localized labels, defaults, exports, status history, migration, repository normalization, and status-driven UI behavior.
- Keep backward compatibility for legacy `waiting`, `todo`, and `in_progress` inputs.

## Data protection

- Confirmed local backend mode before changes: `APP_BACKEND_MODE=local`.
- Ran `npm run data:doctor` before editing.
- Created local backup before data-model changes: `local-2026-04-03T00-48-57-050Z-6b1e7ba7`.

## Implementation summary

- Added centralized task status constants and normalization helpers in [src/domains/task/status.ts](/D:/architect%20-%20start2/src/domains/task/status.ts).
- Updated task domain typing, service normalization, API defaults, repository read/write normalization, and status history canonicalization to the new canonical codes.
- Updated board/status UI keys, localized labels, preview/demo data, CSS selectors, and export-related copy to the renamed statuses.
- Updated Prisma schema and added migration [prisma/migrations/202604030001_task_status_model_rename/migration.sql](/D:/architect%20-%20start2/prisma/migrations/202604030001_task_status_model_rename/migration.sql) to rename enum values and rewrite `status_history`.
- Updated legacy import flow to normalize old status values into the new canonical model.

## Verification

- `npm run db:generate`
- `npm run typecheck`
- `npm run build`
- `npm run ui-copy:validate`
  Result: validator still fails on pre-existing unrelated hardcoded-copy/protected-identifier issues in admin/project/task UI files; typecheck, lint, and build passed.
- Generated a fresh export from the running local app and verified it:
  - export file: [task-export-fresh.xlsx](/D:/architect%20-%20start2/.playwright-cli/task-export-fresh.xlsx)
  - command: `npm run task-export:verify -- --file ".playwright-cli/task-export-fresh.xlsx" --locale ko`
  - result: `ok`, `sheets=2`, `rows=9`, `locale=ko`

## Changed files

- [prisma/schema.prisma](/D:/architect%20-%20start2/prisma/schema.prisma)
- [prisma/migrations/202604030001_task_status_model_rename/migration.sql](/D:/architect%20-%20start2/prisma/migrations/202604030001_task_status_model_rename/migration.sql)
- [scripts/import-legacy-data.ts](/D:/architect%20-%20start2/scripts/import-legacy-data.ts)
- [scripts/ui-copy-report.ts](/D:/architect%20-%20start2/scripts/ui-copy-report.ts)
- [scripts/ui-copy-validator.ts](/D:/architect%20-%20start2/scripts/ui-copy-validator.ts)
- [src/app/api/tasks/route.ts](/D:/architect%20-%20start2/src/app/api/tasks/route.ts)
- [src/app/globals.css](/D:/architect%20-%20start2/src/app/globals.css)
- [src/components/tasks/task-workspace.tsx](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)
- [src/domains/task/ordering.ts](/D:/architect%20-%20start2/src/domains/task/ordering.ts)
- [src/domains/task/status.ts](/D:/architect%20-%20start2/src/domains/task/status.ts)
- [src/domains/task/types.ts](/D:/architect%20-%20start2/src/domains/task/types.ts)
- [src/lib/preview/demo-data.ts](/D:/architect%20-%20start2/src/lib/preview/demo-data.ts)
- [src/lib/task-category-values.ts](/D:/architect%20-%20start2/src/lib/task-category-values.ts)
- [src/lib/ui-copy/catalog.ts](/D:/architect%20-%20start2/src/lib/ui-copy/catalog.ts)
- [src/lib/ui-copy/index.ts](/D:/architect%20-%20start2/src/lib/ui-copy/index.ts)
- [src/repositories/firestore/store.ts](/D:/architect%20-%20start2/src/repositories/firestore/store.ts)
- [src/repositories/memory/store.ts](/D:/architect%20-%20start2/src/repositories/memory/store.ts)
- [src/repositories/postgres/store.ts](/D:/architect%20-%20start2/src/repositories/postgres/store.ts)
- [src/use-cases/task-service.ts](/D:/architect%20-%20start2/src/use-cases/task-service.ts)
- [docs/UI_COPY_RUN_REPORT.md](/D:/architect%20-%20start2/docs/UI_COPY_RUN_REPORT.md)

## Remaining risks

- `ui-copy:validate` is not fully green because the repo already has unrelated validator failures outside this rename.
- A later ad-hoc `npm run typecheck` rerun picked up an unrelated untracked temp tree at `tmp-gstack-install-check/` and failed on external Bun/Playwright sources outside the app code. The earlier planned verification passed before that temp tree was included.
- I did not manually mutate existing local tasks just to force a live status transition, because this workspace is pointed at real local data; verification relied on type/build/export checks and repository normalization paths instead.
