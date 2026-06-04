Req: 업로드된 법규/프로젝트 기준 문서의 실제 검색 품질을 올리기 위해 assistant retrieval을 현재 task 첨부 파일에서 프로젝트 전체 분석 완료 파일로 확장한다.
Diff: File repository contract에 `listFilesByProject(projectId)`를 추가하고 local/firestore/postgres 구현을 붙였다. `retrieveAssistantEvidence`는 현재 task 파일을 유지하면서 project-wide file analysis lexical ranking 결과를 추가 `project_document` evidence로 반환한다.
Why: 파일 자동 추출만 있어도 retrieval이 현재 task 파일에 갇혀 있으면 공통 기준 문서나 법규 PDF가 assistant 근거에 들어오지 않는다.
Verify/Time: 2026-05-14 17:35 KST, `npm run typecheck`, `npm run lint`, `npm run build` 통과. lint는 기존 React Hook warning 7개만 남음.
