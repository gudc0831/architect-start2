# 2026-04-03 Task Status Chip Palette Refresh

## User request

- Update task status chip colors to make status distinctions clearer.
- Apply the new palette across task status chips and related task status indicators.
- Make the focus-area chips visually stronger when selected so clicked states are immediately obvious.

## Implementation summary

- Added shared task-status color tokens in [src/app/globals.css](/D:/architect%20-%20start2/src/app/globals.css) for `new`, `in_review`, `in_discussion`, `blocked`, `done`, and focus-only `overdue`.
- Refreshed `status-pill` styling so task status chips use the new orange, blue, navy, yellow, and grayscale palette with matching borders and selection rings.
- Updated table row status rails to use the darker accent tone for each status while preserving existing overdue and done-row behaviors.
- Refactored [src/components/tasks/task-focus-strip.tsx](/D:/architect%20-%20start2/src/components/tasks/task-focus-strip.tsx) from generic `tone` styling to explicit `appearance` styling.
- Updated [src/components/tasks/task-workspace.tsx](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx) so board and daily focus chips use status-aware appearances for `in_review`, `in_discussion`, `blocked`, and `overdue`.
- Strengthened focus-chip active styling so selected chips render with a darker background, stronger border/ring, and higher-contrast text in both default and compact variants.

## Verification

- `npm run typecheck`
  - result: failed because unrelated untracked sources under `tmp-gstack-install-check/` are included by the repo TypeScript glob and reference missing Bun/Playwright dependencies.
- targeted app-only typecheck via temporary tsconfig including `src/**/*.ts(x)` and `next-env.d.ts`
  - result: passed
- Browser UI verification against the running local app on `http://127.0.0.1:3000`
  - verified board view default state
  - verified board focus chip active state after clicking `검토중`
  - verified daily view compact focus strip default state
  - verified daily compact focus chip active state after clicking `기한 지남`
  - verification artifacts were cleaned up after inspection

## Visual findings

- Status chips now read as:
  - `신규`: orange
  - `검토중`: blue
  - `협의중`: navy
  - `보류`: yellow
  - `완료`: grayscale
- Focus chips are visibly darker and more saturated when selected.
- `보류` and `기한 지남` are visually distinct in the compact focus strip.
- Daily view showed an existing console error on `GET /api/projects` returning `503`; this did not block rendering of the updated chips and appears unrelated to the palette change.

## Changed files

- [src/app/globals.css](/D:/architect%20-%20start2/src/app/globals.css)
- [src/components/tasks/task-focus-strip.tsx](/D:/architect%20-%20start2/src/components/tasks/task-focus-strip.tsx)
- [src/components/tasks/task-workspace.tsx](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

## Remaining risks

- The repo-wide `npm run typecheck` remains noisy until `tmp-gstack-install-check/` is removed or excluded from the project TypeScript scope.
