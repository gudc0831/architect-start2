Req: Implement Slice 444-453 provider execution package review coverage queue tooltips.
Diff: Added read-only title tooltips to the grouped queue container, empty state, queue sections, queue counts, row lists, row status, filenames, row chips, stale/latest chip, and focus digest action; updated the user guide.
Why: Reviewers need browser-accessible context for grouped provider execution package review queues without changing provider package state or review notes.
Verify/Time: 2026-05-14 16:28-16:40 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI tooltip assertions passed for Slice 444-453.
