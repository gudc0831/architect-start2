Req: 02 Knowledge Admin WIKI slice PRD에 따라 assistant 후보를 관리자 검토와 WIKI 지식 승인 흐름으로 구현한다.
Diff: `/admin/knowledge` 페이지, `KnowledgeAdminShell`, admin knowledge API, knowledge use-case를 추가했다. 기존 assistant record의 `candidateState`와 `metadata`를 사용해 후보 목록/상세, 승인, 반려, 승인된 WIKI draft 저장을 처리한다. `사용자 가이드.md`에 관리자 후보 검토 흐름을 추가했다.
Why: `/daily` assistant가 만든 답변과 작업 기록 정리 초안이 task 안에만 머물지 않고, Knowledge admin 검토를 거쳐 중앙 공식 지식 후보로 승격되어야 한다.
Verify/Time: 2026-05-07 17:35 KST. `npm run typecheck`, `npm run lint`(기존 warnings 7건), `npm run build`(기존 data-guard Turbopack warnings 2건) 통과. Browser-use로 `http://localhost:3000/admin/knowledge`에서 후보 상세 로딩, `WIKI 지식 승인`, 승인 상태 표시, console error/warn 없음 확인.
