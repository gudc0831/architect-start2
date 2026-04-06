# PLAN 회의록

- 목적: 날짜별 파일을 늘리지 않고, 이 파일 하나에 회의 결론을 계속 누적 기록
- 기록 규칙:
  - 새 회의는 아래에 날짜 섹션을 추가
  - 각 회의는 `논의 주제 / 결론 / 운영규칙 / 다음 액션`만 간단히 기록
  - 최신 운영규칙 요약은 항상 [`../PLAN.md`](../PLAN.md)를 우선 기준으로 본다

## 2026-04-06

### 논의 주제

- 배포 플랫폼 선택
- Supabase 비용과 Free/Pro 시작 기준
- Vercel Hobby 사용 가능 여부와 Pro 전환 시점
- 개인 검증 흐름
- 데이터 유실 리스크와 운영규칙
- 첨부파일 업로드 구조 방향
- 문서 구조 단순화

### 결론

- 개인 검증 단계는 `Vercel Hobby + Supabase Free`로 시작 가능
- 소스코드 원본은 계속 `로컬 + GitHub`
- Vercel은 GitHub 커밋을 읽어 preview / production 배포를 수행
- 개인 검증은 `preview deployment`를 검증 서버로 사용
- 내부 업무에서 실제 사용을 시작하는 시점에는 `Vercel Pro`로 전환
- 배포 자체는 데이터를 직접 삭제하지 않음
- 실제 데이터 유실 위험은 `preview/prod DB 혼용`, `수동 migration/seed`, `영구삭제 API`, `운영자 실수`
- 사용자 삭제는 서비스 정책대로 두되, 운영 사고 방지용 백업은 유지
- 첨부파일은 장기적으로 `direct upload + task 단위 lazy loading + on-demand signed URL` 구조로 전환

### 운영규칙

1. 개발은 계속 로컬에서 진행하고 GitHub를 원본 저장소로 사용
2. 개인 검증은 `feat/* -> GitHub push -> Vercel preview` 흐름으로 수행
3. 로컬은 `APP_BACKEND_MODE=local`
4. preview는 `test용 Supabase`, production은 `prod용 Supabase`만 사용
5. preview와 production은 같은 Supabase 프로젝트를 절대 공유하지 않음
6. 배포와 DB 변경 작업은 분리
7. migration / seed / bootstrap admin은 자동 배포에 넣지 않음
8. cloud 변경 전에는 `npm run data:backup`
9. 관리자 기준 변경은 먼저 preview + test DB에서 검증
10. 내부 업무가 시작되면 `Vercel Pro`로 전환

### 다음 액션

- preview가 바라볼 test용 Supabase 프로젝트를 분리
- production branch를 `release` 등으로 확정
- 운영 DB 변경 작업을 수동 절차로 유지
- 첨부 direct upload 개편은 별도 작업으로 진행
