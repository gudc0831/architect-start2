Req: Implement Slice 426 provider execution package review coverage summary reset explanation tooltip.
Diff: Added a static title tooltip to the reset explanation chip and documented the tooltip in the user guide.
Why: Reviewers need hover/browser-accessible context for the browser-only reset boundary without changing reset behavior.
Verify/Time: 2026-05-14 14:20 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI tooltip checks passed.
