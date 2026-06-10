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
- **2026-06-10 final Preview runtime refresh:** latest inspected Preview `/daily` target is `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app/daily`, deployment `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`, branch/worktree `codex/multi-user-transition`, verified code SHA `5724068f543b1f863f163e15a71434f18018de4c`. SaaS Preview env has encrypted `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`; `LAW_OPEN_DATA_OC` remains absent from SaaS. Runtime completion smoke passed with auth `200`, task-review `200`, retrieve evidence count `8`, WIKI approval attempted `false`, WIKI candidate created `false`, saved assistant record `201`/candidate, saved assistant record id `8b92593c-9008-401a-ae09-125774819a40`, and cleanup `true`.
- `architect-saas` 현재 브랜치: `codex/multi-user-transition`.
- 기존 계획: `docs/superpowers/plans/2026-06-07-ai-review-service-readiness.md`.
- 기존 워크로그: `docs/worklogs/2026-06-08-ai-review-service-readiness.md`.
- 기존 워크로그 기준으로 SaaS/Brower Assistant/Preview completion smoke의 상당 부분은 이미 통과했다.
- 아직 전체 PASS로 볼 수 없는 핵심 gap은 project-context 실데이터 증거와 production release gate다.
  - local validators, Preview verified-legal runtime proof, and latest exact `/daily` gates are PASS.
  - Latest completion smoke reported `projectContextChunkCount: 0`; a separate task with active project upload chunks is still required before claiming the project-context portion of full PASS.
- 따라서 이번 계획은 신규 기능 설계가 아니라 남은 PASS 조건을 실제 타깃에서 닫는 실행 계획이다.

## 2026-06-10 Checklist State

- [x] SaaS local validators passed under centralized verified-legal assumptions: `task-review:validate`, `legal-search:validate`, legal batch audit adapter validator, `typecheck`, `vercel-build`, and `ai-review:readiness`.
- [x] Deployed Preview runtime uses non-loopback verified legal API configuration through server-side env and does not require `LAW_OPEN_DATA_OC` in SaaS.
- [x] Vercel-protected verified API Preview is reachable by SaaS server-to-server code using the configured protection bypass plus app secret; neither secret is exposed to the browser or docs.
- [x] Exact Preview AI review completion smoke passed on `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app`.
- [x] Exact Preview `/daily` release verifiers passed on the same URL/deployment: remaining acceptance, navigation pending-sync, and two-window collaboration.
- [ ] Project upload context full-PASS remains open because the latest completion smoke returned `projectContextChunkCount: 0`.
- [ ] Browser Assistant production metadata and `release:readiness:production` remain separate release gates.
- [ ] Production deployment, promote, or alias change has not been performed.

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

- [ ] **Step 4: Project context chunk proof**
  - 기존 deployed smoke는 `projectContextChunkCount: 0`이었으므로 전체 PASS가 아니다.
  - 기존 프로젝트에 active upload chunks가 있으면 그 프로젝트/task를 사용한다.
  - 없다면 cloud DB 또는 app UI에 테스트 프로젝트 자료를 생성해야 하므로 승인 후 진행한다.
  - completion smoke 또는 브라우저 네트워크 증거에서 `projectContextTrace.status === "chunks_found"`와 `projectContextChunks.length > 0`를 확인한다.
  - Current 2026-06-10 Preview smoke result: `projectContextChunkCount: 0`, so this remains not fully proven.
  - PASS: AI review retrieval과 task-review payload 모두 같은 active project context를 본다.

- [x] **Step 5: Authenticated exact flow proof**
  - exact target URL을 먼저 고정한다.
  - local target 예: `http://localhost:3000/daily`.
  - preview target은 deployment id/alias target과 함께 확정한다.
  - app session cookie 생성, service role 사용, browser auth profile 사용은 승인 후 진행한다.
  - `/api/assistant/retrieve`, `/api/assistant/task-review`, `/api/assistant/records`의 HTTP status와 body status를 기록한다.
  - 2026-06-10 PASS on `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app`: retrieve succeeded, task-review HTTP `200`, retrieve evidence count `8`, WIKI approval attempted `false`, WIKI candidate created `false`, records `201`, WIKI candidate state `candidate`, saved assistant record id `8b92593c-9008-401a-ae09-125774819a40`, cleanup `true`.
  - PASS: retrieve 200, task-review 200 `ready_for_generation`, records 201, WIKI approval bypass 없음, WIKI candidate state가 `candidate`.

- [ ] **Step 6: Browser Assistant and Local Codex proof**
  - 승인 없이 가능한 Browser Assistant gates를 실행한다.
    - `npm run typecheck`
    - `npm run test`
    - `npm run build`
    - `npm run release:check`
    - `npm run native-host:self-test`
    - `node scripts\verify-local-codex-generation.mjs --mock --json --strict`
  - real generation은 사용자 승인 후에만 실행한다.
    - `node scripts\verify-local-codex-generation.mjs --allow-external --json --strict --timeout-ms 180000`
  - Current status: not rerun in this 2026-06-10 Preview pass. Production metadata and production readiness remain a separate release gate.
  - PASS: release gate와 native host path가 PASS하고, real generation은 승인 후 실제 응답으로 PASS한다.

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
  - `docs/worklogs/2026-06-09-ai-review-full-pass.md`에 실행 결과를 기록한다.
  - 각 PASS 증거는 명령, 시간, target URL, branch/SHA, deployment id 또는 alias target, HTTP status/body status, projectContext status/count, saved record id만 남긴다.
  - secret/cookie 값은 기록하지 않는다.
  - PASS: final report에서 완료/차단/승인 필요 항목이 구분된다.

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
