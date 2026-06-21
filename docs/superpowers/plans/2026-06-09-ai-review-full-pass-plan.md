# AI Review Full PASS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Centralization correction, 2026-06-09 KST:** legal readiness in `architect-saas` is now superseded by `2026-06-09-verified-legal-centralization-plan.md`. `LAW_OPEN_DATA_OC` must not be added to SaaS; SaaS waits on `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` for centralized verified legal API integration.

**Goal:** `architect-saas`의 AI 검토 기능을 실제 서비스 사용 기준으로 모두 PASS 처리한다. 완료는 정적 검증만이 아니라 `/daily` AI 검토 버튼 경로, 서버 AI review API, 프로젝트 업로드 컨텍스트, 공식 법령 검증, Local Codex/Browser Assistant, saved assistant record, WIKI candidate 경계가 모두 증거로 확인될 때만 인정한다.

**Architecture:** Harness Engineering Strict 모드로 진행한다. `choi`가 최종 판단을 맡고, `hy`는 SaaS/API 검증, `ung`은 Browser Assistant/Local Codex 검증, `ch`는 법령 근거/verified legal 경계, `ul`은 릴리즈/로그/증거 정리를 담당하는 역할 레이블이다. 프로젝트 컨텍스트는 `projectContextChunks`로, 법령 근거는 `legalEvidence`로 유지하며 서로 합치지 않는다. Vercel/DB/secret/auth/real external generation은 별도 승인 게이트를 둔다.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres, Supabase auth/session, Vercel Preview, Architect Browser Assistant MV3/native host, Local Codex CLI, verified-legal-evidence-api, PowerShell smoke scripts, Superpowers planning/execution workflow.

---

## Current State

