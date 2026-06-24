# Extension context invalidated UI handling

## Context

The `/daily` AI review panel can receive Browser Assistant side-panel launch failures from a stale content script after the Chrome extension is rebuilt or reloaded.

## Changes

- Added optional side-panel bridge `errorCode` handling.
- Mapped `extension_context_invalidated` and the legacy raw `Extension context invalidated` message to a user-facing refresh instruction.
- Added a guarded automatic `/daily` page refresh when a stale content script is detected after an extension reload.
- Kept the in-page SaaS assistant fallback message intact.
- Updated the task-assistant contract validator to require the refresh guidance anchor.

## Verification

- `npm run task-assistant:unified:validate`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
