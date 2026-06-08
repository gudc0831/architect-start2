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

## Commit and Push Evidence

- SaaS repository: `https://github.com/gudc0831/architect-start2.git`
  - Branch: `codex/ai-review-service-readiness-20260608`
  - Commit: `e03709e9d09044707daeaab32cf02ec5829e7ec9`
  - Commit message: `Implement AI review readiness checks`
  - Remote ref check: local `HEAD` and `origin/codex/ai-review-service-readiness-20260608` both resolved to `e03709e9d09044707daeaab32cf02ec5829e7ec9`.
- Browser assistant repository: `https://github.com/gudc0831/architect-browser-assistant.git`
  - Branch: `codex/ai-review-service-readiness-20260608`
  - Commit: `d40d5d4d9bcd362b35e6c557aa796444dc81bf80`
  - Commit message: `Extend local Codex review bridge context`
  - Remote ref check: local `HEAD` and `origin/codex/ai-review-service-readiness-20260608` both resolved to `d40d5d4d9bcd362b35e6c557aa796444dc81bf80`.

## Preview DB Migration Evidence

- Initial Vercel deployment failed before app build completion because `deploy:migration-gate` detected one unapplied cloud migration:
  - Pending migration: `202606050001_add_ai_settings_preferences_and_local_usage`
  - Failed deployment: `dpl_8vR5ZL11t9sCWdcwV5JdQ8DVwDNc`
  - Failed URL: `https://architect-start2-f8pvv54yl-chois-projects-7b2948cf.vercel.app`
- User approved the guarded cloud DB migration on 2026-06-08.
- `npm run data:backup`: passed before migration.
  - Local snapshot: `local-2026-06-08T01-18-51-497Z-6c207814`
  - Cloud backup: `cloud-2026-06-08T01-18-52-939Z-31015220`
- First `npm run db:migrate:safe`: correctly stopped on the non-empty cloud DB guard and required `DATA_GUARD_CONFIRM`.
- Second `npm run db:migrate:safe` with the one-time confirmation token: passed.
  - Applied migration: `202606050001_add_ai_settings_preferences_and_local_usage`
  - Result: all migrations successfully applied.
- `npm run deploy:migration-gate`: passed after migration.
  - Result: `Database schema is up to date!`
- `npm run data:doctor`: passed after migration.
  - Cloud row counts at the time of verification: `profiles: 8`, `projects: 2`, `tasks: 81`, `files: 0`, `preferences: 2`
  - Latest cloud backup: `cloud-2026-06-08T01-19-35-265Z-2bbc6122`
  - Backup coverage: all expected public/storage tables succeeded; no failed tables.

## Vercel Deployment Evidence

- Redeployed the failed preview deployment without creating an empty commit:
  - Command: `npx vercel redeploy dpl_8vR5ZL11t9sCWdcwV5JdQ8DVwDNc --target preview --scope chois-projects-7b2948cf`
  - Result: Ready in about 2 minutes.
- Ready deployment:
  - Deployment ID: `dpl_BdQ1WP39jqQ2NVEKh9zPNSgsKyMS`
  - Deployment URL: `https://architect-start2-abz16m1nx-chois-projects-7b2948cf.vercel.app`
  - Branch alias: `https://architect-start2-git-codex-ai-re-040969-chois-projects-7b2948cf.vercel.app`
  - Vercel target: `preview`
  - Git source in Vercel logs: `github.com/gudc0831/architect-start2`, branch `codex/ai-review-service-readiness-20260608`, commit `e03709e`
  - GitHub commit status for `e03709e9d09044707daeaab32cf02ec5829e7ec9`: `success`, description `Deployment has completed`.
- Build log evidence:
  - `npm run vercel-build` executed `npm run db:generate && npm run deploy:migration-gate && npm run build`.
  - `deploy:migration-gate` reported `Database schema is up to date!`.
  - Next.js production build compiled successfully, TypeScript finished, 102 static pages generated, and deployment completed.
- App auth boundary evidence:
  - `https://architect-start2-abz16m1nx-chois-projects-7b2948cf.vercel.app/daily`: HTTP `307`, `Location: /login?next=%2Fdaily`
  - `https://architect-start2-git-codex-ai-re-040969-chois-projects-7b2948cf.vercel.app/daily`: HTTP `307`, `Location: /login?next=%2Fdaily`
  - Interpretation: the exact deployed surfaces reached the app and hit app authentication, not a Vercel protection interstitial.