- **2026-06-09 status refresh:** local readiness and boundary validators now pass with centralized verified legal configuration. `npm run ai-review:readiness` reports `ready` with `DATABASE_URL`, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` configured by presence only, and confirms `LAW_OPEN_DATA_OC` is absent from `architect-saas`. The remaining full-PASS risk is deployed Preview proof that the runtime uses a non-loopback verified legal API URL and matching server secret; do not treat local readiness as production signoff.
- **2026-06-09 deployed Preview refresh:** direct Preview `https://architect-start2-eye0g2pyv-chois-projects-7b2948cf.vercel.app/daily` maps to deployment `dpl_3yNMpLqHb4BtDKc2Q2YL1CKrNBYB` at commit `f931be7`. Runtime task-review proof returned HTTP `409`/`blocked` because `VERIFIED_LEGAL_EVIDENCE_API_URL` is missing in the deployed SaaS Preview env. AI review full PASS remains blocked until Preview has the centralized verified legal API URL and secret configured and rerun proof shows answer-ready legal evidence.
- **2026-06-10 earlier Preview runtime refresh:** Preview `/daily` target `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app/daily`, deployment `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`, branch/worktree `codex/multi-user-transition`, verified code SHA `5724068f543b1f863f163e15a71434f18018de4c`. SaaS Preview env had encrypted `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`; `LAW_OPEN_DATA_OC` remained absent from SaaS. Runtime completion smoke passed with auth `200`, task-review `200`, retrieve evidence count `8`, WIKI approval attempted `false`, WIKI candidate created `false`, saved assistant record `201`/candidate, saved assistant record id `8b92593c-9008-401a-ae09-125774819a40`, and cleanup `true`.
- **2026-06-10 env follow-up:** `architect-start2` Preview branch `codex/multi-user-transition` was reconfigured with non-empty `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` values and redeployed to `https://architect-start2-j6pxbb0gs-chois-projects-7b2948cf.vercel.app`, deployment `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC`, status Ready. `/preview/daily` returned HTTP `200`. This did not add `LAW_OPEN_DATA_OC` to SaaS and did not print secret values.
- **2026-06-10 canonical auth host and extension closure:** authenticated Preview proof now uses canonical host `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`, because OAuth/session issuance follows the configured Preview public site URL rather than arbitrary direct deployment URLs. The canonical alias was repointed to deployment `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`, built from local SaaS HEAD `dfa80c162f2761e66f66131cecb7497c0142a8a4`. The verified legal API target was repaired to `https://verified-legal-evidence-hp5490x70-chois-projects-7b2948cf.vercel.app`, deployment `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`, and direct server-secret plus Vercel-protection-bypass proof returned HTTP `200`.
- **2026-06-10 in-page AI review execution proof:** after rebuilding Architect Browser Assistant for the canonical host, reloading extension `ianebfgjhjklildppcocmbmifedapooj`, and refreshing canonical `/daily`, the AI review health check passed extension connection, Native host/Codex, credential boundary, centralized verified legal evidence, and answer generation readiness. `근거 조회 + 의견 생성` completed on task `102`; the UI showed one recent review record, execution mode `로컬 Codex 로그인`, evidence count `6`, legal evidence count `1`, `검토 의견`, confidence `61%`, WIKI candidate state label `지식 후보`, and status `검토 의견을 저장했습니다. 신뢰도 61%.`
- **2026-06-10 same-task project-context Local Codex proof:** after the operator reloaded extension `ianebfgjhjklildppcocmbmifedapooj` and refreshed canonical task `117`, the AI review health check again passed all five blocks. `근거 조회 + 의견 생성` saved assistant record `609f065a-e17c-4f1a-a968-50593832037a` for task `c7d551a2-242a-4441-b8c0-8e7bcaf6f838` with `executionMode: local-chatgpt-codex`, `runtimeMode: extension-native-bridge-in-page`, `candidateState: candidate`, confidence `61`, evidence count `6`, and project-context retrieval status `chunks_found`.
- `architect-saas` 현재 브랜치: `codex/multi-user-transition`.
- 기존 계획: `docs/superpowers/plans/2026-06-07-ai-review-service-readiness.md`.
- 기존 워크로그: `docs/worklogs/2026-06-08-ai-review-service-readiness.md`.
- 기존 워크로그 기준으로 SaaS/Brower Assistant/Preview completion smoke의 상당 부분은 이미 통과했다.
- Preview full-PASS의 핵심 gap이었던 project-context 포함 same-task Local Codex 저장 record와 Chrome extension reload gate는 닫혔다.
  - local validators, Preview verified-legal runtime proof, and latest exact `/daily` gates are PASS.
  - Task `117` on the canonical Preview now proves project-context retrieval: DB `review_corpus_trace` shows `corpus_status: "chunks_found"`, active/candidate/matched/included chunk counts all `1`, active version `ee49089a-edd0-4603-b1d6-537897ab1203`, included chunk `9964b220-feb0-486d-b527-7bd1f7df7cf1`; the UI also shows `chunks_found`.
  - Task `117` now also proves same-task Local Codex saved-record persistence on the canonical Preview host: assistant record `609f065a-e17c-4f1a-a968-50593832037a`, `candidateState: candidate`, confidence `61`, created `2026-06-10T08:55:25.063Z`.
- 따라서 이번 계획은 신규 기능 설계가 아니라 실제 타깃에서 닫힌 PASS 조건과 별도 승인 게이트를 유지 관리하는 계획이다.

## 2026-06-10 Checklist State

