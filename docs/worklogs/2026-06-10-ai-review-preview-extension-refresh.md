# 2026-06-10 AI Review Preview Extension Refresh

Req: Re-audit the latest AI review implementation plans, separate implemented and remaining work, rebuild Architect Browser Assistant for the deployed SaaS Preview URL, and load or refresh it in Chrome.

Mode: Harness Strict, because this touches deployed Preview evidence, Chrome extension runtime, native-host bridge registration, and AI review readiness boundaries.

Plan files reviewed:
- `docs/superpowers/plans/2026-06-09-ai-review-full-pass-plan.md`
- `docs/superpowers/plans/2026-06-09-verified-legal-centralization-plan.md`
- `docs/superpowers/plans/2026-06-09-cross-project-boundary-and-integration-plan.md`
- `docs/superpowers/plans/2026-06-07-ai-review-service-readiness.md`
- `docs/superpowers/plans/2026-06-05-ai-settings-local-codex-implementation-plan.md`
- `docs/superpowers/plans/2026-06-08-daily-cell-document-collaboration-plan.md`
- `D:\architect-workspace\verified-legal-evidence-api\docs\superpowers\plans\2026-06-02-project-wide-context-upload-implementation-plan.md`
- `D:\architect-workspace\architect-browser-assistant\PLAN.md`
- `D:\architect-workspace\architect-browser-assistant\plans\486-official-law-api-task-verification.md`

Current Preview target:
- URL: `https://architect-start2-nqaq1xqdq-chois-projects-7b2948cf.vercel.app`
- Canonical authenticated Preview host: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`
- `/daily` opened in Chrome on the canonical host and showed the authenticated daily task workspace.
- Deployment id: `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`
- Status: Ready
- Branch: `codex/multi-user-transition`
- Deployed commit: local Vercel CLI deployment from `codex/multi-user-transition` worktree after Preview env repair.
- Local SaaS HEAD: `dfa80c162f2761e66f66131cecb7497c0142a8a4`, one commit ahead of origin.
- Build logs confirmed `/daily`, `/preview/daily`, `/api/assistant/retrieve`, `/api/assistant/task-review`, and `/api/assistant/records` routes plus migration gate "Database schema is up to date."
- Alias fix applied: `npx vercel alias set https://architect-start2-j6pxbb0gs-chois-projects-7b2948cf.vercel.app architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf`.
- First alias proof: `npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf` resolved to `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC` before the later env repair redeploy.
- Second alias fix applied after env repair: `npx vercel alias set https://architect-start2-nqaq1xqdq-chois-projects-7b2948cf.vercel.app architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf`.
- Current alias proof: `npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf` resolves to `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`.
- Verified legal API target repaired: `https://verified-legal-evidence-hp5490x70-chois-projects-7b2948cf.vercel.app`, deployment `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`, directly tested with server secret plus Vercel protection bypass and returned HTTP 200.

