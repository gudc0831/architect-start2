Req: Implement and verify Slice 393 provider execution package review coverage group summary Markdown download.
Diff: Added `Download group summary` to download the same provider execution package coverage summary Markdown shown in the preview; updated `사용자 가이드.md`.
Why: Reviewers need a local Markdown artifact for grouped coverage summary handoff without adding server persistence.
Verify/Time: Passed 2026-05-14 11:27 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI download validation on desktop/mobile.