- [x] SaaS local validators passed under centralized verified-legal assumptions: `task-review:validate`, `legal-search:validate`, legal batch audit adapter validator, `typecheck`, `vercel-build`, and `ai-review:readiness`.
- [x] Deployed Preview runtime uses non-loopback verified legal API configuration through server-side env and does not require `LAW_OPEN_DATA_OC` in SaaS.
- [x] 2026-06-10 env follow-up confirmed branch-scoped `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` are configured for `codex/multi-user-transition`; `LAW_OPEN_DATA_OC` remains absent from SaaS.
- [x] 2026-06-10 env follow-up redeployed Preview `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC` and confirmed `/preview/daily` HTTP `200`.
- [x] Vercel-protected verified API Preview is reachable by SaaS server-to-server code using the configured protection bypass plus app secret; neither secret is exposed to the browser or docs.
- [x] Exact Preview AI review completion smoke passed on `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app`.
- [x] Exact Preview `/daily` release verifiers passed on the same URL/deployment: remaining acceptance, navigation pending-sync, and two-window collaboration.
- [x] Canonical authenticated Preview alias now targets `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd` and was used for the in-page AI review execution proof.
- [x] Architect Browser Assistant Preview build/reload proof passed on extension id `ianebfgjhjklildppcocmbmifedapooj` with canonical origin `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`.
- [x] In-page AI review on canonical `/daily` executed through Local Codex/native bridge and saved a candidate review record for task `102`.
- [x] Automated authenticated completion smoke on the latest canonical alias is intentionally not rerun from shell because `ARCHITECT_SMOKE_COOKIE` is absent; this is superseded for current Preview signoff by authenticated Chrome UI proof plus read-only DB verifier proof on the same canonical `/daily` task.
- [x] Project upload context retrieval proof is closed on canonical Preview task `117`: `chunks_found`, included chunk count `1`, UI `프로젝트 업로드 자료 검토 상태: chunks_found`.
- [x] Same-task Local Codex saved-record proof is closed for task `117`: Chrome loaded the fixed extension bundle, in-page generation saved assistant record `609f065a-e17c-4f1a-a968-50593832037a`, and DB verifier confirmed `executionMode: local-chatgpt-codex`, `runtimeMode: extension-native-bridge-in-page`, and `candidateState: candidate`.
- [x] Browser Assistant production metadata/readiness gate is closed for the unsigned interim path: `release:readiness:production` returned `18 pass, 1 warn, 0 fail` with extension id `ianebfgjhjklildppcocmbmifedapooj`, release owner `gudc0831`, Web Store publisher `gudc083111@gmail.com`, stable native-host install root, and `--allow-unsigned-native-host`.
- [x] Production deployment, promote, or alias change is explicitly separated from this Preview full-PASS plan and remains approval-gated release work, not a blocker for deployed SaaS Preview AI review execution.

## Harness Decision Gate

- `hy` 판단: SaaS API와 `/daily` 버튼 경로는 `retrieve`, `task-review`, `records` 세 API가 같은 인증 사용자/프로젝트 컨텍스트로 이어지는지 증명해야 한다.
- `ung` 판단: Browser Assistant release gate와 real Local Codex generation proof는 필요하지만, Vercel 서버 smoke를 대신하지 않는다.
- `ch` 판단: `LAW_OPEN_DATA_OC`와 verified legal 설정은 값이 아니라 이름/상태/URL shape만 기록한다. 프로젝트 업로드 컨텍스트는 법령 권위로 취급하지 않는다.
- `ul` 판단: 최종 보고는 정확한 URL, 브랜치, SHA, deployment id 또는 alias target, 실행 명령, PASS/FAIL, 잔여 리스크를 포함한다.
- Coordinator decision: 위 네 판단이 모두 PASS가 아니면 전체 완료로 보고하지 않는다.

## Stop Rules

다음 작업은 새 승인 없이 수행하지 않는다.

- `.env`, `.env.local`, `.env.preview.local`에 secret 값을 쓰거나 Vercel env를 pull해서 secret 파일을 갱신하는 작업.
- Vercel 환경변수 추가/수정/삭제, deploy, alias 변경, production 또는 preview 설정 변경.
- Supabase service role, app session cookie, browser auth profile, native host install/registry 변경.
- cloud DB write/migration, 프로젝트 업로드 fixture 생성, 기존 데이터 삭제.
- `verify-local-codex-generation.mjs --allow-external`처럼 실제 Codex/OpenAI 호출을 발생시키는 검증.
- secret 값이 로그, diff, 워크로그, 스크린샷, 브라우저 export에 출력될 위험이 있는 명령.

## Done Criteria

전체 완료 조건은 아래 항목이 모두 PASS일 때다.

