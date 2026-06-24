# 2026-06-23 Local Codex review-session mode fix

Req: Fix the `/daily` AI review panel failure where Local Codex generation saved successfully but usage recording failed with `Assistant usage record is not available for this profile`.

Failure: The browser run saved assistant record `4fdb1c47-6106-4b7c-89a2-c0c9bd2e8b1d`, but `/api/assistant/usage/me` rejected usage recording. DB inspection showed that saved record had `executionMode: saas-api`, `runtimeMode: task-review-mock-provider`, and no linked usage events.

Cause: `saveTaskReviewSessionRecord` always saved review-session records as `saas-api` even when the client generated the answer through Local Codex. The usage service intentionally accepts only records whose project, task, profile, and `executionMode: local-chatgpt-codex` match.

Fix: The task assistant panel now stores generation-time `executionMode` and `runtimeMode` in `AssistantOutput`, posts them to `/api/assistant/review-sessions`, and the review-session route/service validates and persists those fields. Local Codex saves now persist `local-chatgpt-codex` / `extension-native-bridge-in-page`, so usage recording can pass the existing server guard.

Verify: `npm run task-assistant:unified:validate`; `npx tsx scripts/ai-settings-contract-validate.ts`; `npm run typecheck`.

Boundary: No deployment, push, DB mutation, or secret output was performed in this fix pass.
