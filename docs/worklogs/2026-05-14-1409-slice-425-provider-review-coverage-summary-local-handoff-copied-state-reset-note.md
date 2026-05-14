Req: Implement Slice 425 provider execution package review coverage summary local handoff copied-state reset note.
Diff: Updated the reset explanation chip and user guide to explicitly include summary copy, filename copy, reset-confirmation copy, copied-at, and download status.
Why: Reviewers need the reset note to match the browser-only state actually cleared by `Reset summary status`.
Verify/Time: 2026-05-14 14:12 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI reset-note checks passed.
