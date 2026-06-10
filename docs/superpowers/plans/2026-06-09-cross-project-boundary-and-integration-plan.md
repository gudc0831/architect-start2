# Cross-Project Boundary And Integration Plan

> **Status:** active boundary correction and release-readiness plan, created 2026-06-09 KST. This plan supersedes any wording that implies Architect SaaS should own official legal-source ingestion, legal-source credentials, or direct law.go.kr verification as part of task review.

## Goal

Keep `architect-saas`, `verified-legal-evidence-api`, and `architect-browser-assistant` connected without collapsing their ownership boundaries. Task review may be orchestrated from SaaS because SaaS owns user/project/task context, UI, permissions, and saved records, but SaaS must not become the legal evidence engine or browser/local execution runtime.

## Boundary Model

| Project | Owns | Must Not Own |
| --- | --- | --- |
| `architect-saas` | Auth, project membership/RBAC, task data, `/daily` UI, project upload UI, `projectContextChunks`, task-review orchestration, assistant records, WIKI candidate state. | `LAW_OPEN_DATA_OC`, official legal-source ingestion, legal corpus refresh, direct law.go.kr verification as the task-review source of truth, Chrome/native-host runtime. |
| `verified-legal-evidence-api` | Official legal-source credentials, raw legal ingestion, legal corpus staging, legal search, evidence bundle API, source freshness/change monitoring, legal evidence provenance. | SaaS user auth, project upload approval UI, WIKI approval, task record persistence, browser-facing project material upload. |
| `architect-browser-assistant` | Extension UI, browser context capture, native-host bridge, Local Codex execution, diagnostic/local generation status. | SaaS DB access, server secrets, legal evidence corpus ownership, WIKI approval, project-context activation. |

## Correct Task Review Flow

1. Browser/SaaS user starts review from a task.
2. `architect-saas` verifies the current user, project, task, and active project context.
3. `architect-saas` requests legal evidence from `verified-legal-evidence-api` over a server-to-server API using `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
4. `architect-saas` retrieves project upload context only from SaaS-owned `project_context` tables and emits it as `projectContextChunks[]`.
5. `architect-saas` keeps legal evidence as `legalEvidence[]`; project context never becomes legal authority.
6. `architect-browser-assistant` may generate or assist through Local Codex, but it consumes the SaaS retrieval snapshot and never receives server secrets.
7. Saved assistant records keep execution mode, legal evidence metadata, project context trace, and WIKI candidate state; task review must not auto-approve WIKI content.

## Required Corrections

- [x] SaaS readiness must require `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, not `LAW_OPEN_DATA_OC`.
- [x] SaaS task-review validators must reject direct official-law verifier imports in the task-review service path.
- [x] Project context upload material must stay in `projectContextChunks[]`, with `projectContextTrace` distinguishing `chunks_found`, `active_corpus_missing`, `no_relevant_chunks`, and `search_failed`.
- [x] `verified-legal-evidence-api` docs and validators must state that project uploaded materials are not verified legal evidence.
- [x] Deployed Preview must prove the verified legal URL is non-loopback and configured server-side without exposing values.
- [x] Browser Assistant Preview readiness must pass with the authenticated SaaS Preview origin before claiming deployed Preview AI review execution.
- [x] Browser Assistant production readiness must pass with production SaaS origin and production metadata before release promotion.

## 2026-06-10 Verification Refresh

