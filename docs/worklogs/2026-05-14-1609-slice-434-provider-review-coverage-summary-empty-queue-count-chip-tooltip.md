Req: Implement Slice 434 provider execution package review coverage summary empty queue count chip tooltip.
Diff: Added a static title tooltip to the empty queue count chip and documented it in the user guide.
Why: Reviewers need quick context that the empty queue count is scoped to visible coverage queues under the active filters.
Verify/Time: 2026-05-14 16:14 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI empty-queue tooltip checks passed.