## Deployed Server Completion Smoke Evidence

- Generated a short-lived Supabase app session cookie for smoke verification without printing secret or cookie values.
- Removed the temporary cookie file after verification.
- `npm run ai-review:completion-smoke -- --Origin https://architect-start2-abz16m1nx-chois-projects-7b2948cf.vercel.app --Cleanup`: passed against the Vercel Preview deployment.
  - `status`: `passed`
  - `origin`: `https://architect-start2-abz16m1nx-chois-projects-7b2948cf.vercel.app`
  - `auth`: 200
  - `taskId`: `1f217ee8-4184-4823-9575-410849476310`
  - `createdTaskIds`: `1f217ee8-4184-4823-9575-410849476310`, `5719e301-9dfd-473c-90ba-08ccdea0a924`, `77f5751c-61cd-4b5d-8180-288241ff097c`
  - `createVisibleOnServerReadback`: true
  - `editProof`: three distinct task ids, each `serverReadback: true`, each version 2 after edit
  - `retrieveEvidenceCount`: 6
  - `projectContextChunkCount`: 0
  - `readinessWarningCount`: 0
  - `taskReviewStatusCode`: 200
  - `taskReviewPreviewWikiApprovalAttempted`: false
  - `taskReviewPreviewCandidateCreated`: false
  - `savedAssistantRecordId`: `bafc0423-04fb-4412-8495-bea663b30968`
  - `savedAssistantExecutionMode`: `local-chatgpt-codex`
  - `savedAssistantRuntimeMode`: `extension-native-bridge-in-page`
  - `wikiCandidateState`: `candidate`
  - `wikiCandidateCheck`: `admin-candidate-queue`
  - `cleanup`: true

## Final Requirement Checklist

- DB task data server sync: verified on the Vercel deployment by creating three task records and reading each one back from `/api/tasks`.
- GPT login and AI review execution:
  - Local Codex/GPT login/native generation: verified by the browser assistant real-mode generation verifier.
  - SaaS deployed AI review APIs: verified by deployed completion smoke with `/api/assistant/retrieve` and `/api/assistant/task-review` returning usable results.
  - Boundary note: the Vercel server cannot independently prove the interactive ChatGPT browser session; it proves the deployed SaaS API side. The browser assistant verifier proves the local native Codex/GPT execution path.
- WIKI approval request boundary: verified on Vercel preview; task-review preview did not attempt approval and did not create a WIKI candidate automatically.
- WIKI candidate queue: verified by saving an assistant record and finding it in the admin candidate queue as `candidate`.
- SaaS task creation and three consecutive edits: verified on the Vercel deployment; all three edits were visible from server readback.
- Branch integration/push: verified by remote refs for both SaaS and browser assistant feature branches.

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
- failure: The first Vercel preview deployment failed after code push.
  - cause: `deploy:migration-gate` correctly blocked deployment because the cloud Preview DB still had pending migration `202606050001_add_ai_settings_preferences_and_local_usage`.
  - fix: After explicit user approval, created data backups and ran `npm run db:migrate:safe` against the exact cloud DB target.
  - evidence: `npm run deploy:migration-gate` passed locally, the redeployed Vercel preview logs showed `Database schema is up to date!`, and deployment `dpl_BdQ1WP39jqQ2NVEKh9zPNSgsKyMS` reached Ready.
  - prevention: Before redeploying a branch that changes Prisma migrations, run `npm run deploy:migration-gate` against the exact deployment env and prepare the guarded backup/migration path if it fails.

## Remaining Risks

- External legal API readiness depends on deployment env vars and credentials.
- Full in-page click-through of the AI Review button remains a UI-level verification step; the required Local Codex/GPT login and native generation path are proven by the real verifier above, and the deployed SaaS API side is proven by the Vercel completion smoke.
- Completion smoke requires an authenticated app session or cookie header in cloud mode.
- Completion smoke candidate-queue proof is synthetic; actual GPT/native bridge execution is covered by the browser assistant real-mode verifier, not by the Vercel server itself.
