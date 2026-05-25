Req: Add an isolated Apple-inspired SaaS theme option named `apple` while preserving existing themes and density.
Diff: Added `apple-workbench` theme definitions/copy plus DESIGN/plan docs; scoped Apple CSS and component flags simplify typography, hide explanatory copy, reduce blue surfaces, neutralize calendar/table/chips/popovers, and stabilize narrow task ID badges.
Why: Keep theme-only design work isolated from auth, data, API, build, and generated files while matching the approved Apple Blue plus white/black/gray direction.
Verify/Time: `/daily`, `/board`, and `/calendar` returned 200; `npm run typecheck`; targeted `npx eslint` on changed TSX files; `git diff --cached --check` passed; full `npm run lint` remains blocked by generated `.next-theme-dev` files. | 2026-05-21 KST
