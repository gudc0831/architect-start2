# User Feature Test Matrix

- Updated: 2026-06-29
- Scope: Current `architect-saas` user-facing SaaS flows
- Default target: Preview or local test project only
- Production rule: Do not run production data-changing tests unless explicitly approved

## Purpose

This matrix turns broad user QA into auditable test passes. It separates:

- safe local contract checks
- browser E2E checks that write disposable project data
- external-dependent checks such as AI review, file analysis, OCR, and Browser Assistant/Local Codex
- destructive checks that require pre-created disposable records

## Execution Gates

| Gate | What can run | Approval needed | Notes |
| --- | --- | --- | --- |
| `G0` local static/contract | `typecheck`, route/contract validators, static smoke scripts | no | No browser login and no intentional DB writes |
| `G1` browser read-only | navigation, filters, open/close panels, responsive checks | no if already logged in to a test target | Stop if login is required |
| `G2` browser disposable writes | create/edit/delete/restore/upload in a named test project | yes | Must use a disposable project and timestamped test records |
| `G3` external AI/file analysis | AI review, Local Codex bridge, OCR/file extraction, external evidence | yes | May depend on secrets, extension, local runtime, or provider quotas |
| `G4` destructive cleanup | permanent delete, archive/reject uploaded material, bulk cleanup | yes | Only target records created during the same QA run |

## Test Data Contract

Use one disposable project and timestamp prefix for every written artifact:

- Project: `QA Disposable - <date>` or another user-approved test project
- Prefix: `qa-<YYYYMMDD-HHmm>-`
- Task title: `<prefix>task-main`
- File names: `<prefix>sample.pdf`, `<prefix>sample.xlsx`, `<prefix>sample.txt`
- External evidence title: `<prefix>external-evidence`
- Project wiki title: `<prefix>project-wiki`

Cleanup must remove or archive only artifacts with the active prefix.

## Local Validator Baseline

Run before browser QA:

```powershell
npm run typecheck
npm run daily:editing:verify
npm run daily:cell-collaboration:verify
npm run task-review:validate
npm run task-assistant:unified:validate
npm run project-wiki:validate
npm run project-wiki:behavior:validate
```

Run with an explicit target or fixture:

```powershell
npm run daily:navigation-pending-sync:verify -- --url <local-or-preview-url>
npm run task-export:verify -- --file <downloaded-xlsx-path>
npm run task-export:verify -- --url <authenticated-export-endpoint>
npm run ai-review:readiness
npm run ui-copy:validate
```

`ai-review:readiness` is local but environment-dependent. Treat a missing `VERIFIED_LEGAL_SEARCH_API_URL` as an external configuration blocker for legal/regulation AI review, not as a UI regression.

`ui-copy:validate` runs typecheck, lint, build, and the UI copy validator. Its typecheck/lint/build can pass while the copy validator fails if `output/ui-copy/translator-status.json` is missing.

Optional broader checks when time allows:

```powershell
npm run project-context:validate
npm run knowledge-wiki:data-contract:validate
npm run knowledge-wiki:security:validate
npm run structured-knowledge:ui-contract:validate
```

## Baseline Run - 2026-06-29

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | pass | `tsc --noEmit` completed |
| `npm run daily:editing:verify` | pass | Daily editing/local outbox guardrails passed |
| `npm run daily:cell-collaboration:verify` | pass | Cell-document static guard passed |
| `npm run task-review:validate` | pass | Task review centralized evidence checks passed |
| `npm run task-assistant:unified:validate` | pass | Unified assistant contract checks passed |
| `npm run project-wiki:validate` | pass | Project wiki contract checks passed |
| `npm run project-wiki:behavior:validate` | pass | Project wiki behavior checks passed |
| `npm run daily:navigation-pending-sync:verify` | blocked | Requires `--url` or `PREVIEW_BASE_URL` |
| `npm run task-export:verify` | blocked | Requires `--file` or `--url` |
| `npm run ai-review:readiness` | blocked | `VERIFIED_LEGAL_SEARCH_API_URL` missing; other checked env gates passed or warned as expected |
| `npm run ui-copy:validate` | partial | typecheck/lint/build passed; UI copy validator failed because `output/ui-copy/translator-status.json` was missing |

## Browser Read-Only Run - 2026-06-29

Target: `http://127.0.0.1:3024`

Current data state:

- `backendMode`: `local`
- `dataMode`: `local-file`
- `uploadMode`: `local-dev-storage`
- `hasSupabase`: `false`
- local data guard: locked with `LOCAL_DATA_FINGERPRINT_CHANGED`

Because the local data guard is locked, this pass did not execute task create/edit/delete/upload writes. Running those flows requires an explicit local data guard confirmation and disposable QA prefix.

