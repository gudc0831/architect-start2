Req: restructure the planning docs so PLAN.md stays high-level and the chosen login/RBAC decisions live in linked detailed docs.
Diff: replace PLAN.md, rewrite docs/2026-04-07-multi-user-transition-plan.md, add docs/2026-04-10-auth-rbac-contract.md.
Why: lock the chosen Google OAuth plus pre-provisioned access plus project-scoped RBAC contract in a Codex-friendly document set before implementation work starts.
Verify/Time: reviewed document structure and cross-links locally; no code tests run | 2026-04-10 KST
