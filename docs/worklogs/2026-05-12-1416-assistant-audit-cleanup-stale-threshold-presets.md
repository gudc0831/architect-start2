Req: Implement and verify Slice 41 assistant audit cleanup stale-threshold presets.
Diff: Added 0/7/30 stale-days preset buttons to cleanup review filters and documented the read-only threshold preset workflow.
Why: Cleanup governance reviewers need common stale alert windows without typing numeric thresholds during review.
Verify/Time: 2026-05-12 14:16 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified 0/7/30 stale-day presets and 30-day preset set the stale-days field to `30`; console showed React DevTools/HMR/Fast Refresh logs only.
