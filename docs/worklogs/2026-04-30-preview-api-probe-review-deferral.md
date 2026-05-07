Req: Record the current branch review findings as deferred work and do not implement the fixes in this turn.
Diff: Added this follow-up worklog noting three deferred items: add a production safety guard to `scripts/preview-collaboration-api-probe.ts`, wrap probe task/lease cleanup in `try/finally`, and reword `docs/2026-04-30-collaboration-preview-verification-checklist.md` so the API probe does not claim `/auth/callback` or `/auth/post-login` coverage.
Why: The user explicitly chose to ignore the review findings for now, but the next worker needs the risks preserved before continuing Preview verification or production-readiness work.
Verify/Time: No code or plan behavior changed; documentation-only handoff entry added after checking current branch status / 2026-04-30 KST.
