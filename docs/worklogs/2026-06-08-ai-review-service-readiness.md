# Task Log: AI Review Service Readiness

Date: 2026-06-08

## Request

- Implement the AI review service readiness plan.
- Use isolated worktrees, harness-engineering, Superpowers, and multi-agent review.
- Verify DB task server sync, GPT login and AI review execution with WIKI approval request state, and SaaS task creation plus three consecutive edits.

## Changes

- Passed authenticated user context into assistant retrieval so project upload context can be included during SaaS and Local Codex reviews.
- Expanded the browser assistant bridge contract to schema v3 and forwarded legal evidence, project context chunks, project context trace, and evidence readiness warnings.
- Updated the Local Codex prompt to treat uploaded project context as untrusted project facts, not instructions.
- Preserved official-law audit fields when assistant evidence is normalized for storage.
- Added readiness and completion smoke commands for AI review service rollout checks.
- Added a runbook for browser GPT login, AI review execution, WIKI candidate boundaries, and DB task sync proof.
- Filtered law-name-only foundation `regulation` seeds out of non-legal task-review generation evidence so generic task reviews do not fail official-law verification on unverified seed locators.

## Changed Files

SaaS worktree:

- `package.json`
- `scripts/ai-review-completion-smoke.ps1`
- `scripts/ai-review-readiness-validate.ts`
- `scripts/legal-search-adapter-validate.ts`
- `scripts/project-context-review-contract-validate.ts`
- `src/app/api/assistant/retrieve/route.ts`
- `src/components/tasks/task-assistant-panel.tsx`
- `src/use-cases/assistant-service.ts`
- `src/use-cases/task-review-service.ts`
- `docs/runbooks/ai-review-service-readiness.md`
- `docs/worklogs/2026-06-08-ai-review-service-readiness.md`

Browser assistant worktree:

- `native-host/codex-bridge-host.mjs`
- `native-host/codex-bridge-host.node-test.mjs`
- `src/content/content-script.test.ts`
- `src/content/content-script.ts`
- `src/runtime/ArchitectLocalAssistantRuntime.ts`
- `src/runtime/local-runtime-client.test.ts`
- `src/runtime/native-bridge-contract.ts`

## Verification Plan

- Run SaaS static validators: `ai-review:readiness`, `project-context:validate`, `legal-search:validate`, `task-review:validate`, `typecheck`, `lint`, and build when feasible.
- Run browser assistant validation: tests, native host self-test, typecheck, lint, build, and release readiness.
- Run completion smoke against an authenticated local or preview origin:
  - create three tasks
  - read them back from the server
  - apply three consecutive edits across those task rows with server readback after each edit
  - retrieve assistant evidence
  - run task-review preview with HTTP 200 and confirm no WIKI approval bypass
  - save a synthetic Local Codex-style assistant record and confirm WIKI candidate state
- Verify GPT login and actual Local Codex AI review execution in browser; API smoke alone cannot prove the GPT session.

## Verification Evidence

- `npm run task-review:validate`: passed after adding checks that law-name-only prompts do not verify arbitrary first articles, generic non-legal task prompts exclude unverified regulation seeds, and explicit legal prompts still require official-law verification.
- `npm run typecheck`: passed.
- `npm run ai-review:completion-smoke -- --Origin http://localhost:3000 --Cleanup`: passed against the cloud-backed local server.
  - `auth`: 200
  - `createdTaskIds`: `37a73547-e7e0-4a11-8787-13f3de136fbd`, `43daf749-8dd6-4061-8a8f-c85523f0d1c5`, `1f8c9754-3276-4006-9f09-c613dc4089d6`
  - `createVisibleOnServerReadback`: true
  - `editProof`: 3 distinct task ids, each `serverReadback: true`, each version 2 after edit
  - `taskReviewStatusCode`: 200
  - `taskReviewPreviewWikiApprovalAttempted`: false
  - `taskReviewPreviewCandidateCreated`: false
  - `savedAssistantRecordId`: `e7693490-47ba-4cc0-b688-2ea3bc1858e5`
  - `wikiCandidateState`: `candidate`
  - `wikiCandidateCheck`: `admin-candidate-queue`
- Browser assistant `node scripts\verify-local-codex-generation.mjs --allow-external --json --strict --timeout-ms 180000`: passed in real mode after fixing the native host default Codex command path.
  - `ok`: true
  - `mode`: `real`
  - Proof: `codex exec` returned a real model answer through the local native-host generation path, proving the AI-review-required Local Codex/GPT login is active.
- Browser assistant `npm run typecheck`, `npm run test -- --runInBand`, and `npm run release:check`: passed after the native host command-path fix.

## Failure Learning

- failure: Completion smoke initially created DB tasks but reported that created tasks were not visible in server readback.
  - cause: The npm script invoked Windows PowerShell, and the smoke script read curl temp response files without `-Encoding UTF8`. Korean task data corrupted the JSON stream before `ConvertFrom-Json`.
  - fix: Read response temp files with `Get-Content -Raw -Encoding UTF8`.
  - evidence: After the fix, completion smoke proved 3 task creations and 3 server-visible edits.
  - prevention: Any Windows PowerShell smoke script that parses JSON responses containing Korean text must force UTF-8 when reading temp files.
- failure: `/api/assistant/task-review` returned 409 in the completion smoke after task sync/edit proof passed.
  - cause: Generic foundation `regulation` seeds had law names but no article locators, so official-law verification produced `missing_query` and blocked generation.
  - fix: Keep the official-law verifier strict, but filter unverified law-name-only regulation seeds out of non-legal task-review verification/generation evidence. Explicit legal questions still include them and remain blocked without a verifiable locator.
  - evidence: `npm run task-review:validate` and completion smoke both passed after the boundary change.
  - prevention: Do not relax official-law verification to treat law-name-only seed evidence as verified or not required.
- failure: The first real native-host generation verifier failed immediately even though `codex exec` worked from PowerShell.
  - cause: The native host defaulted to `codex.exe` on Windows, which selected the WindowsApps binary instead of the user npm `codex.cmd` wrapper used by the working CLI login.
  - fix: Browser assistant native host now prefers `%APPDATA%\npm\codex.cmd` on Windows when `ARCHITECT_CODEX_CLI_PATH` is not explicitly set.
  - evidence: Real verifier passed without `ARCHITECT_CODEX_CLI_PATH`, and browser assistant `typecheck`, tests, and `release:check` passed afterward.
  - prevention: Native-host execution must prefer the same user-context Codex wrapper that the operator login uses.

## Remaining Risks

- External legal API readiness depends on deployment env vars and credentials.
- Full in-page click-through of the AI Review button remains a UI-level verification step; the required Local Codex/GPT login and native generation path are proven by the real verifier above.
- Completion smoke requires an authenticated app session or cookie header in cloud mode.
- Completion smoke candidate-queue proof is synthetic; actual GPT/native bridge execution still requires browser evidence.
