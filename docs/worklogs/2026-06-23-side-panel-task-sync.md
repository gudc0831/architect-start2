# 2026-06-23 Side Panel Task Sync

## Request

Implement the SaaS `/daily` side of the Browser Assistant side-panel task sync contract without editing `architect-browser-assistant`, committing, or pushing.

## SaaS-side summary

- Added the `architect:side-panel-context-updated` `CustomEvent` contract in `src/components/tasks/task-assistant-panel.tsx`.
- Added a shared `buildSidePanelContextSnapshot` helper and reused it for the side-panel launch path and live sync events.
- Dispatch reasons now covered on the SaaS side:
  - `launch` when the existing "right panel" button opens the extension side panel.
  - `selection-change` when the selected task identity changes.
- `question-change` after a 300 ms debounce when the review question changes.
- `mode-change` when execution mode or basic/advanced assistant mode changes.
- Preserved existing launch data attributes and SaaS fallback behavior.
- The question debounce is task/question scoped. Mode changes clear any pending question timer before emitting `mode-change`, so pure mode changes do not schedule delayed `question-change` events.

## Emitted fields

The event detail contains only UI-safe selected-task context:

- `task.taskId`
- `task.projectId`
- `task.displayId`
- `task.title`
- `task.status`
- `review.question`
- `review.executionMode`
- `review.assistantMode`
- `page.url`
- `page.route`
- `reason`
- `selectedAt`
- `source: "architect-saas-daily"`

`review.question` is always emitted as a string. If the user clears the question, the emitted value is `""` so the side panel can clear its local context.

## Boundary

The snapshot builder intentionally does not include evidence chunks, assistant logs, Local Codex transcripts, cookies, local/session storage, tokens, or server trust fields. The validator now checks the builder body for forbidden anchors: `cookie`, `localStorage`, `sessionStorage`, `access_token`, `projectContextChunks`, `evidenceReadinessWarnings`, and `localCodexTranscript`.

Page context is scrubbed before emission. `page.url` is `origin + pathname` and `page.route` is `pathname`, so query strings and hash fragments such as OAuth `code`, `access_token`, or session-like values are not emitted.

## Verification

- `npm run task-assistant:unified:validate`: PASS. All task-assistant unified contract guardrails passed, including the new live side-panel context sync check.
- `npm run typecheck`: PASS. `tsc --noEmit` completed successfully.
- Follow-up validator hardening added checks for actual reason dispatch sites, always-emitted empty question strings, SaaS-only reason exposure, and scrubbed page URL emission.
- Re-review validator hardening now checks the combined side-panel context source across the snapshot builder, page helper, dispatch callback/helper, and emit call windows for forbidden anchors and URL query/hash leakage.

## Files changed

- `src/components/tasks/task-assistant-panel.tsx`
- `scripts/task-assistant-unified-contract-validate.ts`
- `docs/worklogs/2026-06-23-side-panel-task-sync.md`
