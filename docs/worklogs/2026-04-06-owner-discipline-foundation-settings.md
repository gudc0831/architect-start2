Req: 작업 상세의 책임 분야를 admin 전역 설정값으로 통일하고 일반 UI에서는 숨기며 export에도 같은 값이 나오게 변경.
Diff: foundation settings 도메인/API/repository와 admin 저장 UI를 추가하고 task create/update/reorder/list/export가 현재 ownerDiscipline 설정값만 사용하도록 정규화.
Why: task별 legacy 값 대신 admin 단일 기준으로 책임 분야를 일관되게 조회·수정·엑셀 출력하기 위해.
Verify/Time: `npm run data:doctor`; `npm run data:backup`; `npm run db:generate`; `npm run typecheck`; `npx tsx scripts/task-export-verify.ts --file output/owner-discipline-export.xlsx`; Postgres migration 미실행.