- Earlier direct Preview target inspected for release verification: `https://architect-start2-9l8rhe7ox-chois-projects-7b2948cf.vercel.app/daily`, deployment `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`, branch/worktree `codex/multi-user-transition`, verified code SHA `5724068f543b1f863f163e15a71434f18018de4c`.
- Current authenticated Preview proof uses canonical host `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`, because Preview auth callback/session issuance follows the configured public site host. The canonical alias now resolves to deployment `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`.
- Do not ask an operator to keep logging into arbitrary direct deployment URLs when `NEXT_PUBLIC_SITE_URL` points auth to the canonical branch alias. Verify the URL triad first: requested URL, alias/deployment target, and auth callback/public site host.
- SaaS local validators pass after the boundary cleanup: `npm run ai-review:readiness`, `npm run task-review:validate`, `npm run legal-search:validate`, `npx tsx scripts/legal-batch-audit-adapter-validate.ts`, `npm run typecheck`, and `npm run vercel-build`. `project-context:validate` passed in the prior refresh and was not rerun in the final 2026-06-10 deployment pass.
- `verified-legal-evidence-api` validators pass: `npm run smoke:legal:preflight`, `npm run test:legal-search-api`, and `npm run test:project-context-boundary`.
- Deployed Preview verified-legal proof is now PASS. SaaS Preview env lists encrypted `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`; runtime completion smoke returned task-review HTTP `200`, retrieve evidence count `8`, WIKI approval attempted `false`, WIKI candidate created `false`, saved record candidate state `candidate`, and cleanup `true`.
- 2026-06-10 env follow-up: `architect-start2` Preview branch `codex/multi-user-transition` was explicitly reconfigured with non-empty `VERIFIED_LEGAL_EVIDENCE_API_URL` and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` values, while `LAW_OPEN_DATA_OC` remains absent from SaaS. The follow-up redeploy is `https://architect-start2-j6pxbb0gs-chois-projects-7b2948cf.vercel.app`, deployment `dpl_HnyZ5mDeWyy9cR8iJA9pwj5WjVMC`, Ready; `/preview/daily` returned HTTP `200`.
- Verified legal API target repair is proven on `https://verified-legal-evidence-hp5490x70-chois-projects-7b2948cf.vercel.app`, deployment `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`, with server secret plus Vercel protection bypass returning HTTP `200`. SaaS was redeployed to `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd` after the API/env repair.
- Exact Preview `/daily` collaboration gates were clean on deployment `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`: `daily:remaining-acceptance:verify` PASS, `daily:navigation-pending-sync:verify --target-path=/board` PASS, and `daily:cell-collaboration:two-window` PASS. These prove `/daily` collaboration behavior, not the final Browser Assistant execution proof.
- Browser Assistant Preview readiness now passes for the canonical authenticated host. `npm run release:check` passed after the content-script patch, the native host production-install verifier passed with explicit install root, and in-page Local Codex/native bridge generation saved an AI review candidate from canonical `/daily`.
- `npm run release:readiness:production` now passes for the unsigned interim release path: canonical Preview origin build, extension id `ianebfgjhjklildppcocmbmifedapooj`, release owner `gudc0831`, Web Store publisher `gudc083111@gmail.com`, stable native-host install root, and `--allow-unsigned-native-host` produced `18 pass, 1 warn, 0 fail`.
- Active project upload chunk retrieval proof is now PASS on canonical Preview task `117`: `review_corpus_trace.corpus_status = chunks_found`, active/candidate/matched/included chunk counts all `1`, included chunk `9964b220-feb0-486d-b527-7bd1f7df7cf1`. Installed native-host framed generation is fixed and returns `ok: true`; the Browser Assistant fix is pushed at `47d6029`; same-task in-page Local Codex saved-record proof remains open until Chrome reloads the fixed unpacked extension bundle and reruns task `117`.

## Current Checklist

- [x] `architect-saas` owns task-review orchestration, project context, saved records, and WIKI candidate state only.
- [x] `verified-legal-evidence-api` owns corpus artifacts, source freshness, official legal credentials, and legal evidence API behavior.
- [x] `architect-browser-assistant` remains local/browser execution surface and does not receive server legal secrets.
- [x] SaaS Preview env uses `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`, and optional Vercel protection bypass; no `LAW_OPEN_DATA_OC` in SaaS.
- [x] 2026-06-10 env follow-up confirmed the `codex/multi-user-transition` Preview branch has non-empty verified API URL/secret values and a Ready redeploy.
- [x] Exact Preview task-review runtime proof returned legal evidence from the verified API with task-review HTTP `200`.
- [x] Exact Preview `/daily` verifiers passed on `dpl_7xRhLxNwoTtA9CQ6VBEFksaHYJiT`.
- [x] Canonical Preview `/daily` in-page AI review executed with Browser Assistant/Local Codex and saved a WIKI candidate review record on task `102`.
- [ ] Automated authenticated completion smoke has not been rerun against canonical alias deployment `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd` because `ARCHITECT_SMOKE_COOKIE` is not available in the shell.
- [x] Active project upload chunk retrieval proof passed on canonical Preview task `117`; installed native-host generation is fixed, and same-task saved-record proof remains open separately until manual extension reload/rerun.
- [x] Browser Assistant production metadata and production readiness passed for the unsigned interim path.
- [ ] Production env/readiness/deploy promotion remain open and must be handled separately.

## Acceptance Gates

- `architect-saas`: `npm run ai-review:readiness`, `npm run task-review:validate`, `npm run project-context:validate`, `npm run legal-search:validate`, `npm run typecheck`, `npm run lint`.
- `verified-legal-evidence-api`: `npm run smoke:legal:preflight`, `npm run test:legal-search-api`, `npm run test:project-context-boundary`.
- `architect-browser-assistant`: `npm run typecheck`, `npm run test`, `npm run build`, `npm run release:check`, `npm run native-host:self-test`, `npm run native-host:verify-production-install -- --extension-id ianebfgjhjklildppcocmbmifedapooj --install-root C:\Users\hcchoi\AppData\Local\Architect\BrowserAssistant\native-host`, and production readiness after metadata is supplied.
- Exact Preview `/daily`: `daily:remaining-acceptance:verify`, `daily-cell-collaboration-two-window-verify.ts`, and `daily:navigation-pending-sync:verify` against the inspected deployment URL.

## Stop Rules

- Do not add `LAW_OPEN_DATA_OC` to `architect-saas`.
- Do not move project upload data into `EvidenceBundle`, `LegalSearchResult`, `/api/evidence/bundle`, or `/api/legal/search`.
- Do not let Browser Assistant call server-to-server legal APIs or store server secrets.
- Do not mark AI review full PASS from local validators alone; deployed runtime proof is required.