| Area | Result | Evidence |
| --- | --- | --- |
| Daily | pass | `/daily` loaded the workspace, task creation form, 3 task rows, detail panel, export button, and selected task context |
| AI review open | pass | `AI 검토` opened the Task assistant with question input, step indicator, selected task context, and disabled approval action before generation |
| Board | pass | `/board` loaded status counts and cards for the 3 current tasks with console errors `0` |
| Calendar | pass | `/calendar` loaded the month view for 2026-06 with controls and no blank screen |
| Trash | pass | `/trash` loaded empty-trash state, selection controls, and destructive action buttons with console errors `0` |
| AI Settings | partial | `/ai-settings` loaded and showed saved personal settings, but Browser Assistant bridge status is disconnected in this local session |
| Materials | fixed/pass | Initial `/materials` load showed `프로젝트 자료 목록을 불러오지 못했습니다` because `GET /api/projects/project-local/materials/uploads` returned `DATABASE_URL_MISSING` 503. Added non-cloud GET fallback; recheck returns 200 and console errors `0` |
| Admin | fixed/pass | Initial `/admin` load emitted 503s for access request and invitation GET APIs. Added non-cloud GET fallbacks; recheck returns 200 and console errors `0` |

Patch verification after the browser findings:

```powershell
npm run typecheck
git diff --check
npm run worklog:check
```

## Browser Write Run - 2026-06-29

Target: `http://localhost:3024`

Run boundary:

- Data target: local-file backend only
- Data guard: explicitly approved local disposable write QA, run with guard warn mode
- Prefix: `qa-20260629-1614`
- Cleanup: all QA tasks and uploaded files created in this run were permanently deleted after trash/restore verification

| Area | Result | Evidence |
| --- | --- | --- |
| Daily create | pass | Created `task_7r0gys4a` as task `004` with title `qa-20260629-1614-task-main`; server returned `201` |
| Detail edit | pass | Updated title, detail, decision, and status through the detail panel; `/api/tasks?orderScope=daily` readback returned version `2`, status `in_review`, and edited text |
| Text content sync | pass | Detail and decision text persisted without `동기화 실패`; the patched text-cell document flow remained active for text-backed fields |
| File upload | pass | Uploaded `qa-20260629-1614-sample.txt`; `/api/upload` returned `201`, `/api/files?taskId=task_7r0gys4a` returned `file_1loq124n`, and reload showed the file name in the UI |
| Excel export | fixed/pass | Initial workbook verification failed because newly-created tasks could persist `siblingOrder: -1`. Patched task creation to normalize negative optimistic insert order by rebasing siblings to `0..n`; post-fix `task-export:verify` passed with 5 rows before cleanup and 3 rows after cleanup |
| AI review open | pass | Opened the assistant panel for selected task `004`; panel showed the edited task title/detail, default question input, file evidence count, and `근거 조회 + 의견 생성` action |
| AI review generation | blocked | Not executed because the local readiness gate lacks `VERIFIED_LEGAL_SEARCH_API_URL`; this remains an environment blocker, not a UI open regression |
| Trash | pass | `POST /api/tasks/task_7r0gys4a/trash` removed the task from active list, put it in trash, and moved its attached file to trash |
| Restore | pass | `POST /api/tasks/task_7r0gys4a/restore` returned the task and file to active scope |
| Permanent cleanup | pass | Permanently deleted `task_7r0gys4a`, `task_ixdt5tos`, and attached `file_1loq124n`; active and trash QA prefix queries returned empty lists |

Patch verification after the write run:

```powershell
npm run task-export:verify -- --file output\qa\qa-20260629-1614-export-after-fix.xlsx --expect-rows 5
npm run task-export:verify -- --file output\qa\qa-20260629-1614-export-after-cleanup.xlsx --expect-rows 3
```

## Browser E2E Matrix

