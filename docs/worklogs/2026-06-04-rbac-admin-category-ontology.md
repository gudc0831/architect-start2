Req: Fix RBAC/UI mismatches on `codex/multi-user-transition` from baseline `5ca4e9c`; centralize task category ontology so only global admins create common codes and project managers edit project usage settings.
Diff: Added active-only project guards, server-protected `/admin` manager access, sidebar/admin UI role filtering, project category override-only APIs, legacy project definition markers, and `scripts/category-ontology-migration.ts`.
Why: Project-specific free-form codes can corrupt the shared ontology; managers should manage project membership/invitations/settings without gaining global admin capabilities.
Verify: `npm run typecheck` pass; `npm run lint` pass with existing `project-materials-page.tsx` hook warning; `npx tsx scripts/daily-editing-responsiveness-verify.ts` pass; local `/admin` returns HTTP 200; migration dry-run command exits because `DATABASE_URL` is not configured in this shell.
Time: 2026-06-04
