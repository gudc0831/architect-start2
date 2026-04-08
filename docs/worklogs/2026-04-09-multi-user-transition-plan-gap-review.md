Req: read the multi-user transition plan and identify the under-specified or missing items before revising the document.
Diff: reviewed `docs/2026-04-07-multi-user-transition-plan.md` against current auth, project access, membership, schema, and file upload flows; no implementation changes.
Why: capture the highest-risk planning gaps so the next plan edit can close rollout blockers before code work starts.
Verify/Time: reread the plan with line references and checked `prisma/schema.prisma`, auth routes, project selection/use-case code, membership replacement flow, and file upload/version paths; no tests run | 2026-04-09 KST
