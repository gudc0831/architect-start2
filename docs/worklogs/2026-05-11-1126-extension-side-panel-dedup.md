Req: Avoid showing both the Chrome extension side panel entry and the SaaS in-page assistant launcher.
Diff: Added CSS that hides the SaaS `.task-assistant` launcher/panel when the extension content script marks the page with `html[data-architect-browser-assistant="installed"]`.
Why: The extension side panel is now the primary local Codex bridge surface; showing the SaaS bottom launcher at the same time confused task-focused workflow testing.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`; lint/build reported only existing non-blocking warnings unrelated to this CSS change | 2026-05-11-1126