- `npm run ai-review:readiness`가 target env에서 PASS. 변수 값은 출력하지 않고 이름/존재/URL shape만 기록한다.
- `npm run task-review:validate` PASS.
- `npm run project-context:validate` PASS.
- `npm run legal-search:validate` PASS.
- `npm run typecheck` 또는 `npx tsc --noEmit --incremental false` PASS.
- `npm run lint` PASS. 기존 경고가 있으면 기존 경고인지 파일/라인으로 분리한다.
- Browser Assistant에서 `npm run typecheck`, `npm run test`, `npm run build`, `npm run release:check`, `npm run native-host:self-test` PASS.
- Local Codex real generation은 명시 승인 후 real mode로 PASS하거나, 승인 전에는 mock/self-test만 PASS로 기록하고 전체 완료는 보류한다.
- verified-legal-evidence-api가 사용 설정된 경우 `npm run smoke:legal:preflight`와 `npm run test:legal-search-api` PASS.
- exact local 또는 exact preview `/daily`에서 AI 검토 실행 증거가 있다.
  - `POST /api/assistant/retrieve` HTTP 200.
  - `projectContextTrace.status === "chunks_found"`.
  - `projectContextChunks.length > 0`.
  - `POST /api/assistant/task-review` HTTP 200.
  - task-review body status가 `ready_for_generation`.
  - task-review preview가 WIKI approval을 시도하지 않는다.
  - task-review preview가 WIKI candidate를 자동 생성하지 않는다.
  - `POST /api/assistant/records` HTTP 201.
  - saved assistant record가 `executionMode: local-chatgpt-codex`, `runtimeMode: extension-native-bridge-in-page`를 가진다.
  - saved assistant record의 WIKI 상태는 `candidate`이며 승인 처리로 건너뛰지 않는다.
  - official-law audit 필드가 저장 record에서 유지된다.
- preview signoff를 수행하는 경우 `/preview/daily`는 smoke로만 인정하고, 최종 증거는 정확한 preview `/daily` URL에서 확보한다.
- no-secret proof: 변경 diff, command output, worklog, screenshot/export에서 `LAW_OPEN_DATA_OC`, Supabase service role, OpenAI/Codex credential, cookie 값이 발견되지 않는다.

## Execution Plan

- [x] **Step 1: Baseline and isolation check**
  - `architect-saas`, `architect-browser-assistant`, `verified-legal-evidence-api`의 `git status --short --branch`를 기록한다.
  - 현재 checkout이 일반 checkout인지 worktree인지 확인한다.
  - 코드 수정이 필요해지면 Superpowers `using-git-worktrees`에 따라 별도 worktree 생성 승인을 요청한다.
  - PASS: 세 repo의 branch/SHA와 dirty 상태가 명확히 기록된다.

- [x] **Step 2: Safe static validators**
  - `architect-saas`에서 승인 없이 가능한 validator를 실행한다.
    - `npm run task-review:validate`
    - `npm run project-context:validate`
    - `npm run legal-search:validate`
    - `npm run typecheck`
    - `npm run lint`
  - 실패하면 파일/라인/원인을 기록하고, 코드 수정은 별도 승인 후 진행한다.
  - PASS: 위 명령들이 PASS하거나, 코드 변경 필요 지점이 구체화된다.

- [x] **Step 3: AI readiness env gate**
  - Status: local target env passes centralized verified legal readiness; deployed Preview runtime proof remains a release signoff gate.
  - 먼저 현재 로컬 env shape만 이름 기준으로 확인한다.
  - `VERIFIED_LEGAL_EVIDENCE_API_URL` 또는 `VERIFIED_LEGAL_EVIDENCE_API_SECRET`가 로컬 target env에 없으면 `npm run ai-review:readiness`는 local configured shell에서 PASS할 수 없다.
  - Vercel env 이름 기준 존재 여부는 `vercel env ls`로만 확인하고 값을 출력하지 않는다.
  - `vercel env pull` 또는 `.env.preview.local` 갱신은 secret file write이므로 승인 후에만 수행한다.
  - PASS: target env에서 `npm run ai-review:readiness` PASS 또는 승인 필요 사유가 명확히 기록된다.

