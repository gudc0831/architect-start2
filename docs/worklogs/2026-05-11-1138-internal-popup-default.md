Req: Restore the SaaS `/daily` in-page `AI 검토` popup as the default assistant UI.
Diff: Removed CSS that hid `.task-assistant` when the Chrome extension was installed and updated `사용자 가이드.md` to describe the side panel as hidden/manual diagnostics.
Why: Users should primarily work inside the site popup; Chrome side panel functionality should remain available without replacing the SaaS task workflow.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`; lint kept existing hook warnings and build kept existing data-guard broad-pattern warnings | 2026-05-11-1138