Implemented and verified:
- SaaS centralized verified legal boundary is implemented. `LAW_OPEN_DATA_OC` is not required by SaaS AI review readiness.
- `npm run ai-review:readiness` passed with `DATABASE_URL`, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` configured by presence only.
- `npm run task-review:validate` passed and confirmed server task-review uses centralized verified legal evidence with no direct law.go.kr verifier.
- `npm run legal-search:validate` passed with 72 cases.
- `npm run project-context:validate` passed across schema, policy, upload, processing, approval, retrieval, review contract, retention, and security validators.
- `npm run typecheck` and `npm run lint` passed in `architect-saas`.
- Verified legal side checks passed: `npm run smoke:legal:preflight`, `npm run test:legal-search-api`, and `npm run test:project-context-boundary`.
- Architect Browser Assistant was first rebuilt for the direct deployment URL, then rebuilt again for the canonical authenticated Preview host with `ARCHITECT_SAAS_ORIGIN=https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`.
- `dist/manifest.json` now scopes `host_permissions`, `content_scripts.matches`, and `web_accessible_resources.matches` to the canonical authenticated Preview host plus `https://www.law.go.kr/*`.
- Browser Assistant `npm run release:check` passed with 8 Vitest files / 28 tests, 22 native/package tests, build, release readiness, and native-host self-test.
- Chrome profile verification found unpacked extension id `ianebfgjhjklildppcocmbmifedapooj` loaded from `D:\architect-workspace\architect-browser-assistant\dist`.
- Native host production-install verification passed for extension id `ianebfgjhjklildppcocmbmifedapooj` and install root `C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host` when the install root was explicit.
- SaaS task panel proof: canonical host `/daily` opened authenticated, selected task `102`, `AI 검토` panel opened, default execution mode was `로컬 Codex 로그인 (기본)`, and the `근거 조회 + 의견 생성` button was present.
- After SaaS env/API repair and redeploy, in-page health check passed all five blocks: extension connection, native host/Codex, credential boundary, centralized verified legal evidence, and answer generation readiness.
- Browser Assistant patch: Local Codex generation now direct-reverifies only legacy `official-law:` evidence. Centralized `verified-legal-search:` evidence and unverified foundation `regulation` seeds no longer trigger direct law.go.kr calls from the extension. `npm run release:check` passed with 8 Vitest files / 30 tests, 22 native/package tests, build, release readiness, and native-host self-test.
- Final in-page AI review proof: after reloading the patched extension and refreshing canonical `/daily`, the task panel health check passed all five blocks and `근거 조회 + 의견 생성` completed on task `102`. The UI showed `최근 검토 기록` count `1`, execution mode `로컬 Codex 로그인`, evidence count `6`, legal evidence count `1`, `검토 의견`, confidence `61%`, WIKI candidate state label `지식 후보`, and status text `검토 의견을 저장했습니다. 신뢰도 61%.`
- Full-PASS continuation on 2026-06-10: DB read-only proof found active project upload source `2005e4bb-11aa-491e-903e-6aa79d79aa07` for project `856f8cfc-24ce-48f5-ab8f-7516769862d6`, active version `ee49089a-edd0-4603-b1d6-537897ab1203`, and active chunk `9964b220-feb0-486d-b527-7bd1f7df7cf1`.
- Project-context retrieval proof: canonical Preview task `117` (`c7d551a2-242a-4441-b8c0-8e7bcaf6f838`) on `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily?taskId=c7d551a2-242a-4441-b8c0-8e7bcaf6f838` produced `review_corpus_trace.corpus_status = chunks_found`, active/candidate/matched/included chunk counts all `1`, `no_relevant_chunk_reason = null`, and `search_error_code = null`. The UI also displayed `프로젝트 업로드 자료 검토 상태` with `chunks_found`.
- Same-task Local Codex save blocker, root-caused: task `117` health check passed extension connection, native host/Codex, credential boundary, centralized verified legal evidence, and answer generation readiness. However, Local Codex generation returned to the retrieved state with `Local Codex generation failed` / message-channel-closed symptoms, and read-only DB checks found no `assistant_task_records` rows for task `117`. A direct installed native-host framed `generate` call reproduced `codex_exec_failed`, proving the problem was inside the installed native-host generate path rather than user login or DB persistence.
- SaaS API fallback was not usable for task `117`: the UI reported `SaaS API Mode is disabled for this project`.
- Local runtime verifier distinction: `node scripts\verify-local-codex-generation.mjs --allow-external --json --strict --timeout-ms 180000` passed in real mode, so Codex CLI login itself is available. The installed native-host failure had two causes: the SaaS page forwarded default model `gpt-5-codex`, which the ChatGPT-account Codex CLI rejects, and the Windows cmd wrapper converted quoted `model_reasoning_effort="medium"` into an invalid `^^medium` value.
- Browser Assistant production readiness: after rebuilding for the canonical Preview origin and regenerating native-host manifests for extension id `ianebfgjhjklildppcocmbmifedapooj`, `npm run release:readiness:production -- --extension-id ianebfgjhjklildppcocmbmifedapooj --allow-unsigned-native-host` passed with `18 pass, 1 warn, 0 fail` when `ARCHITECT_RELEASE_OWNER=gudc0831`, `ARCHITECT_CHROME_WEB_STORE_PUBLISHER=gudc083111@gmail.com`, and `ARCHITECT_NATIVE_HOST_INSTALL_ROOT=C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host` were set.
- Native-host production install proof: `node scripts\verify-local-codex-bridge.mjs --production-install --strict --extension-id ianebfgjhjklildppcocmbmifedapooj --install-root C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host` passed with `13 pass, 0 warn, 0 fail`.
- Browser Assistant native-host fix proof: `native-bridge-contract` and `codex-bridge-host.mjs` now omit `gpt-5-codex` so the CLI selects its account-compatible default model, and native-host reasoning effort is passed as `model_reasoning_effort=medium` without Windows-breaking quotes. `npx vitest run src/content/content-script.test.ts src/runtime/local-runtime-client.test.ts` passed `13` tests, `node --test native-host/codex-bridge-host.node-test.mjs` passed `13` tests, and an installed native-host framed `generate` call with the same `gpt-5-codex` input returned `ok: true` with output and draft summary.
- Browser Assistant source reproducibility: the Local Codex generation fix was committed and pushed to `architect-browser-assistant` `main` as `47d6029` (`Fix Local Codex native generation on Windows`). The local unpacked `dist/manifest.json` was rebuilt after `release:check` and targets only the canonical Preview host plus `https://www.law.go.kr/*`.

