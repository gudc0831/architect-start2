Req: 배포 플랜에 맞춰 영구삭제 제한, direct upload, task 단위 lazy file loading, download 시점 signed URL, 클라우드 프로젝트 동기화 공백의 세부 구현 순서를 문서화
Diff: `docs/2026-04-07-predeploy-implementation-plan.md` 신규 작성, `PLAN.md`에 배포 전 세부 구현 계획 링크 추가
Why: 기존 PLAN은 방향만 있고 현재 코드 구조 기준의 구현 순서, 완료 기준, 검증 루프가 부족해서
Verify/Time: `PLAN.md`, `docs/2026-04-06-phase1-cost-preservation-upload-plan.md`, `.env.local`, `npm run data:doctor`, `src/app/api/upload/route.ts`, `src/app/api/files/route.ts`, `src/app/api/files/[fileId]/route.ts`, `src/app/api/trash/bulk-delete/route.ts`, `src/providers/project-provider.tsx`, `src/providers/dashboard-provider.tsx`, `src/use-cases/admin/admin-service.ts` 확인 | 2026-04-07 10:45-11:05 KST
