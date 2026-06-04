Req: 05 SaaS API Mode PRD의 다음 goal로 provider 호출 없는 policy/usage/audit foundation을 구현하고 `/daily` PC assistant popup에서 직접 테스트 가능하게 연결한다.

Diff: Prisma schema와 migration에 `assistant_run_policies`, `assistant_usage_events`, `assistant_audit_events`를 추가했다. assistant repository local/Postgres 구현에 policy, usage, audit 저장/조회 메서드를 추가했다. `GET/PUT /api/admin/assistant/policy`, `GET /api/admin/assistant/usage`, `GET /api/assistant/policy`, `POST /api/assistant/generate`를 추가했다. `/daily` assistant panel에는 `SaaS API foundation` 실행 모드, enabled/disabled 표시, generate 호출 경로를 연결했다. `/assistant-test`, `docs/assistant-extension-contract.md`, `사용자 가이드.md`도 갱신했다.

Why: 조직에서 로컬 ChatGPT/Codex 실행이 어려운 경우에도 task-reactive assistant 흐름을 유지하려면, 실제 provider 호출 전 서버 측 정책, 예산 차단, 사용량 추정, 감사 이벤트가 먼저 검증되어야 한다.

Verify/Time: 2026-05-08 11:06 KST. `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm run build` 통과. lint는 기존 hook dependency warning 7건만 남았다. `APP_BACKEND_MODE=local` dev 서버에서 policy enable, `POST /api/assistant/generate`, `GET /api/admin/assistant/usage?month=2026-05` 확인. in-app browser에서 `/daily` task 001의 assistant popup을 열고 `SaaS API foundation`으로 전환해 answer, usage 문구, 저장 완료 상태를 확인했다.
