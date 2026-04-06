Req: multi-project sidebar should switch projects only via dropdown, with no stacked project action buttons
Diff: src/components/layout/sidebar.tsx -32 button-list lines removed; no API, provider, or CSS changes
Why: keep project navigation compact when multiple projects exist and avoid long sidebar stacks
Verify/Time: npm run typecheck; npm run lint (existing warnings only); browser QA on /board at 1440, 1024, 390 with dropdown switch between both local projects confirmed; observed pre-existing 503s on /api/categories and /api/files | 14:08-14:17
