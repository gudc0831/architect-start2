Req: Refresh the admin UI density and hierarchy in `src/components/admin/admin-foundation-shell.tsx` only, keep all admin behavior unchanged, and avoid collisions with ongoing calendar/shared UI work.
Diff: Refactored `src/components/admin/admin-foundation-shell.tsx` into compact admin sections and added `src/components/admin/admin-foundation-shell.module.css` for admin-only layout, spacing, controls, and responsive category/member rows.
Why: Separate status from the page title, standardize button/card sizing, reduce dead space in category panes, and keep the visual refresh scoped away from shared calendar/task styling.
Verify: Ran `npx eslint src/components/admin/admin-foundation-shell.tsx`, `npm run typecheck`, and manual browser QA on `/admin` at `1440x900`, `1280x800`, `1024x768`, and `390x844`.
Risk: Visual QA is complete, but live admin mutations were preserved rather than exhaustively re-executed end-to-end against every data path.
