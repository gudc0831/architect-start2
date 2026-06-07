Req: Fix Preview `/daily` crash risk when existing task inline edit hits `POST /api/edit-leases` failures, while preserving local-first spreadsheet editing.
Diff: Hardened `src/app/api/edit-leases/route.ts`, `src/lib/api/route-error.ts`, `src/components/tasks/task-workspace.tsx`, and `scripts/daily-editing-responsiveness-verify.ts`.
Why: Edit lease schema, permission, transaction, invalid-input, and non-JSON/server failure cases now return or parse controlled errors; `/daily` keeps inline editing usable in degraded lease-infrastructure failures.
Verify/Time: 2026-06-05 KST: `npx tsx scripts/daily-editing-responsiveness-verify.ts`, `npx prisma validate --schema prisma/schema.prisma`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, `git diff --check`.
Preview: Deployed Preview `dpl_GCw2wsVg9yryLaRHNHvx6PwqgQoN` and moved exact alias `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` to it after approval. Verified `/preview/daily` smoke rendered. Verified exact `/daily` authenticated DB-backed route: `GET /api/auth/me` 200, `GET /api/workspace/bootstrap?orderScope=daily` 200, existing task `007` inline edit opened, `POST /api/edit-leases` 200, edit cancel sent `DELETE /api/edit-leases` 204, browser console errors 0, page stayed on `/daily` with no error overlay or crash.
Follow-up: User reproduced the same visible error page, but the locked evidence showed a different root cause: exact URL had landed on `/?error=invalid_request&error_code=bad_oauth_state...`, `/daily` and `GET /api/auth/me` were 200, and the browser console showed React error 310 on the OAuth failure landing page rather than an edit-lease server failure. Added root OAuth-error query handling in `src/app/page.tsx` and regression assertions in `scripts/daily-editing-responsiveness-verify.ts`. Deployed Preview `dpl_7xpezornuFYerCrtS3ub8wawHXsd` and moved the same exact alias to it. Verified exact bad OAuth state URL no longer shows `This page couldn't load` and reports console errors 0; browser network shows `/login?reason=oauth_state_expired` RSC 200. Verified exact `/daily` again: `GET /api/auth/me` 200, `GET /api/workspace/bootstrap?orderScope=daily` 200, grid rendered, console errors 0.
Follow-up 2: User reproduced the visible page crash again. Fresh browser evidence on the exact alias showed `POST /api/edit-leases` returned 200, then React error 185 (`Maximum update depth exceeded`) from the inline editor overlay anchor layout effect. Root cause was not the API route: the parent overlay passed fresh cell key objects/callbacks every render, and the overlay scheduled anchor state from `useLayoutEffect` without a pre-setState equality guard. Stabilized overlay active/pending cell keys and focus callback in `src/components/tasks/task-workspace.tsx`; added `anchorStateRef` pre-checking in `src/components/tasks/task-inline-editor-overlay.tsx`; added regression assertions in `scripts/daily-editing-responsiveness-verify.ts`. Deployed Preview `dpl_2S8ttycq8QY2DcBhPJ4HwK1ubDe7` and moved exact alias `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` to it. Verified exact OAuth bad-state URL redirects to `/login?reason=oauth_state_expired` with console errors 0. Verified exact `/daily` authenticated DB-backed route in a fresh browser session: `GET /api/auth/me` 200, `GET /api/workspace/bootstrap?orderScope=daily` 200, existing task cell `ㅋㄴㅇㄹㅇㄹ` double-click opened inline textarea, `POST /api/edit-leases` 200, grid stayed rendered, no `This page couldn't load`, console errors 0. Verified exact `/preview/daily` smoke rendered with console errors 0. Recent 10 minute Vercel 500-log query returned no entries.
Follow-up 3: Goal condition narrowed to exact Preview `/daily`: edit the daily list `issueTitle` for 3 different tasks consecutively while server sync is still pending, with no server error and no page crash. Additional evidence showed the React loop was fixed but fast row switching could still drop the middle row save: 3 lease POSTs were 200, but only 2 task PATCHes were observed. Root cause was a selected/draft ref race during blur commit when the next row became selected before the previous row's inline commit resolved. Made inline commit task-id-aware in `src/components/tasks/task-workspace.tsx`: commits now pass the active/overlay task id, resolve the target task from `localFirstActiveTasksRef`, and do not depend solely on the currently selected row. Added regression assertions for task-id-aware commit in `scripts/daily-editing-responsiveness-verify.ts`. Deployed Preview `dpl_2v4oZ8owVEN74S9BpvJinjVPqunm` and moved exact alias `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` to it. Fresh exact Preview verification: `/preview/daily` smoke rendered 7 rows, no error boundary. Authenticated `/daily` test delayed `PATCH /api/tasks/*` responses by 2500ms to keep server sync pending, then edited three task issue titles to `SYNC-MQ0NDT75-1`, `SYNC-MQ0NDT75-2`, `SYNC-MQ0NDT75-3`; final grid showed all three values. Network evidence: 3 `POST /api/edit-leases` responses were 200, 3 `PATCH /api/tasks/{taskId}` responses were 200, 3 `DELETE /api/edit-leases` responses were 204, browser console errors 0, page errors 0, no `This page couldn't load`. Vercel inspect for the exact alias reported `status Ready`, build included `/daily`, `/preview/daily`, and `/api/edit-leases`; recent 10 minute 500 and 503 log queries returned no entries.
Follow-up 4: Added the final reviewer-requested UI hardening after `dpl_2v4...`: same-column inline saves now track `saving` by task id plus column key instead of disabling the entire `issueTitle` column while the previous row is syncing. This preserves the goal condition where the user edits 3 different issue-title cells while previous server sync is still pending. Validation after this source change passed: `npx tsx scripts/daily-editing-responsiveness-verify.ts`, `npx prisma validate --schema prisma/schema.prisma`, `npm run lint` (one pre-existing unrelated hook warning in `src/components/project-context/project-materials-page.tsx`), `npx tsc --noEmit --incremental false`, `npm run build`, and `git diff --check` (line-ending warnings only). Deployed Preview `dpl_F314W2R1utUTexpDkH6rUGnfntx5` and moved the exact alias to it; Vercel inspect reported `Ready` and the build includes `/daily`, `/preview/daily`, and `/api/edit-leases`. Fresh exact `/daily` completion verification is blocked by authentication state, not by code: the previous stored browser state now triggers Supabase `refresh_token_already_used` in edge middleware, a clean helper reaches Google account identifier, and no refreshed Playwright storage state has been saved yet. `/api/auth/google?next=/daily` still builds an exact-origin `/auth/callback`; no test/e2e login env names exist. Do not claim final goal completion until a fresh authenticated exact `/daily` run on `dpl_F314...` repeats the 3 task issue-title edits with delayed `PATCH /api/tasks/*` and confirms 3 lease POSTs plus 3 task PATCHes without server errors or page crash.
Follow-up 5: User completed Google login in a dedicated non-automated Chrome profile at `output/browser-check/auth-profiles/exact-preview-chrome`; recorded the rule in `AGENTS.md` so future exact Preview auth verification uses only that profile and never asks for pasted cookies or tokens. Fresh exact Preview verification on `dpl_F314W2R1utUTexpDkH6rUGnfntx5` passed. `/preview/daily` smoke rendered 7 rows and no error boundary. Authenticated `/daily` opened on the exact host with `GET /api/auth/me` 200, `GET /api/workspace/bootstrap?orderScope=daily` 200, and 9 rows. The browser test delayed `PATCH /api/tasks/*` by 2500ms, then edited three different issue-title cells to `SYNC-MQ0R008B-1`, `SYNC-MQ0R008B-2`, and `SYNC-MQ0R008B-3`. Evidence: 3 `POST /api/edit-leases` responses were 200, 3 task `PATCH` responses were 200 for task ids `62329f8e-d20b-4f46-abf3-59c63a4cc686`, `4330e44a-ffaa-4a8c-a900-6cdbeac87bf8`, and `c8811783-0f2e-4d34-9536-9d25e3e84a31`; final grid values matched all three intended values; editor disabled checks were `[false,false,false]`; browser console errors 0, page errors 0, route harness errors 0, API server errors 0, no `This page couldn't load`. Fresh 10 minute Vercel 500 and 503 log queries returned no entries.

## Detailed postmortem

### Final problem statement

The user-visible symptom looked like one problem: opening or editing the exact Preview `/daily` page could end in the Next.js error boundary (`This page couldn't load`). The actual investigation showed several separate failure classes that could produce a similar visible symptom:

- stale or wrong exact Preview alias target;
- OAuth bad-state callback landing on the root route with `?error=invalid_request`;
- `/api/edit-leases` database/runtime failure handling that could return uncontrolled errors;
- inline editor overlay render loop after lease acquisition;
- fast consecutive same-column edits losing a blur commit or temporarily disabling the next row editor;
- verification blocked by stale auth state or Playwright-controlled Google login.

The final completion condition was narrowed to the exact user workflow: on `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily`, while server sync is still pending, edit the daily list `issueTitle` for three different tasks consecutively and observe no server error and no page crash.

### What was changed

- `src/app/api/edit-leases/route.ts`
  - Added `maxDuration = 30`.
  - Added UUID validation for lease target ids (`EDIT_LEASE_TARGET_ID_INVALID`).
  - Replaced broad expired-lease cleanup with bounded, best-effort cleanup scoped to the current project and target.
  - Added retry handling for Prisma unique conflicts (`P2002`) during lease acquisition.
  - Classified retryable transaction/conflict/database failures into controlled JSON responses instead of letting infrastructure errors leak into generic route failures.
  - Preserved `calendarLinked` in the editable field allowlist after review found a mismatch risk.

- `src/lib/api/route-error.ts`
  - Added `classifyRouteDatabaseError` for Prisma and SQLSTATE cases used by this workflow: `P2021`, `P2022`, `P2028`, `P2034`, `P2025`, `P2003`, `42501`, `22P02`, `40001`, and `40P01`.
  - Added secret-safe sanitization for route error details. Logs and Preview debug metadata now avoid stack traces, DB URLs, tokens, secrets, and unsafe meta fields.

- `src/components/tasks/task-workspace.tsx`
  - Made edit-lease acquisition return `acquired`, `degraded`, or `blocked` instead of a boolean, so retryable/infrastructure lease failures do not force a full page failure or table-wide lock.
  - Added defensive API response parsing so HTML or empty JSON responses from infrastructure failures are recoverable UI errors.
  - Deduplicated same-cell pending lease requests.
  - Made inline save task-id-aware. Blur commits now pass the active/overlay task id and resolve the target from `localFirstActiveTasksRef`, not only from the currently selected row.
  - Changed same-column saving from column-global state to task+column state (`inlineSavingCells`), so row 2 and row 3 `issueTitle` editors remain usable while row 1 is still syncing.
  - Stabilized overlay active/pending cell objects and focus callback.

- `src/components/tasks/task-inline-editor-overlay.tsx`
  - Added `anchorStateRef` and anchor-rect equality checks before `setAnchorState`, preventing a layout-effect update loop when the parent rerenders during inline edit.

- `scripts/daily-editing-responsiveness-verify.ts`
  - Added static regression coverage for edit-lease route hardening, route error classification, sanitized logging, overlay stability, task-id-aware commit, per-cell saving, and `calendarLinked` allowlist consistency.

- `AGENTS.md`
  - Added exact Preview auth session rules so future authenticated checks reuse the dedicated non-automated Chrome profile and do not ask the user to paste cookies or tokens.

### Attempts, failures, and why they were not enough

1. Initial route hardening targeted `POST /api/edit-leases`.

   Evidence supported this as a real risk: the original route had broad cleanup, less bounded error handling, and no explicit classification for schema, permission, invalid input, transaction, and conflict cases. The fix was useful, but it did not fully solve the user-visible crash. After deployment, the user could still reproduce a similar page failure, and fresh browser evidence later showed some edit-lease POSTs were returning 200 while the page still crashed. That proved the remaining crash was not purely an edit-lease server failure.

2. The `?error=invalid_request` page was treated as a separate OAuth/root-route failure.

   The user's screenshot showed the exact host at `/?error=invalid_request...`, not `/daily`. Browser evidence showed `/daily` and `GET /api/auth/me` could be healthy while the root error URL rendered the app error boundary. The fix redirected OAuth bad-state root queries to a login recovery path instead of rendering the protected home route. This removed one visible error-boundary path, but the user later reproduced a crash during inline edit, so this was a separate issue, not the final edit workflow failure.

3. The inline editor overlay render loop was fixed after React error 185 evidence.

   Fresh exact Preview evidence showed `POST /api/edit-leases` 200, followed by React error 185 (`Maximum update depth exceeded`). The cause was unstable overlay cell/callback identities plus anchor measurement state updates from `useLayoutEffect` without a pre-setState equality guard. Memoizing overlay cell keys/callbacks and adding `anchorStateRef` equality checks stopped the loop. This fixed the page crash path, but the final chained-edit requirement still failed because fast row switching could drop a save.

4. Task-id-aware commit fixed the dropped middle save.

   The next exact Preview run produced 3 lease POSTs but only 2 task PATCHes. The cause was a selected/draft race: blur commit for the previous row could run after the next row had already become selected, so the save logic could resolve the wrong or missing target. Passing the active cell task id through overlay commit and resolving from `localFirstActiveTasksRef` fixed that class. It still was not enough for the final condition because the same `issueTitle` column could remain disabled globally while a previous row was syncing.

5. Per-cell saving state fixed continuous same-column editing.

   Review caught that `inlineSavingFields[issueTitle]` was still column-global. Under delayed server sync, row 1's pending save could mark the entire `issueTitle` column as saving, blocking row 2 or row 3. The final UI hardening changed this to `inlineSavingCells[taskId:columnKey]`. The final verification confirmed all three editors were enabled before fill (`[false,false,false]`), even while PATCH responses were delayed by 2500ms.

6. Playwright-controlled Google login was the wrong auth setup.

   The first user-assisted auth helper launched Playwright-controlled Chrome. Google rejected it as an unsafe browser. Reusing old storage state was also wrong because Supabase logged `refresh_token_already_used` for the old session. Copying the user's default Chrome profile was rejected as a verification strategy because cookies were Chrome `v20` encrypted and because default-profile automation is unsafe and not isolated. The final auth method was a dedicated normal Chrome profile at `output/browser-check/auth-profiles/exact-preview-chrome`, opened without Playwright automation for the login step. After the user logged in there, the same profile was reused for headless exact Preview verification.

### Final evidence

- Exact deployment alias verified on `dpl_F314W2R1utUTexpDkH6rUGnfntx5`.
- Exact `/preview/daily` smoke: 7 rows, error boundary 0.
- Exact authenticated `/daily`: exact host, final path `/daily`, query false, 9 rows.
- Auth and bootstrap: `GET /api/auth/me` 200 and `GET /api/workspace/bootstrap?orderScope=daily` 200.
- Test kept server sync pending by delaying `PATCH /api/tasks/*` responses by 2500ms.
- Three task issue-title edits:
  - `62329f8e-d20b-4f46-abf3-59c63a4cc686` -> `SYNC-MQ0R008B-1`
  - `4330e44a-ffaa-4a8c-a900-6cdbeac87bf8` -> `SYNC-MQ0R008B-2`
  - `c8811783-0f2e-4d34-9536-9d25e3e84a31` -> `SYNC-MQ0R008B-3`
- Network:
  - 3 `POST /api/edit-leases` responses were 200.
  - 3 `PATCH /api/tasks/{taskId}` responses were 200.
  - 5 `DELETE /api/edit-leases` responses were 204.
- UI:
  - Final grid values matched all three intended values.
  - Editor disabled checks before fill were `[false,false,false]`.
  - `This page couldn't load` count was 0.
- Error surfaces:
  - browser console errors 0;
  - page errors 0;
  - route harness errors 0;
  - API server errors 0;
  - fresh 10 minute Vercel 500 and 503 log queries returned no entries.

### Failure learning and prevention

- Do not classify a `/daily` report from the screenshot alone. First separate exact alias target, route path, OAuth query, auth state, network route, console/page error, and server logs.
- Do not accept a single edit/cancel as proof for `/daily` local-first behavior. The required regression is chained editing of at least three different rows while server sync is pending.
- Do not fix spreadsheet races with a full refresh, table-wide disable, or server-response-first local update. The correct shape is local-first UI with narrow pending state, recoverable failures, and affected-cell reconciliation.
- Do not use a column-global saving flag for inline spreadsheet columns. Same-column edits in different rows must remain independent.
- Do not let inline blur commits infer their target from only the currently selected task. Pass the active cell task id through the commit path.
- Do not update overlay anchor state from layout effects unless the next state is compared to the previous state before calling `setState`.
- Do not use Playwright-controlled Chrome for Google OAuth login on this Preview. Use the dedicated non-automated Chrome profile and keep the user's default browser profile out of automation.

### Failure learning records

1. Edit-lease route failure handling

   - failure: `/api/edit-leases` could expose uncontrolled infrastructure/database failures, and that risk originally looked like the likely crash source.
   - cause: the route had broad cleanup, no UUID validation, narrow conflict handling, and no explicit Prisma/SQLSTATE classifier for Preview DB failure modes.
   - fix: bounded cleanup, `maxDuration`, UUID validation, retryable conflict handling, and classified sanitized database errors.
   - evidence: static regression assertions cover edit-lease route hardening and classifier cases; later exact Preview runs showed 3 lease POSTs returning 200.
   - prevention: keep edit-lease failures controlled and recoverable, but do not stop diagnosis there when browser evidence points to React or auth errors.

2. OAuth bad-state root crash

   - failure: the page showed `This page couldn't load` at the exact host with `?error=invalid_request...`.
   - cause: an OAuth bad-state callback could land on the protected root route instead of a safe login recovery path.
   - fix: root OAuth-error query handling redirected to login recovery.
   - evidence: exact bad-state URL stopped rendering the error boundary and produced `/login?reason=oauth_state_expired` with console errors 0.
   - prevention: route path matters; a screenshot on the exact host is not enough to classify a `/daily` editing regression.

3. Inline editor overlay maximum-update-depth crash

   - failure: after a successful lease POST, the page still crashed with React maximum-update-depth behavior.
   - cause: fresh overlay cell objects/callbacks and layout-effect anchor state updates could repeatedly schedule state changes.
   - fix: memoized overlay cell keys/callbacks and added `anchorStateRef` plus rect equality checks before `setAnchorState`.
   - evidence: subsequent exact `/daily` runs opened inline editors after lease POST 200 without the error boundary.
   - prevention: overlay measurement code must compare next anchor state before writing React state.

4. Fast row-switch save loss

   - failure: chained edit produced 3 lease POSTs but only 2 task PATCHes.
   - cause: blur commit could read the newly selected row or stale draft instead of the row whose editor was being committed.
   - fix: commit now carries the active cell task id and resolves the target from `localFirstActiveTasksRef`.
   - evidence: final exact Preview run produced 3 task PATCHes for 3 distinct task ids.
   - prevention: inline blur/save code must not infer target identity only from selected task state.

5. Same-column pending-state lock

   - failure: while one `issueTitle` save was pending, the next row's same-column editor could be treated as saving.
   - cause: `inlineSavingFields` was column-global.
   - fix: added `inlineSavingCells` keyed by `taskId:columnKey`.
   - evidence: final exact Preview run delayed PATCH responses by 2500ms and all three editor disabled checks before fill were false.
   - prevention: spreadsheet-like inline pending state must be scoped to the affected cell or entity, not an entire column or table.

6. Auth verification dead end

   - failure: completion verification was blocked after code/deploy because the stored session was stale and Google rejected Playwright-controlled Chrome.
   - cause: old Supabase storage state hit `refresh_token_already_used`, and Google OAuth rejected automation-controlled login.
   - fix: opened a dedicated normal Chrome profile at `output/browser-check/auth-profiles/exact-preview-chrome`, had the user log in there, then reused only that profile for verification.
   - evidence: the dedicated profile opened exact authenticated `/daily` with `auth/me` 200, bootstrap 200, and 9 rows.
   - prevention: use the dedicated non-automated Chrome profile for exact Preview auth; never request pasted cookies or tokens and never automate the user's default profile.

### Reviewer notes

- Spec compliance: the final verification used the exact Preview URL, not localhost or a neighboring deployment URL; `/preview/daily` was only smoke; `/daily` was authenticated and DB-backed.
- Local-first behavior: the final test intentionally delayed server PATCH responses and still performed three consecutive edits. No full refresh, table disable, global pending flag, or server-response-first update was used.
- Secret safety: auth cookies, refresh tokens, DB URLs, and env values were not printed. Temporary env/auth files were removed after use.
- Remaining risk: `git status` still shows some files as modified because of Windows line-ending/stat noise, but `git diff --name-only` limits the real source diff to the files listed above.
