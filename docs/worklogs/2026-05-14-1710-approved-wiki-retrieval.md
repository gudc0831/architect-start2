Req: 검색/retrieval 품질 축의 핵심 갭인 승인 WIKI가 assistant 근거에 들어오지 않는 문제를 first slice로 해소한다.
Diff: assistant repository에 `searchApprovedKnowledge`를 추가하고, 현재 approvedKnowledgeItem metadata를 query terms로 검색해 `/api/assistant/retrieve`의 `central_knowledge` evidence로 우선 반환하도록 연결했다.
Why: PLAN.md의 검색 우선순위는 중앙 공식 지식 DB를 최우선으로 두지만, 기존 구현은 central knowledge와 regulation을 항상 unavailable로 표시했다.
Verify/Time: 2026-05-14 17:10-17:35 KST, `npm run typecheck`, `npm run lint`, `npm run build` 통과. lint는 기존 React Hook warning 7개만 남음.
