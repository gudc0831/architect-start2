# 2026-06-23 Task Assistant unified upgrade and Preview handoff

Req: 건축 Task Assistant 고도화 계획을 실제 구현하고, `codex/multi-user-transition` Vercel Preview 배포 화면에서 계획대로 동작하는지 검증한다. Production 배포는 이번 검증 범위가 아니며, Preview 기준으로만 종료한다.

## Scope

- SaaS repo: `architect-start2` / local worktree `D:\architect-workspace\worktrees\architect-saas-task-assistant-unified-upgrade`.
- Legal evidence repo: `verified-legal-evidence-api` / local worktree `D:\architect-workspace\worktrees\verified-legal-evidence-api-task-assistant-unified-upgrade`.
- SaaS Preview branch: `origin/codex/multi-user-transition`.
- SaaS feature branch: `origin/codex/task-assistant-unified-upgrade`.
- SaaS main after PR merges: `origin/main`.
- Legal API main and feature branch after closeout: `cbac82f1e44957d490c0177f585918adf75c8374`.

## Final branch and deployment state

- SaaS `origin/main`: `249e66307006d55eb587e2a14756b381e521f1a2`.
- SaaS `origin/codex/task-assistant-unified-upgrade`: `0d50c7c8dbb24b5be9331f25894b49700d9aa9ea`.
- SaaS `origin/codex/multi-user-transition`: `0d50c7c8dbb24b5be9331f25894b49700d9aa9ea`.
- Final Vercel Preview deployment id observed through GitHub deployment API: `5152789914`.
- Final Preview status URL used for final smoke: `https://architect-start2-m5ydwvou3-chois-projects-7b2948cf.vercel.app/preview/assistant`.
- Production was not used as the acceptance target. A Production deployment was briefly inspected during debugging, but the user clarified that this project always verifies on Preview first and Production is deferred.

## Diff summary

SaaS implementation:

- Added integrated Task Assistant planning/spec artifacts:
  - `docs/superpowers/specs/2026-06-22-task-assistant-unified-upgrade-design.md`
  - `docs/superpowers/specs/2026-06-22-task-assistant-legal-graph-rag-design.md`
  - `docs/superpowers/plans/2026-06-22-task-assistant-unified-upgrade-implementation-plan.md`
- Added service-owned default review instruction and answer/session contract:
  - `src/domains/assistant/review-instruction.ts`
  - `src/domains/assistant/review-answer-contract.ts`
  - `src/domains/assistant/review-session.ts`
- Added explicit review-session save/list/detail/rename API:
  - `src/app/api/assistant/review-sessions/route.ts`
  - `src/app/api/assistant/review-sessions/[sessionId]/route.ts`
- Updated Task Assistant panel behavior:
  - 기본 검토지침은 서비스 고정 영역으로 이동.
  - 사용자는 질문만 조정.
  - `검토기록저장` 버튼을 눌러야 최근 검토 기록에 남음.
  - 저장된 세션을 클릭하면 기존 질문/답변/근거 snapshot 흐름을 열 수 있음.
  - 최근 검토 기록, 파일 근거, 외부 웹/스킬 근거, 로컬 Codex 진단은 처음에 접힘.
  - 관련 가능 후보가 결론을 바꿀 가능성이 있으면 `추가확인필요`가 되도록 후보 영향 규칙을 반영.
  - 답변은 공식 검증 조문, 내부 WIKI, 과거 검토 기록을 결론에 통합하되 근거 표시는 분리하는 계약으로 정리.
- Added validator:
  - `scripts/task-assistant-unified-contract-validate.ts`
  - package script: `task-assistant:unified:validate`.
- Updated `/preview/assistant` mock:
  - 새 `/api/assistant/review-sessions` 계약을 mock으로 처리.
  - Preview initial render에서 인증 API 401이 나지 않도록 수정.
  - `defaultExecutionMode="mock"`가 task 선택 후에도 유지되도록 수정.

Legal API implementation:

- Added legal Graph RAG modules under `src/legal-graph/`:
  - `applicability-types.ts`
  - `concept-taxonomy.ts`
  - `task-fact-extractor.ts`
  - `llm-extraction-provider.ts`
  - `applicability-extractor.ts`
  - `applicability-matcher.ts`
  - `graph-rag-ranker.ts`
- Added staging data:
  - `data/staging/legal-graph/concept-links.jsonl`
  - `data/staging/legal-graph/applicability-rules.jsonl`
- Wired `/api/legal/search` to support:
  - `taskContext`
  - `graphRagMode`
  - `applicability` response.
