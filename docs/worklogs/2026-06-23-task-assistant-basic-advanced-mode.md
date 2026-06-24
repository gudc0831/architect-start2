# 2026-06-23 Task assistant basic and advanced mode

Req: In the `/daily` AI review panel, group recent review records, file evidence, external web/skill evidence, execution mode, Local Codex login controls, and the default review-instruction block under an explicit advanced mode. The advanced area must appear only after the user clicks it and must use a non-white box color.

Diff: Added a `basic` / `advanced` mode switch to `TaskAssistantPanel`. Basic mode keeps the selected task, question, and action buttons visible. Advanced mode reveals the requested settings/evidence sections inside a tinted `task-assistant__advanced` container. Added CSS for the mode switch and non-white advanced grouping, plus a contract validator guard.

Follow-up diff: Applied the browser annotation for the action-button row by widening only the AI review panel max width to `30rem`, changing `.task-assistant__actions` to a four-column equal grid, and compacting only that hierarchy's primary/secondary buttons to `0.75rem` text and `2.36rem` height.

Evidence disclosure diff: Simplified task assistant evidence cards so the UI shows only the evidence title and the `출처 열기` link when a source URL exists. Evidence kind, priority, tool/source metadata, and excerpt text remain in component state/API payloads for system use, but are no longer rendered in the visible card body.

Evidence collapse diff: The generated review evidence section now defaults closed after task changes, generated-output resets, and new review runs. Users can expand it with the `보기 N` button and close it again with `접기`, keeping legal/project-upload/readiness diagnostics and evidence cards out of the default view.

Closure detail diff: The `작업 기록 정리 초안` closure checklist now keeps item detail text hidden by default. Each parent card, such as `결론`, exposes its detail on mouse hover or keyboard focus, with the same detail also available through the native title tooltip.

Closure compact diff: The same checklist now uses a compact auto-fit grid with smaller card padding and status badges, so the five checks can fit into roughly two rows in the narrow assistant panel instead of five tall rows.

Closure title diff: Removed ellipsis clipping from checklist titles. Titles now wrap naturally inside the compact cards so labels such as `적용 범위` and `후속 조치` remain fully readable.

Closure visibility diff: Reduced the closure checklist UI to the `신뢰도` item only. The full `결론`, `적용 범위`, `근거`, and `후속 조치` gates remain in `closureGate` and continue to drive approval blockers system-side, but they are no longer repeated as visible UI cards.

Advanced hint diff: Moved the static helper copy inside advanced-mode sections into title hover/focus hints. The section bodies no longer spend vertical space on those descriptions, while keyboard users can still focus each advanced header and read the same explanation.

Tooltip dedupe diff: Removed native `title` tooltips from the custom hover/focus hint targets so the UI no longer shows both the browser tooltip and the styled in-panel hint at the same time. Kept `aria-label` text on the focusable headers/cards for non-visual context.

Verify: `npm run task-assistant:unified:validate`; `npm run typecheck`; `npm run lint`; `npm run worklog:check`; in-app browser at `http://localhost:3000/daily` confirmed basic mode hides all requested advanced labels, advanced mode reveals them, and the advanced box computes to `rgba(44, 94, 98, 0.1)`. Follow-up browser measurement on the default-open assistant preview route confirmed the four action buttons render in one row with equal `107.15px` widths, `37.75px` heights, and `12px` text at a `544x930` viewport.

Boundary: No commit, push, deployment, DB mutation, or Local Codex generation was performed.
