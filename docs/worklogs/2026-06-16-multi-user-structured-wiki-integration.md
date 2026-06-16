Req: Integrate structured approved WIKI work into `codex/multi-user-transition` Preview branch and keep root-entry/admin UX fixes.
Diff: Fast-forwarded to `df809f89fe713dbca479656383fc2eef3671e8d3`, reapplied root-entry smoke plus admin knowledge hierarchy changes, and preserved the pre-merge dirty state in a local safety stash.
Why: The user was checking the multi-user Preview while structured WIKI had only been deployed from a separate branch.
Verify/Time: `db:generate`, Prisma validate, structured WIKI validators, `typecheck`, `lint`, `build`, and `root-entry:smoke -- --url http://localhost:3000` passed on 2026-06-16.
Deploy Verify: Preview direct URL release smoke passed; public auth pages and `/auth/post-login` now avoid unauthenticated browser 401s so root-entry smoke does not fail on expected login redirects.
