# 2026-06-23 Task assistant Chrome side panel launch

Req: Keep the SaaS `/daily` task assistant as the fallback/basic surface, but let extension-installed users open the existing Chrome right side panel from the assistant panel.

Diff: Added a small `오른쪽 패널` header action with data-scoped task context. The extension content script handles that real button click and answers with `architect:page-side-panel-response`. The request sends only selected task id/project id/title/current question/current URL, and failure reports that the SaaS panel remains usable.

Why: This preserves the current in-page assistant design while providing the larger Chrome side panel workflow for users who have Architect Browser Assistant installed.

Verify: `npm run task-assistant:unified:validate`; browser-side bridge tests in `architect-browser-assistant` via `npx vitest run src/content/content-script.test.ts src/side-panel/App.test.tsx`.

Boundary: No commit, push, deployment, DB mutation, assistant generation, or summary approval was performed.
