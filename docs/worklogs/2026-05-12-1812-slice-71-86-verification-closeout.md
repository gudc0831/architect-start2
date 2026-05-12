Req: Verify Slice 71-86 Knowledge admin queue and evidence review changes.
Diff: Recorded batch verification for candidate risk filters, active chips, clear/reveal/sort/density/handoff/totals, evidence priority/source coverage, filters, and guardrails.
Why: The completed Admin WIKI slices need a single verification closeout after incremental implementation commits.
Verify/Time: 2026-05-12 18:12 KST; `npm run typecheck` passed in both repos; `npm run lint` passed in browser and passed in SaaS with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; Playwright verified queue and evidence/guardrail aria regions plus low-confidence, compact, and unsourced interactions.
