Req: Verify Slice 93-96 Knowledge dirty-draft review changes.
Diff: Recorded batch verification for draft dirty-state indicators, reset warning, approval guardrail, and dirty-draft summary copy action.
Why: The completed dirty-draft review slices need a single verification closeout after incremental implementation commits.
Verify/Time: 2026-05-13 08:55 KST; `npm run typecheck` passed in both repos; `npm run lint` passed in browser and passed in SaaS with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; Playwright verified dirty-state/reset/guardrail regions and confirmed editing title updates `Changed 1/6` plus reset warning.
