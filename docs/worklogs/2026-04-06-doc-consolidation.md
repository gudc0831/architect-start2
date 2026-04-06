Req: 기존 PLAN들을 비교해 최신 로그인/배포 기준안을 루트 `PLAN.md` 하나로 통합하고 구버전 계획 문서를 정리
Diff: `PLAN.md` 최신 통합판으로 교체, `PLAN_LOGIN.md` 및 과거 계획 문서 삭제, 회의 기록 문서는 제거하고 worklog만 유지
Why: 저장소 기준선이 Firestore 중심 초기 계획에서 Supabase/Auth/Postgres/Storage 운영안으로 이동했고, 사용자 요청대로 최신 PLAN 하나만 남기기 위해
Verify/Time: 기존 `PLAN.md`, `PLAN_LOGIN.md`, 최신 저장소 구조(`package.json`, `README.md`, `docs/SUPABASE_MIGRATION.md`, `middleware.ts`, `prisma/schema.prisma`, `scripts/bootstrap-admin.ts`) 비교 확인 | 2026-04-06 14:35-15:05 KST
