Req: 핵심 미완성축 중 파일/OCR 자동 추출 축의 첫 구현으로 TXT/CSV/XLSX/DOCX/텍스트 PDF 첨부 파일을 자동 추출해 assistant 근거에 저장한다.
Diff: `src/domains/file/text-extraction.ts`를 추가하고, file analysis API/service와 `/daily` assistant 파일 근거 UI에 자동 추출 경로를 연결했다. TXT/CSV UTF-8, XLSX `exceljs`, DOCX OOXML, 텍스트 PDF best-effort stream extraction을 지원한다.
Why: 사람이 파일 내용을 붙여 넣는 방식만으로는 법규/프로젝트 기준 문서 검색 품질과 MVP 파일 추출 범위를 충족하기 어렵다.
Verify/Time: 2026-05-14 17:10-17:35 KST, `npm run typecheck`, `npm run lint`, `npm run build` 통과. lint는 기존 React Hook warning 7개만 남음.
