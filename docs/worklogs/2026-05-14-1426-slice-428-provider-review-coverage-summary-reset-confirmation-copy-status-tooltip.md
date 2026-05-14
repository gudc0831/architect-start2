Req: Implement Slice 428 provider execution package review coverage summary reset confirmation copy status tooltip.
Diff: Added a derived title tooltip to the reset confirmation copy status chip and documented it in the user guide.
Why: Reviewers need quick context for pending and copied reset-confirmation handoff states without changing copy or reset behavior.
Verify/Time: 2026-05-14 14:29 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI copy-status tooltip checks passed.
