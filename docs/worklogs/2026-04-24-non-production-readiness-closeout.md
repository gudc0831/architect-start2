Req: Reflect the current plan state so future work can resume without reopening completed Preview, CI, policy, and UX slices.
Diff: marked non-production readiness complete, documented production promotion as deferred, and recorded that Production Vercel env currently has only `APP_BACKEND_MODE=cloud` with no Supabase/Postgres variables.
Why: the remaining work is production-only dashboard configuration and post-deploy smoke; Preview and PR readiness should not be repeated unless a regression appears.
Verify/Time: planning docs updated from the completed worklogs, latest `dabb052` required-check success, app-visible Preview header smoke on `3199f00`, and user-confirmed Vercel Production env screenshots on 2026-04-24.
