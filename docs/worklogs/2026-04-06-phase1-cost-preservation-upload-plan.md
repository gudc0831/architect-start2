Req: `PLAN.md`를 잇는 후속 계획으로 `프로젝트 2개/사용자 10명` 월 비용 시뮬레이션, 데이터 절대보존 운영안, 첨부파일 업로드 구조 개편안 정리
Diff: `PLAN.md`에 후속 상세 계획 섹션 추가, `docs/2026-04-06-phase1-cost-preservation-upload-plan.md` 신규 작성
Why: 기준선 문서와 실제 운영 숫자/보존 정책/첨부 구조 개편안을 분리해 의사결정 가능한 상태로 만들기 위해
Verify/Time: 저장소 코드(`src/app/api/upload/route.ts`, `src/use-cases/file-service.ts`, `src/storage/supabase-storage.ts`, `src/components/tasks/task-workspace.tsx`, `src/repositories/postgres/store.ts`, `src/use-cases/trash-service.ts`)와 공식 문서(Vercel/Supabase pricing, backups, PITR, uploads) 대조 확인 | 2026-04-06 15:20-15:55 KST