- Official verified vs possible-candidate split:
  - official verified requires complete locator plus official source and `originApiProvider === "law_open_data"`.
  - possible candidates stay usable as candidate evidence but may force `추가확인필요` if they can change the conclusion.

## Related commits and PRs

- `f08dfe8` - `Upgrade task assistant review workflow`.
- `d14e34a` - `Fix task assistant validator semgrep warnings`.
- `2e58c02` - `Fix authenticated page prerender deployment`.
- `b6faf73` - `Fix assistant preview review session mock`.
- `0d50c7c` - `Respect task assistant default execution mode`.
- SaaS PR `#19`: merged main implementation into `origin/main` as `0c4ccddc975f9aadf739c2447b7760324a26269c`.
- SaaS PR `#20`: merged authenticated-page deployment fix into `origin/main` as `249e66307006d55eb587e2a14756b381e521f1a2`.
- The last two Preview verification fixes, `b6faf73` and `0d50c7c`, are on `codex/task-assistant-unified-upgrade` and `codex/multi-user-transition`; they were not merged to `main` in this pass because the user asked to verify Preview, not Production/main again.
- Legal API implementation was pushed to `origin/main` and `origin/codex/task-assistant-unified-upgrade` at `cbac82f1e44957d490c0177f585918adf75c8374`.

## Problems found and fixes

1. Semgrep failed on the SaaS PR.

- Symptom: PR `#19` required `semgrep` failed with 7 findings.
- Cause: `scripts/task-assistant-unified-contract-validate.ts` used dynamic `new RegExp(...)` in validator-only code.
- Fix: replaced dynamic regex construction with deterministic string/declaration scans.
- Evidence:
  - `task-assistant-unified-contract-validate.ts` passed after the change.
  - PR `#19` checks later passed: build, lint, typecheck, deps-audit, CodeQL, Semgrep, Vercel.

2. Direct push to SaaS `main` was blocked.

- Symptom: direct push to `origin/main` failed with GitHub rule violation.
- Cause: repo requires PR workflow and required checks for `main`.
- Fix: used PR `#19` and later PR `#20` instead of bypassing branch protection.
- Evidence:
  - PR `#19` merged at `2026-06-22T13:40:37Z`.
  - PR `#20` merged at `2026-06-22T13:54:22Z`.

3. Vercel Production deployment initially failed.

- Symptom: Production deployment for main merge commit failed during prerender.
- Cause: authenticated server pages like `/admin/knowledge`, `/admin/assistant`, `/assistant-test`, `/admin`, and `/ai-settings` were prerendered while cloud backend env was incomplete, raising `CLOUD_ENV_MISSING`.
- Fix: marked those authenticated pages `export const dynamic = "force-dynamic"`.
- Evidence:
  - Local build under `APP_BACKEND_MODE=cloud` without cloud secrets passed after the change.
  - PR `#20` checks passed.
- Boundary:
  - User later clarified that Production is not the acceptance target. Future workers should verify `codex/multi-user-transition` Preview first and only touch Production when explicitly requested.

4. Preview `/preview/assistant` showed `로그인이 필요합니다.` and made a 401 API call.

- Symptom: real browser check on Preview found `401` from `/api/assistant/review-sessions?taskId=preview-assistant-task-001`.
- Cause: the Task Assistant persistence model changed from `/api/assistant/records` auto-save to explicit `/api/assistant/review-sessions`, but the public preview mock still only intercepted the old records API.
- Fix: added `/api/assistant/review-sessions` GET/POST/GET detail/PATCH handlers to `src/app/preview/assistant/preview-client.tsx`.
- Evidence:
  - Final browser check on the latest Preview had no API 4xx/5xx on initial render, generate, or save.

5. Preview mock generation did not complete after clicking `근거 조회 + 의견 생성`.

- Symptom: Playwright waited for `검토 의견을 생성했습니다.` and timed out.
- Cause: `TaskAssistantPanel` initialized from `defaultExecutionMode="mock"`, but the selected-task reset effect changed execution mode back to global `DEFAULT_ASSISTANT_EXECUTION_MODE`, which is `local-codex`.
- Fix: reset execution mode to the component prop `defaultExecutionMode` and added it to the effect dependency list.
- Evidence:
  - Final browser check confirmed the select value is `mock`.
  - Clicking `근거 조회 + 의견 생성` completes and shows `검토 의견을 생성했습니다. 검토기록저장을 눌러 최근 기록에 남기세요.`

6. Deployment polling was delayed once by an incorrect SHA.