- [x] **Step 4: Project context chunk proof**
  - 기존 deployed smoke는 `projectContextChunkCount: 0`이었으므로 전체 PASS가 아니다.
  - 기존 프로젝트에 active upload chunks가 있으면 그 프로젝트/task를 사용한다.
  - 없다면 cloud DB 또는 app UI에 테스트 프로젝트 자료를 생성해야 하므로 승인 후 진행한다.
  - completion smoke 또는 브라우저 네트워크 증거에서 `projectContextTrace.status === "chunks_found"`와 `projectContextChunks.length > 0`를 확인한다.
  - 2026-06-10 PASS on canonical Preview task `117`: task id `c7d551a2-242a-4441-b8c0-8e7bcaf6f838`, project id `856f8cfc-24ce-48f5-ab8f-7516769862d6`, active version `ee49089a-edd0-4603-b1d6-537897ab1203`, included chunk `9964b220-feb0-486d-b527-7bd1f7df7cf1`.
  - DB trace proof: latest `review_corpus_trace` rows for task `117` have `corpus_status: "chunks_found"`, `active_version_count: 1`, `candidate_chunk_count: 1`, `matched_chunk_count: 1`, `included_chunk_count: 1`, `no_relevant_chunk_reason: null`, `search_error_code: null`.
  - UI proof: canonical `/daily?taskId=c7d551a2-242a-4441-b8c0-8e7bcaf6f838` shows `프로젝트 업로드 자료 검토 상태` with paragraph `chunks_found`.
  - Same-task save proof: canonical task `117` generated and saved assistant record `609f065a-e17c-4f1a-a968-50593832037a` through Local Codex/native bridge.

- [x] **Step 5: Authenticated exact flow proof**
  - exact target URL을 먼저 고정한다.
  - local target 예: `http://localhost:3000/daily`.
  - preview target은 deployment id/alias target과 함께 확정한다.
  - app session cookie 생성, service role 사용, browser auth profile 사용은 승인 후 진행한다.
  - `/api/assistant/retrieve`, `/api/assistant/task-review`, `/api/assistant/records`의 HTTP status와 body status를 기록한다.
  - 2026-06-10 PASS on `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app`: retrieve succeeded, task-review HTTP `200`, retrieve evidence count `8`, WIKI approval attempted `false`, WIKI candidate created `false`, records `201`, WIKI candidate state `candidate`, saved assistant record id `8b92593c-9008-401a-ae09-125774819a40`, cleanup `true`.
  - PASS: retrieve 200, task-review 200 `ready_for_generation`, records 201, WIKI approval bypass 없음, WIKI candidate state가 `candidate`.

- [x] **Step 6: Browser Assistant Preview and Local Codex proof**
  - 승인 없이 가능한 Browser Assistant gates를 실행한다.
    - `npm run typecheck`
    - `npm run test`
    - `npm run build`
    - `npm run release:check`
    - `npm run native-host:self-test`
    - `node scripts\verify-local-codex-generation.mjs --mock --json --strict`
  - real generation은 사용자 승인 후에만 실행한다.
    - `node scripts\verify-local-codex-generation.mjs --allow-external --json --strict --timeout-ms 180000`
  - 2026-06-10 PASS: `npm run release:check` passed after the content-script patch with 8 Vitest files / 30 tests, 22 native/package tests, build, release readiness, and native-host self-test. Native-host production-install verification passed for extension id `ianebfgjhjklildppcocmbmifedapooj` and install root `C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host` when the install root was explicit.
  - 2026-06-10 PASS: `dist/manifest.json` was built for the canonical authenticated Preview host, the unpacked extension was reloaded by the operator, health check passed all five blocks, and Local Codex/native bridge generation saved a candidate AI review record from canonical `/daily`.
  - 2026-06-10 root cause/fix: task `117` health check also passed all five blocks, but same-task generation did not save a record and the UI surfaced `Local Codex generation failed`. Installed native-host framed `generate` reproduced `codex_exec_failed`; causes were explicit `gpt-5-codex` model rejection by ChatGPT-account Codex CLI and Windows cmd quoting of `model_reasoning_effort="medium"` into invalid `^^medium`. Browser Assistant now omits that default model and sends unquoted reasoning config; the same installed framed `generate` smoke returns `ok: true`.
  - 2026-06-10 source reproducibility: the Browser Assistant native generation fix was committed and pushed to `architect-browser-assistant` `main` as `47d6029` (`Fix Local Codex native generation on Windows`).
  - 2026-06-10 PASS after operator reload: extension id `ianebfgjhjklildppcocmbmifedapooj` was reloaded from the rebuilt `dist`, canonical task `117` was refreshed, health check passed all five blocks, generation saved a record, and the read-only verifier command below confirmed the persisted row:
    `node scripts\verify-assistant-record.mjs --env-file .env.preview.local --backend-mode cloud --task-id c7d551a2-242a-4441-b8c0-8e7bcaf6f838 --candidate-state candidate --since-minutes 30 --allow-self-signed-db-cert --strict --json`
  - 2026-06-10 verifier result: `ok: true`, match count `1`, latest record `609f065a-e17c-4f1a-a968-50593832037a`, project `856f8cfc-24ce-48f5-ab8f-7516769862d6`, confidence `61`, created `2026-06-10T08:55:25.063Z`.
  - PASS: Preview release gate, native host path, and in-page Local Codex execution proof are complete for the deployed SaaS Preview target.

