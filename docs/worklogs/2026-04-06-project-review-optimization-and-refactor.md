Req: Review the whole project for safe optimization, refactoring, and faster response paths using harness-engineering and gh-address-comments where possible.
Review: Found duplicated client bootstrap requests, a large `task-workspace.tsx` hotspot, repository-level full scans in file/task loading paths, sequential project rename rewrites, and build-time filesystem scan warnings.
Verify: Ran `npm run data:doctor`; `npm run typecheck` (pass on rerun); `npm run lint` (3 hook-dependency warnings in `src/components/tasks/task-categorical-fields.tsx`); `NEXT_DIST_DIR=.next-review npm run build` (pass with Turbopack warnings); measured live local endpoints on `http://127.0.0.1:3000`.
Artifacts: Review only; no intended product-code changes. `gh-address-comments` could not run fully because `gh` is not installed in this environment.
Risks: Repository has many unrelated uncommitted changes; findings reflect the current working tree, not a clean baseline.
