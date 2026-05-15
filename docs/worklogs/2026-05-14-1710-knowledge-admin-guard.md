Req: Knowledge admin 권한을 기존 SaaS RBAC에 명확히 매핑한다.
Diff: `requireKnowledgeAdmin`/`canManageKnowledge` guard를 추가하고 `/admin/knowledge` 및 `/api/admin/knowledge/**`를 raw global-admin check에서 Knowledge admin guard로 전환했다.
Why: PLAN.md는 Knowledge admin을 Project manager와 분리하라고 요구한다. 이번 MVP 매핑은 global admin만 Knowledge admin으로 인정해 동작은 유지하되 권한 경계를 코드에 명시한다.
Verify/Time: 2026-05-14 17:10-17:35 KST, `npm run typecheck`, `npm run lint`, `npm run build` 통과. lint는 기존 React Hook warning 7개만 남음. `/api/admin/knowledge/**` raw `requireRole` 직접 사용 없음.