Not completed in this pass:
- Chrome extension reload button cannot be clicked by automation because the runtime blocks `chrome://extensions` and forbids indirect workarounds for that blocked browser action. After the rebuilt Preview `dist`, the operator must manually reload Architect Browser Assistant and refresh canonical `/daily` so Chrome uses the fixed content/service-worker bundle before rerunning task `117` same-task Local Codex save proof.
- Authenticated completion smoke was not rerun because the shell does not have `ARCHITECT_SMOKE_COOKIE`, and browser cookie/session stores must not be inspected or recorded.
- Same-task Local Codex saved-record proof for project-context task `117` remains open; retrieval is PASS and the installed native-host generate path is fixed, but no assistant record exists yet until the fixed unpacked extension bundle is reloaded in Chrome and rerun.
- Signed native-host release remains open until a real code-signing subject replaces the explicit unsigned waiver; no production deployment, alias, Web Store upload, or promotion was performed.

Failure:
- Symptom: The operator repeatedly logged in from the direct deployment URL, but opening `https://architect-start2-j6pxbb0gs-chois-projects-7b2948cf.vercel.app/daily` still returned `/login?next=%2Fdaily`.
- Cause: The auth routes call `resolvePublicSiteUrl(requestUrl)`, which prefers configured `NEXT_PUBLIC_SITE_URL` for non-loopback requests. Vercel has `NEXT_PUBLIC_SITE_URL` configured for Preview, so OAuth callback/session issuance follows that canonical host rather than the arbitrary direct deployment host. The observed logged-in host was `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`, whose Vercel inspect resolved to older deployment `dpl_WQ9yzctL24Q78mPa5USh12r3XagU`, not the latest direct deployment `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC`.
- Evidence: `src/lib/auth/public-site-url.ts` returns `NEXT_PUBLIC_SITE_URL` when configured; `src/app/api/auth/google/route.ts` builds the Supabase OAuth `redirectTo` from that public site URL; `src/app/auth/callback/route.ts` redirects post-login through the same public site URL. `npx vercel env ls --scope chois-projects-7b2948cf` lists `NEXT_PUBLIC_SITE_URL` in Preview. Browser checks showed the direct `j6pxbb0gs` URL remained on `/login?next=%2Fdaily` while the branch alias tab was authenticated.
- Fix path: Stop asking for repeated direct-deployment login. Either verify on the canonical Preview host after confirming that host/alias targets the intended latest deployment, or explicitly change the Preview auth canonical host / alias target and redeploy with approval. Then rebuild the Browser Assistant origin to the same canonical host used for authenticated `/daily`.
- Prevention: Before any authenticated exact Preview proof, check URL triad alignment: requested URL, Vercel deployment/alias target, and `NEXT_PUBLIC_SITE_URL`/auth callback host. Do not run or request login until all three point to the same intended runtime, or explicitly document the mismatch as the blocker.

Failure 2:
- Symptom: After fixing the alias and opening authenticated canonical `/daily`, the AI task panel health check returned "로컬 Codex 로그인 확장 연결이 응답하지 않았습니다" and "페이지 연결이 없습니다".
- Cause: The unpacked Chrome extension was already loaded before the second rebuild. `dist/manifest.json` now targets the canonical alias, but Chrome does not apply the changed unpacked manifest/content-script registration until the user clicks reload for that extension and refreshes the SaaS page.
- Evidence: The AI task panel showed the `AI 검토` panel for task `102`, defaulted to `로컬 Codex 로그인 (기본)`, but the "연결 상태 확인" result told the operator to reload Architect Browser Assistant in `chrome://extensions` and refresh `/daily`. Production native-host verification passed with explicit install root, so the remaining blocker is the Chrome extension reload, not the native host registration.
- Fix path: Reload extension id `ianebfgjhjklildppcocmbmifedapooj` from `D:\architect-workspace\architect-browser-assistant\dist`, then refresh `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily` and rerun "연결 상태 확인" before running "근거 조회 + 의견 생성".
- Prevention: After every Browser Assistant origin rebuild, treat extension reload plus SaaS page refresh as a required gate before claiming in-page Local Codex AI review execution.

