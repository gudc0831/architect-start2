Req: Implement Slice 427 provider execution package review coverage summary reset confirmation copied-at tooltip.
Diff: Added a derived title tooltip to the reset confirmation copied-at chip and documented it in the user guide.
Why: Reviewers need quick context for pending and copied-at local handoff states without changing reset or copy behavior.
Verify/Time: 2026-05-14 14:25 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI copied-at tooltip checks passed.
