Req: Implement Slice 435-443 provider execution package review coverage summary chip and density tooltips.
Diff: Added static title tooltips to review-needed, stale priority, local-only handoff, filter, count, download status, copy status, filename copy status, and queue density controls; updated the user guide.
Why: Reviewers need browser-accessible context for each local/read-only summary signal without changing provider review data.
Verify/Time: 2026-05-14 16:22 KST; `npm run typecheck`, `npm run lint`, provider review note report validation, `npm run build`, and Playwright desktop/mobile Browser UI tooltip checks passed for Slice 435-443.