Failure 3:
- Symptom: After extension reload and alias fix, the task panel health check passed extension/native host, but "공식 법규 검증" returned `VERIFIED_LEGAL_EVIDENCE_API_HTTP_ERROR: Verified Legal Evidence API returned 403`.
- Cause: The latest verified-legal Preview deployment was protected by Vercel Deployment Protection and the API server secret in the deployed Preview did not match the shared secret used by SaaS/local. A direct call without bypass returned 401, and a direct call with bypass plus the local shared secret returned 403 on the old deployment.
- Evidence: `npx vercel project protection verified-legal-evidence-api --scope chois-projects-7b2948cf` showed `all_except_custom_domains` protection and an automation bypass. A new verified-legal Preview deployed with the shared secret as runtime env returned HTTP 200 when called with both `x-verified-legal-evidence-api-secret` and `x-vercel-protection-bypass`. SaaS branch Preview env was then updated for `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`, and redeployed to `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`.
- Fix path: Keep SaaS and verified-legal API Preview on the same shared secret, and keep the verified API protection bypass secret configured on SaaS whenever verified-legal Preview protection is enabled.
- Prevention: For protected verified-legal Preview targets, direct API proof must include both the API secret header and Vercel protection bypass header before blaming SaaS task-review code.

Failure 4:
- Symptom: Actual `근거 조회 + 의견 생성` retrieved six evidence items, including one legal evidence item, but generation/save did not complete. The panel showed direct official-law verification failure from law.go.kr: "사용자 정보 검증에 실패하였습니다."
- Cause: Browser Assistant content script still reverified regulation evidence through the legacy direct law.go.kr fallback before native Local Codex generation. Centralized `verified-legal-search:` evidence from SaaS is already answer-ready verified evidence, and foundation `regulation` seeds are retrieval hints rather than direct official-law records, but the extension initially treated both as direct law.go.kr verification inputs.
- Evidence: The panel showed "서버 중앙 verified legal evidence 검증이 통과했습니다" during health check, then the first generation path showed legal evidence from `verified-legal-search`/law.go.kr and failed on the extension-side official-law API verification message. A second run showed foundation `regulation` seed evidence and failed on the same direct law.go.kr message. Browser Assistant patch added regression tests for centralized `verified-legal-search:` evidence and foundation regulation seeds while keeping direct-recheck behavior for legacy `official-law:` evidence; `npm run release:check` passed.
- Fix: Reloaded the patched unpacked extension, refreshed canonical `/daily`, reran `연결 상태 확인`, and ran `근거 조회 + 의견 생성`. The final run saved a Local Codex assistant record at 61% confidence with no law.go.kr direct verification failure.
- Prevention: Do not require the extension to re-query law.go.kr when the SaaS server already supplied centralized `verified-legal-search:` regulation evidence or when retrieval returns unverified foundation `regulation` seeds. Only legacy `official-law:` evidence is extension-direct recheck material.

Failure 5:
- Symptom: Task `117` project-context retrieval reached `chunks_found`, but Local Codex generation returned `Local Codex generation failed` and no `assistant_task_records` row was created.
- Cause: The installed native-host generate path was failing before returning output. First, the page forwarded default model `gpt-5-codex`, but this ChatGPT-account Codex CLI rejects that explicit model. After removing that model, Windows cmd wrapping still passed quoted reasoning config as an invalid `^^medium` value.
- Evidence: A direct installed native-host framed `generate` call reproduced `codex_exec_failed`. A host-level reproduction showed Codex `400` for `gpt-5-codex`; after dropping the model, the next host-level reproduction showed Codex `400` for invalid reasoning effort `^^medium`. After the fixes, the same installed native-host framed `generate` call returned `ok: true`, `hasOutput: true`, and a draft summary.
- Fix: Browser Assistant now omits `gpt-5-codex` from normalized Codex options so the CLI selects its account-compatible default, and native-host sends `model_reasoning_effort=medium` without quote characters that break through the Windows cmd wrapper. The stable native-host install root was regenerated for extension id `ianebfgjhjklildppcocmbmifedapooj`.
- Prevention: Treat Local Codex health checks as preconditions only; they do not prove generate-time model/config compatibility. Keep an installed native-host framed `generate` smoke in the release checklist whenever AI settings or Windows wrapper arguments change.

Next required actions:
- If an authenticated smoke cookie is intentionally provided to the shell, rerun `npm run ai-review:completion-smoke -- --Origin https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --Cleanup`.
- Manually reload Chrome extension id `ianebfgjhjklildppcocmbmifedapooj` from `D:\architect-workspace\architect-browser-assistant\dist`, refresh canonical `/daily?taskId=c7d551a2-242a-4441-b8c0-8e7bcaf6f838`, and rerun `근거 조회 + 의견 생성` in Local Codex mode until a task `117` assistant record is saved with candidate state.
- Keep production deployment/Web Store promotion separate; readiness passed only for the unsigned interim package gate, not for signed native-host release or Web Store upload.
