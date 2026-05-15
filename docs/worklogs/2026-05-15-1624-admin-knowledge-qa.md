Req: Review admin knowledge preview/local QA and fix blocking local runtime issues
Diff: 2f +24/-2 | src/app/api/project/changes/route.ts, ...s/admin/knowledge-admin-shell.tsx
Why: Preview admin knowledge was blocked by server errors; local QA exposed project changes and hydration issues
Verify/Time: npm run typecheck; npm run lint; NEXT_DIST_DIR=.next-build npm run build; npm run regulation:governance:validate; browser/API QA | 15:20-16:24 (1h 5m)
