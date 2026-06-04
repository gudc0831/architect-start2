Req: Start the RLS and Storage policy boundary slice after PR required checks became clean.
Diff: added a preview-only RLS/Storage policy SQL draft, documented the rollout and probe plan, and added a Postgres file project index for policy/query support.
Why: the app guard baseline is verified, but release readiness still requires database and Storage policy enforcement for browser-facing paths.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run deps:audit`, `npx prisma validate`, and local Semgrep `p/default` passed on 2026-04-24; preview policy application is intentionally gated on user approval.
