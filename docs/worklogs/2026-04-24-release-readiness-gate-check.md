Req: Continue release readiness after PR checks and Preview policy/file-flow verification without touching unrelated untracked files.
Diff: added a release sign-off checklist, recorded latest Preview deployment/check/header evidence, and narrowed the active plan to the remaining production dashboard gates.
Why: the remaining blockers are not code changes; they require exact production URL, Vercel Production env, Supabase Auth, and Google OAuth dashboard confirmation before promotion.
Verify/Time: Vercel project/deployment showed `dpl_BYgzqxq6bNbxJqjvnVVZujT14e6X` as `READY`; latest PR head `024128a` checks and Vercel status were success; Preview `/login` returned `200` with CSP, HSTS, nosniff, frame, referrer, permissions, and noindex headers on 2026-04-24.
