Req: Implement and verify Slice 36 assistant audit cleanup coverage filter presets.
Diff: Added a cleanup coverage preset query parameter to cleanup review summary/coverage/export/package APIs, added an Admin UI coverage preset selector, and documented the read-only preset workflow in `사용자 가이드.md`.
Why: Admin reviewers need one-step switching between all cleanup runs, reviewed cleanup runs, and stale unreviewed cleanup runs during monthly governance review.
Verify/Time: 2026-05-12 13:44 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; coverage preset API/JSON/package endpoints verified; Browser UI verified `Coverage preset` selector and `Stale unreviewed` state with console showing React DevTools/HMR/Fast Refresh logs only.
