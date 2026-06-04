Req: unblock Vercel preview builds for `codex/multi-user-transition` after `next build` failed on missing `@prisma/client` exports.
Diff: add a `prebuild` script in `package.json` so `npm run build` runs `npm run db:generate` before Next.js compiles and typechecks.
Why: fresh Vercel installs can reach `next build` without a generated Prisma client, which breaks imports even when the application code is otherwise ready to compile.
Verify/Time: local `npm run build` rerun still pending; fix is grounded in the user-provided Vercel failure log from 2026-04-10.