| ID | Area | User scenario | Gate | Automation | Existing validator | Pass condition |
| --- | --- | --- | --- | --- | --- | --- |
| `UF-01` | Auth/project entry | Login, land in selected project, switch or verify current project | `G1` | Playwright headed | `root-entry:smoke` | `/daily` or `/auth/post-login` resolves to usable workspace |
| `UF-02` | Navigation | Move between Board, Daily, Calendar, Trash, Materials, AI Settings | `G1` | Playwright headed | `workspace-navigation-harness.ts` coverage exists | Route changes, back/forward works, no blank screen |
| `UF-03` | Daily create | Create a new task/question row from quick create | `G2` | Playwright headed | `daily:editing:verify` | Temporary row appears quickly, server sync reaches non-error state |
| `UF-04` | Daily inline edit | Edit title, due date, status, category, assignee, content, decision | `G2` | Playwright headed | `daily:editing:verify`, `daily:cell-collaboration:verify` | Values persist after refresh; no `동기화 실패` banner |
| `UF-05` | Detail edit | Select a task, edit fields in detail panel, save or autosave | `G2` | Playwright headed | `daily:editing:verify` | Detail and row values match after refresh |
| `UF-06` | Text content collaboration | Edit `issueTitle`, `issueDetailNote`, `decision` text fields | `G2` | Playwright headed, optional two-window | `daily:cell-collaboration:verify`, `daily:cell-collaboration:two-window` | Cell-document API persists text; no direct task PATCH block |
| `UF-07` | Reorder | Drag/reorder daily rows repeatedly | `G2` | Playwright headed | `daily:editing:verify` | Row order remains interactive and persists after refresh |
| `UF-08` | Delete/trash | Move a QA task to trash | `G2` | Playwright headed | `daily:editing:verify` | Active row disappears, trash row appears |
| `UF-09` | Restore | Restore the QA task from Trash | `G2` | Playwright headed | `daily:editing:verify` | Row returns to active list |
| `UF-10` | Permanent delete | Permanently delete only QA-created task | `G4` | Playwright headed | none dedicated | Task is gone from Trash and not recoverable in UI |
| `UF-11` | Export | Export Daily list to Excel | `G1/G2` | Playwright or script | `task-export:verify` | Download starts and workbook contains expected columns |
| `UF-12` | File upload to task | Upload a sample file to a QA task | `G2` | Playwright headed | route/service coverage via typecheck | File pill appears and persists after refresh |
| `UF-13` | File version/preview/download | Upload next version, preview/download, delete or restore file | `G2/G4` | Playwright headed | file service type coverage | Version label and file actions work without broken links |
| `UF-14` | Materials upload | Upload project material, preview extraction status, approve/reject/archive if role allows | `G2/G3/G4` | Playwright headed | `project-context:validate` | Upload row appears; status transition reflects allowed role |
| `UF-15` | AI review open | Open `AI 검토` panel with selected task | `G1` | Playwright headed | `task-assistant:unified:validate` | Panel opens, selected task context is shown |
| `UF-16` | AI review retrieve/generate/save | Ask a question, retrieve evidence, generate/save session | `G3` | Playwright headed/manual provider confirmation | `ai-review:readiness`, `task-review:validate` | Review result appears and saved session is listed |
| `UF-17` | AI review edit/delete/restore | Edit/delete/restore temporary review session | `G2/G4` | Playwright headed | `task-assistant:unified:validate` | Session state changes and status copy matches action |
| `UF-18` | AI usage record | Verify usage record after AI review | `G3` | Script plus UI | `assistant:verify-record`, `assistant:verify-usage` | Usage record exists without exposing secrets |
| `UF-19` | External evidence | Add/edit/delete external evidence from assistant panel | `G2/G4` | Playwright headed | `task-assistant:unified:validate` | Evidence appears in retrieval list and can be cleaned up |
| `UF-20` | Project wiki from assistant | Create/update project wiki draft from review output | `G2` | Playwright headed | `project-wiki:validate`, `project-wiki:behavior:validate` | Draft or item is linked to source task/review |
| `UF-21` | Approved/shared wiki | Verify approved wiki candidate/list/detail flow | `G2/G3` | Playwright headed | knowledge wiki validators | Candidate/detail appears with expected source links |
| `UF-22` | AI Settings | Change non-secret assistant settings and restore defaults | `G2` | Playwright headed | `ai-review:readiness` | Setting persists and can be restored |
| `UF-23` | Pending sync reload | Create/edit, refresh before sync completes, retry/recover | `G2` | Playwright headed | `daily:navigation-pending-sync:verify` | Outbox survives reload and resolves without data loss |
| `UF-24` | Permission boundaries | Viewer/member/manager/admin positive/negative flows | `G2` with fixtures | Playwright headed/API probes | prior preview RBAC matrix | Forbidden actions show access errors; allowed actions work |
| `UF-25` | Responsive UI | Desktop 1440/1280/1024 plus mobile 390 checks for Daily and assistant panel | `G1/G2` | Playwright headed screenshots | `verify-browser-ui` skill workflow | No clipped primary controls or blocked workflows |

## Recommended First Live QA Run

Run this smaller pass first because it covers the highest-risk user loop without touching irreversible external systems:

| Step | IDs | Target |
| --- | --- | --- |
| 1 | `UF-01`, `UF-02`, `UF-25` | Enter workspace and verify main navigation/layout |
| 2 | `UF-03`, `UF-04`, `UF-05`, `UF-06` | Create and edit a disposable task, including content text |
| 3 | `UF-07`, `UF-08`, `UF-09`, `UF-23` | Reorder, trash, restore, reload/pending sync recovery |
| 4 | `UF-11`, `UF-12`, `UF-13` | Export and file attach/version/download using disposable files |
| 5 | `UF-15` | Open AI panel and confirm selected-task context without generating |

Do not run `UF-10`, `UF-14`, `UF-16`, `UF-18`, `UF-21`, or provider-backed file analysis until the target project and external-cost boundary are approved.

## Approval Request Template For Live E2E

```text
승인 필요:
- 작업: disposable project에서 브라우저 E2E 쓰기 테스트 실행
- 대상: <Preview/local URL>, project=<project name/id>, prefix=<qa prefix>
- 지금 필요한 이유: 작성/수정/삭제/업로드/AI 패널 흐름을 실제 사용자 동작으로 검증
- 위험: 테스트 task/file/wiki/assistant 기록이 생성됨. AI/파일 분석 단계는 외부 API나 Local Codex 의존성이 있을 수 있음.
- 되돌리기: prefix가 붙은 테스트 데이터만 휴지통 이동/복원/영구삭제 또는 archive 처리
- 검증: Playwright screenshot/state, validator command output, route/status evidence
```