- [x] **Step 6B: Browser Assistant production release gate**
  - Supply production SaaS origin and production release metadata before running the production readiness gate.
  - Required metadata remains: production extension id/signing identity, publisher/Web Store boundary if used, production native-host install root, production SaaS origin, and release owner.
  - Run: `npm run release:readiness:production`.
  - Expected: production readiness PASS with no missing metadata and no warning promoted to release blocker.
  - 2026-06-10 PASS with explicit unsigned interim waiver: `ARCHITECT_RELEASE_OWNER=gudc0831`, `ARCHITECT_CHROME_WEB_STORE_PUBLISHER=gudc083111@gmail.com`, `ARCHITECT_NATIVE_HOST_INSTALL_ROOT=C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host`, `--extension-id ianebfgjhjklildppcocmbmifedapooj`, and `--allow-unsigned-native-host` produced `18 pass, 1 warn, 0 fail`.
  - Remaining release caveat: the warning is expected until a real native-host code-signing subject replaces the unsigned waiver; Chrome Web Store upload was not performed by the validator.

- [x] **Step 7: verified legal boundary proof**
  - `verified-legal-evidence-api`에서 fixture/smoke validator를 실행한다.
    - `npm run smoke:legal:preflight`
    - `npm run test:legal-search-api`
    - `npm run test:project-context-boundary`
  - SaaS preview env에서 verified legal URL이 설정된 경우 loopback URL이 아닌지, secret/source-id presence가 맞는지 이름/상태만 기록한다.
  - 2026-06-10 PASS: protected verified API Preview is reached through `x-vercel-protection-bypass` plus `x-verified-legal-evidence-api-secret`; task-review returned answer-ready legal evidence without moving `LAW_OPEN_DATA_OC` or corpus ownership into SaaS.
  - PASS: official-law verification은 strict하게 유지되고, project context와 legal evidence가 섞이지 않는다.

- [x] **Step 8: Secret leakage sweep**
  - 변경 diff와 새 로그/워크로그에서 민감 값 패턴을 검색한다.
  - 값 자체를 찾거나 출력하지 않는다. 이름 패턴과 accidental literal만 검사한다.
  - PASS: secret 값 노출 없음.

- [x] **Step 9: Worklog and final report**
  - `docs/worklogs/2026-06-09-ai-review-full-pass.md`와 `docs/worklogs/2026-06-10-ai-review-preview-extension-refresh.md`에 실행 결과를 기록한다.
  - 각 PASS 증거는 명령, 시간, target URL, branch/SHA, deployment id 또는 alias target, HTTP status/body status, projectContext status/count, saved record id만 남긴다.
  - secret/cookie 값은 기록하지 않는다.
  - PASS: final report에서 완료/차단/승인 필요 항목이 구분된다.

