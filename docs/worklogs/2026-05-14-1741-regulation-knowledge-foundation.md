Req: 법규 DB/공식 출처 seed/import 및 검색 품질 기반을 첫 안전 slice로 구현한다.
Diff: local regulation seed package, seed/evaluation validator, assistant retrieval `regulation` evidence 연결, deterministic mock provider regulation mention, npm dry-run validation script를 추가했다. Browser Assistant repo에는 460 slice 문서와 roadmap/worklog가 있다.
Why: 전체 기획서의 법규 DB 검색 우선순위가 아직 실체화되지 않아 `regulation` evidence가 항상 unavailable로 남는 문제를 DB migration과 외부 호출 없이 먼저 닫기 위해서다.
Verify/Time: 2026-05-14 17:41 KST, `npm run regulation:seed:validate`, `npm run typecheck`, `npm run lint`, `npm run build` 통과.
