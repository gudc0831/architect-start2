Req: 04 Web And Skill Expansion의 첫 구현 goal로, `/daily` PC assistant 팝업에서 사용자가 승인한 외부 웹/스킬 근거를 저장하고 다음 assistant retrieval에 `web_or_skill` evidence로 포함한다.
Diff: `ExternalEvidenceRecord` 도메인 모델, assistant repository 저장/조회 contract, `GET/POST /api/assistant/external-evidence`, `/daily` 팝업의 외부 근거 입력/저장 UX, retrieval evidence 병합, Knowledge admin source URL 표시, 사용자 가이드 갱신을 추가했다.
Why: 외부 웹 페이지나 skill 결과는 건축 task 검토에 유용하지만 공식 기준으로 자동 승격되면 위험하므로, 사용자 승인 상태와 출처를 보존한 낮은 신뢰도 근거 후보로 관리해야 한다.
Verify/Time: 2026-05-08 10:48 KST. `npm run typecheck`, `npm run lint`, `npm run build` 통과. in-app browser에서 `/daily` task 001 선택, assistant 팝업 열기, 외부 근거 저장, `근거 조회 + 의견 생성`, `/admin/knowledge` 후보 상세 source 표시까지 확인했다.
