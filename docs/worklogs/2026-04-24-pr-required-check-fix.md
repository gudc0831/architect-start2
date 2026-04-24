Req: Fix the current PR required check failures for `typecheck` and `semgrep` without changing auth/RBAC behavior, preview data, or unrelated untracked files.
Diff: added Prisma client generation before the CI `typecheck` job; removed unsupported pip caching from the Semgrep workflow; guarded SARIF upload so it only runs when `semgrep.sarif` exists.
Why: GitHub fresh checkouts do not have a generated Prisma client before `tsc`, and `actions/setup-python` pip caching fails in this repo because there is no Python dependency manifest.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run deps:audit` passed locally on 2026-04-24; GitHub Actions recheck requires pushing the branch.
