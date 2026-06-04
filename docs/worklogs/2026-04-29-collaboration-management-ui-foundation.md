Req: Continue Step 7 collaboration management UX for manager/admin workflows.
Diff: opened `/admin` to active project users, kept admin-only global controls gated, added project role-aware member editing controls, added invitation create/revoke UI, added access request review UI, and let managers review pending general requests into their project.
Why: project managers need a UI path for viewer/editor invitations and approvals without granting global admin access, while viewer/editor users should only see read-only member context.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run deps:audit`, `npm run worklog:check`, and `git diff --check` passed on 2026-04-29.
