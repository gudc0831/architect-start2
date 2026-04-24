Req: Record the completed external protection gate, preview data gate, and expanded preview verification results from the 2026-04-23 guided run.
Diff: updated the post-preview execution plan and preview verification matrix with the active preview host, Project A/B ids, member/no-access profile state, GitHub ruleset status, Vercel preview env scoping, manager positive/negative results, and origin-integrity probe results.
Why: the next worker needs to know which external settings and preview checks are already complete before starting the policy-boundary slice or fixing merge-readiness checks.
Verify/Time: user-confirmed GitHub ruleset, Vercel preview env scoping, redeploy on `codex/multi-user-transition` / `cde0929`, Supabase SQL results, and browser/API preview checks on 2026-04-23.