- Symptom: polling GitHub deployments for the new Preview commit timed out.
- Cause: one query used a mistyped SHA prefix/body for `b6faf73`.
- Fix: rechecked `git ls-remote` and used the exact remote SHA.
- Evidence:
  - Correct final remote SHA: `0d50c7c8dbb24b5be9331f25894b49700d9aa9ea`.
  - Final deployment status API returned `state: success`.

## Final verification

Local validation:

- `scripts/task-assistant-unified-contract-validate.ts`: all checks passed.
- `tsc --noEmit --pretty false`: passed using a temporary `node_modules` junction to the canonical SaaS dependency folder, then the junction was removed.
- Worktree status after final push: clean.

Legal API validation from the implementation pass:

- `tsx scripts/legal-applicability-validate.ts`: `{"status":"passed","cases":23}`.
- `tsx scripts/legal-hybrid-search-validate.ts`: `{"status":"passed","cases":42}`.
- `tsx scripts/legal-search-api-validate.ts`: `{"status":"passed","cases":33}`.
- `tsc --noEmit --pretty false --typeRoots ...`: passed.

Final Vercel Preview verification:

- Deployment id: `5152789914`.
- Deployment state: `success`.
- Latest status URL checked: `https://architect-start2-m5ydwvou3-chois-projects-7b2948cf.vercel.app/preview/assistant`.
- `curl.exe -I .../preview/assistant`: `HTTP/1.1 200 OK`.
- Playwright browser check on latest status URL:
  - Preview route status `200`.
  - Initial recent review count is `보기 0`.
  - Initial recent review hint says only `검토기록저장` items are shown.
  - File evidence and external web/skill evidence start collapsed.
  - Mock mode is selected by default.
  - No `로그인이 필요합니다.` status on the public preview.
  - Initial render API responses have no 4xx/5xx.
  - Local Codex diagnostics are collapsed when `local-codex` is selected.
  - `근거 조회 + 의견 생성` completes.
  - `검토기록저장` changes recent review count to `보기 1`.
  - Generate/save API responses have no 4xx/5xx.

Visual artifacts captured locally:

- `output/playwright/task-assistant-preview-latest-desktop.png`
- Earlier intermediate screenshots also exist under `output/playwright/`; those are ignored artifacts and are not committed.

## Handoff notes

- Preview is the source of truth for this closeout. Do not infer success from Production.
- For future Task Assistant Preview checks, use the exact deployment/status URL returned by GitHub/Vercel, not an older deployment URL from chat.
- If the user asks to promote the latest Preview fixes to `main`, open a PR from `codex/task-assistant-unified-upgrade` to `main`; do not direct-push because branch protection rejects it.
- If a future browser check sees `로그인이 필요합니다.` on `/preview/assistant`, first inspect `src/app/preview/assistant/preview-client.tsx` mock coverage for new Task Assistant API endpoints.
- If mock generation unexpectedly routes to Local Codex, check `defaultExecutionMode` reset behavior in `TaskAssistantPanel`.

## 2026-06-23 follow-up Preview button audit fix

Additional browser audit on the Preview AI review panel found three mock coverage gaps after the initial handoff:

1. `파일 근거 저장` posted to `/api/files/preview-file-001/analysis`, which the public Preview mock did not intercept, so the real API returned `401` and the panel showed `로그인이 필요합니다.`
2. `외부 근거 저장` posted to `/api/assistant/external-evidence`, but the Preview mock treated every method as a list response. The UI expected `{ externalEvidence }`, so the page could crash after save.
3. After `작업 기록 승인`, the optional `task 기록 업데이트 적용` and `후속 task 생성` buttons posted audit events to `/api/assistant/action-audits`, which also was not mocked and returned `401`.

Fix applied in `src/app/preview/assistant/preview-client.tsx`:

- Promoted the Preview file, external evidence list, and action audit list to mutable in-memory mock state for the page session.
- Added POST handling for `/api/files/preview-file-001/analysis`, returning the updated Preview file with the saved analysis.
- Added POST handling for `/api/assistant/external-evidence`, returning `{ externalEvidence }` and keeping the new evidence visible in the section.
- Added GET/POST handling for `/api/assistant/action-audits`, so task-update and follow-up-task proposal buttons can finish in Preview without requiring auth.
- Normalized file-analysis regions so Preview-supplied save payloads keep the same typed shape as the initial sample file analysis.

Validation after the fix:

- `tsx scripts/task-assistant-unified-contract-validate.ts`: passed.
- `tsc --noEmit --pretty false`: passed using the canonical SaaS `node_modules` through a temporary junction, then the junction was removed.
- Local Playwright smoke on `/preview/assistant`: passed for file evidence save, external evidence save, generate, `검토기록저장`, approval, task update apply, and follow-up task create, with no API 4xx/5xx and no page errors.
