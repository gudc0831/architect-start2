Req: 03 File And Image Analysis 첫 slice로 task assistant가 첨부 파일 분석 근거를 저장하고 검색하게 한다.
Diff: 파일 metadata 기반 analysis 저장 API, `/daily` assistant 팝업 파일 근거 입력 UI, assistant evidence 연결, Prisma migration을 추가했다.
Why: 건축 task 검토에서 첨부 파일/OCR/이미지 메모를 낮은 신뢰도 근거로 먼저 연결해야 후속 자동 추출 slice를 안전하게 확장할 수 있다.
Verify/Time: 2026-05-08 09:14 KST. `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm run build`, in-app browser `/daily` 팝업 확인 완료.
