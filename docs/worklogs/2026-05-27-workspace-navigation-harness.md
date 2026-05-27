# Workspace Navigation Harness

## Scope

- Fix slow perceived tab moves across board, daily, calendar, trash, and admin.
- Keep middleware/API authorization while removing avoidable per-tab server page waits.
- Apply the saved theme before the first client render to avoid default-theme flicker.
- Add a harness check for the navigation and theme contracts.

## Harness Roles

- choi: coordinate scope, integration, and final verification.
- hy: workspace/admin route speed path.
- ung: theme bootstrap and prefetch behavior.
- ch: UI and user-perceived flow review.
- ul: static contract review and repository hygiene.

## Review Passes

- Product pass: proceed. The user value is immediate route feedback, not only backend latency.
- Engineering pass: proceed. Middleware and API guards preserve access checks; page-level DB waits are the avoidable route bottleneck.
- Design pass: proceed. No visual redesign; the change prevents theme flash and keeps existing UI.

## Changes

- Workspace pages render synchronously and no longer wait for `requireWorkspacePageUser` during client tab moves.
- Admin page renders synchronously; the admin shell and API routes remain guarded by client capability checks and API authorization.
- AppShell adds a client access gate for login, pending, disabled, and no-project workspace states.
- Theme is bootstrapped from `localStorage` in the root layout before hydration and reconciled with the backend preference afterward.
- Sidebar prefetch warms workspace and admin routes earlier, including pointer-down.
- `scripts/workspace-navigation-harness.ts` checks the route, theme, prefetch, and timing contracts.

## Verification Plan

- Run `npx.cmd tsx scripts/workspace-navigation-harness.ts`.
- Run typecheck, lint, build.
- Verify local browser flow: `/board -> /daily -> /board -> /calendar -> /trash -> /admin`.
- If deployed, verify the same flow on Vercel preview and capture median timings.
