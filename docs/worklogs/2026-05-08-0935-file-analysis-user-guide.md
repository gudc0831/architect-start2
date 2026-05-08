Req: 03 File And Image Analysis 구현 완료 상태에 맞춰 사용자 가이드를 최신화한다.
Diff: `사용자 가이드.md`에 `/daily` assistant 팝업의 첨부 파일 근거 저장 흐름, 관련 API, 현재 구현 기능 설명을 추가했다.
Why: 구현 완료 후 사용자가 바로 테스트할 수 있어야 하며, 미확인 OCR/이미지 근거의 낮은 신뢰도 정책을 가이드에 명시해야 한다.
Verify/Time: 2026-05-08 09:35 KST. 문서 내용 확인. 직전 구현 검증은 `npm run typecheck`, `npm run lint`, `npm run build`, in-app browser `/daily` 확인.
