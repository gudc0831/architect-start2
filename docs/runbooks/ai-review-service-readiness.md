# AI Review Service Readiness Runbook

Date: 2026-06-08

## Scope

This runbook verifies that the AI review service is ready beyond local login. It covers three required completion checks:

- DB task data is synchronized with the server.
- GPT login is available, AI review executes, and WIKI approval request state is correct.
- SaaS task creation and three consecutive edits work without a stale write conflict.

## Preflight

Run from `D:\architect-workspace\architect-saas-ai-review-readiness`.

Required checks:

```powershell
npm run ai-review:readiness
npm run project-context:validate
npm run legal-search:validate
npm run task-review:validate
```

Expected boundary:

- `ai-review:readiness` may block if required external API env vars are missing. Treat that as a deployment blocker, not a code failure.
- Do not print or paste secret values. Report only variable names and pass/fail state.
- `task-review` preview must not approve or create WIKI candidates.
- Local Codex/GPT generated records saved through `/api/assistant/records` must become WIKI candidates with state `candidate`, awaiting admin review.

## Local Server

Start the SaaS app from the isolated worktree:

```powershell
npm run dev
```

If port `3000` is already occupied, run the Next CLI directly with another port:

```powershell
node .\node_modules\next\dist\bin\next dev --webpack -p 3001
```

Use the matching origin in the smoke commands.

## Completion Smoke

The completion smoke creates three tasks, confirms server readback, performs three consecutive edits across those three task rows, retrieves AI evidence, runs the task-review preview boundary, and saves a synthetic Local Codex-style assistant record that must enter the WIKI candidate queue.

If the browser session is not available to PowerShell, set a cookie copied from the authenticated SaaS browser session:

```powershell
$env:ARCHITECT_SMOKE_COOKIE = "<authenticated app cookie header>"
npm run ai-review:completion-smoke -- -Origin http://localhost:3000
```

Evidence to capture from the JSON output:

- `createVisibleOnServerReadback: true`
- `createdTaskIds` contains three task ids
- `editProof` contains exactly three entries with distinct `taskId` values and `serverReadback: true`
- `retrieveEvidenceCount` is present
- `taskReviewStatusCode: 200`
- `taskReviewPreviewWikiApprovalAttempted: false`
- `taskReviewPreviewCandidateCreated: false`
- `savedAssistantExecutionMode: "local-chatgpt-codex"`
- `savedAssistantRuntimeMode: "extension-native-bridge-in-page"`
- `savedAssistantRecordIsSynthetic: true`
- `wikiCandidateState: "candidate"`
- `wikiCandidateCheck: "admin-candidate-queue"` when the logged-in user has knowledge admin permission, otherwise `record-candidate-state`

Default behavior leaves the smoke task and assistant record in place as proof. Add `-Cleanup` only when the proof has already been captured.

This smoke does not prove GPT login or native bridge execution. It proves that the SaaS API accepts a Local Codex-shaped saved record and places it in the WIKI candidate queue. If `taskReviewStatusCode` is `409`, readiness is blocked by legal verification or environment configuration and the completion smoke must not be treated as passed.

Troubleshooting:

- On Windows PowerShell 5, always read curl response temp files as UTF-8 before `ConvertFrom-Json`. Korean task data can otherwise corrupt the JSON stream and make server readback look falsely broken.
- Generic foundation `regulation` seeds without a law article locator must not be used as generation evidence for non-legal task reviews. Explicit legal questions still require a law name and article locator or official-law verification remains blocked.

## Local Codex/GPT Login And AI Review

This part verifies the GPT login required by AI review: the local Codex/GPT provider used by the browser assistant native bridge. Do not substitute a generic `chatgpt.com` web login check for this proof.

Required evidence:

- `codex exec` returns a real model response, proving the local Codex/GPT login is active.
- The Browser Assistant health check shows the Local Codex/native bridge is available.
- `scripts/verify-local-codex-generation.mjs --allow-external --json --strict` returns `ok: true` in `mode: "real"`, proving the native bridge can execute real AI review generation.
- Running AI review in the task panel uses the `local-codex` execution mode.
- Network or UI evidence shows:
  - `POST /api/assistant/retrieve` returns 200.
  - The native bridge request includes `projectContextChunks`, `projectContextTrace`, `evidenceReadinessWarnings`, and `legalEvidence`.
  - `POST /api/assistant/records` returns 201.
  - The saved record appears in assistant history with execution mode `local-chatgpt-codex`.

Do not treat `/api/assistant/task-review` preview success as GPT execution proof. Preview verifies server orchestration and WIKI non-approval only.

## WIKI Boundary

There are two separate WIKI paths:

- `/api/assistant/task-review` preview or generated server review saves `not_candidate`; it must not create, request, or approve WIKI candidates.
- `/api/assistant/records` from the task panel saves normal assistant output. Its default state is `candidate`, which is the WIKI approval request queue state.

Approval is a separate admin action through `/api/admin/knowledge/candidates/{id}/approve`. Completion requires the candidate request to exist, not approval to be performed.

## Rollback

No database migration is added by this readiness implementation. To back out code changes, revert the SaaS and browser-assistant branches only:

- `D:\architect-workspace\architect-saas-ai-review-readiness`
- `D:\architect-workspace\architect-browser-assistant-ai-review-readiness`

Do not revert or clean the original worktrees unless the owner explicitly requests it.