## Remaining Execution Order, 2026-06-10 KST

1. Task `117` Local Codex generation after unpacked extension reload is complete.
   - Proof: `chunks_found` and included chunk count `1` are confirmed.
   - Proof: installed native-host framed `generate` with the previous `gpt-5-codex` input returns `ok: true` after the Browser Assistant model/Windows quoting fix.
   - Proof: canonical in-page `근거 조회 + 의견 생성` saved assistant record `609f065a-e17c-4f1a-a968-50593832037a` with candidate state.
2. Rerun automated authenticated completion smoke on the canonical alias if an `ARCHITECT_SMOKE_COOKIE` is intentionally provided to the shell.
   - Run: `npm run ai-review:completion-smoke -- --Origin https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --Cleanup`.
   - Expected: auth `200`, retrieve `200`, task-review `200`, records `201`, WIKI approval attempted `false`, cleanup `true`.
3. Commit and push the local release-relevant source/docs changes only after the final diff is reviewed.
   - Browser Assistant source reproducibility is complete at pushed commit `47d6029`.
   - SaaS verifier and plan/worklog changes need to be committed separately from unrelated local worktree changes.
4. Treat production deploy/promote/alias as a separate approval-gated release.
   - Current proof is Preview-only.

## Approval Requests To Prepare

전체 PASS를 닫기 위해 다음 승인이 필요할 가능성이 높다.

```text
승인 필요:
- 작업: Vercel Preview env를 로컬 target env 파일로 pull하거나 동일한 configured shell을 구성
- 대상: D:\architect-workspace\architect-saas\.env.preview.local 또는 임시 secret-loaded shell
- 지금 필요한 이유: local `ai-review:readiness`가 verified legal API URL/secret 존재를 요구하지만 현재 로컬 env 파일에는 없다
- 위험: secret 파일 갱신 및 값 노출 위험
- 되돌리기: 변경 전 파일 상태 기록 후 원복, 또는 임시 파일/프로세스 env만 사용하고 삭제
- 검증: 변수 값 없이 이름/존재/URL shape만 기록하고 `npm run ai-review:readiness` PASS 확인
```

```text
승인 필요:
- 작업: authenticated app session/cookie 또는 browser auth profile을 사용한 exact `/daily` AI review proof
- 대상: local 또는 Vercel Preview `/daily`
- 지금 필요한 이유: `/api/assistant/retrieve`, `/api/assistant/task-review`, `/api/assistant/records`는 인증 사용자와 프로젝트 컨텍스트가 필요하다
- 위험: cookie/session/사용자 데이터 노출 위험
- 되돌리기: 임시 cookie 파일 삭제, 생성한 smoke 데이터 cleanup, worklog에는 값 미기록
- 검증: HTTP status와 body status만 기록하고 secret/cookie 값은 출력하지 않음
```

```text
승인 필요:
- 작업: active project upload chunks가 없는 경우 테스트 프로젝트 자료 생성
- 대상: cloud-backed app DB 또는 preview app UI
- 지금 필요한 이유: 전체 PASS 조건은 `projectContextTrace.status === "chunks_found"`와 `projectContextChunks.length > 0`
- 위험: 테스트 데이터 생성 및 DB write
- 되돌리기: 생성 id 기록 후 cleanup 또는 테스트 fixture로 격리
- 검증: retrieval/task-review에서 projectContext chunk count가 1 이상이고 cleanup 결과 확인
```

```text
승인 필요:
- 작업: real Local Codex generation verifier 실행
- 대상: D:\architect-workspace\architect-browser-assistant
- 지금 필요한 이유: mock/self-test는 native-host wiring만 증명하고 실제 Local Codex/GPT 실행은 증명하지 못함
- 위험: 외부/로컬 모델 호출, 실행 시간 증가, 응답 로그 관리 필요
- 되돌리기: 프로세스 종료 및 생성 로그 secret sweep
- 검증: `verify-local-codex-generation.mjs --allow-external --json --strict` PASS, secret 값 미출력
```
