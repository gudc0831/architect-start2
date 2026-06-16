Req: Integrate structured approved WIKI work into `codex/multi-user-transition` Preview branch and keep root-entry/admin UX fixes.
Diff: Fast-forwarded to `df809f89fe713dbca479656383fc2eef3671e8d3`, reapplied root-entry smoke plus admin knowledge hierarchy changes, and preserved the pre-merge dirty state in a local safety stash.
Why: The user was checking the multi-user Preview while structured WIKI had only been deployed from a separate branch.
Verify/Time: `db:generate`, Prisma validate, structured WIKI validators, `typecheck`, `lint`, `build`, and `root-entry:smoke -- --url http://localhost:3000` passed on 2026-06-16.
Deploy Verify: Preview direct URL release smoke passed; public auth pages and `/auth/post-login` now avoid unauthenticated browser 401s so root-entry smoke does not fail on expected login redirects.
Smoke Harness: `root-entry:smoke` now creates a Supabase magic-link smoke session when explicit cookie/storage state is absent but Preview Supabase env is available.
Final Preview: `6512fe201baf2a4793bef3ef33a051b3703f56d1` deployed Ready at `architect-start2-39s69qekx-chois-projects-7b2948cf.vercel.app`; branch alias `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` passed `structured-knowledge:preview-smoke:release` no-skip and strengthened `root-entry:smoke`.
