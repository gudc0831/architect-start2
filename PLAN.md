# Architect Start 운영 PLAN

- 기준일: 2026-04-06
- 문서 목적: 현재 합의된 운영규칙만 간단히 유지
- 상세 회의 기록: [`docs/PLAN_MEETING_LOG.md`](docs/PLAN_MEETING_LOG.md)

## 1. 현재 단계

- 지금은 `개인 검증 단계`
- 개인 검증이 끝나고 내부 업무에서 실제 사용이 시작되면 운영 단계로 전환

## 2. 현재 기준 기술 축

- 앱: `Next.js App Router`
- 인증: `Supabase Auth`
- DB: `Supabase Postgres + Prisma`
- 파일 저장: `Supabase Storage`
- 코드 원본 저장소: `로컬 + GitHub`
- 배포: `GitHub -> Vercel`

## 3. 현재 운영규칙

### 코드와 배포

- 개발은 계속 로컬에서 진행
- GitHub가 팀 기준 원본 저장소 역할을 함
- Vercel은 GitHub 커밋을 읽어 preview / production 배포를 만듦

### 브랜치 역할

- `feat/*`: 개별 작업 브랜치
- `main`: 통합 검증 브랜치
- `release` 또는 production branch: 실제 운영 배포 브랜치

### 개인 검증 시작안

- `Vercel Hobby`
- `Supabase Free`
- 배포/관리 권한자 1명
- 비용 기준: `월 0원`

주의:

- 이 조합은 `개인 검증` 전용으로 본다.
- 내부 업무에 실제로 쓰기 시작하면 `Vercel Pro`로 전환한다.

### 환경 분리

- 로컬 개발: `APP_BACKEND_MODE=local`
- preview 검증: `test용 Supabase 프로젝트`
- production: `prod용 Supabase 프로젝트`

핵심 규칙:

- `preview`와 `production`은 같은 Supabase 프로젝트를 쓰지 않는다.

### 배포와 DB 변경 분리

- 배포는 `build + deploy`만 수행
- migration / seed / bootstrap admin은 자동 배포에 넣지 않는다
- cloud DB 변경은 수동으로만 실행

실행 전 규칙:

- cloud 변경 전에는 `npm run data:backup`
- 필요한 경우에만 수동 실행
  - `npm run db:migrate:safe`
  - `npm run db:seed:safe`
  - `npm run bootstrap:admin`

### 관리자 기준 변경 규칙

- 관리자 기준 변경은 먼저 `preview + test DB`에서 검증
- 확인 후에만 production에 반영
- foundation / work type / category 변경은 기존 task의 표시/허용값에 영향을 줄 수 있으므로 바로 prod에서 시험하지 않는다

### 데이터 유실 방지 규칙

- 배포 자체는 데이터를 직접 삭제하지 않는다
- 디자인 변경만으로 DB/Storage 데이터가 유실되지는 않는다
- 실제 위험은 아래에서 발생한다
  - preview/prod DB 혼용
  - 수동 migration/seed 오실행
  - 영구삭제 API 실행
  - 운영자 실수로 bucket/project 삭제

제품 정책:

- 사용자가 삭제하면 삭제되게 둘 수 있다
- 대신 운영 사고 방지용 백업은 유지한다
- 즉, `사용자 복구 기능`과 `운영 백업`은 분리해서 본다

### 첨부파일 운영 방향

현재 구조:

- Vercel 서버 경유 업로드
- 프로젝트 전체 파일 목록 선조회

목표 구조:

- `Supabase direct upload`
- `task 단위 lazy file loading`
- `download 시점 signed URL 발급`

### 추후 권한 구조 예약

- 지금은 `admin / member`와 프로젝트 멤버십 관리 뼈대만 있음
- 후속 기능으로 `프로젝트별 viewer / editor / manager / admin` 권한 구조를 설계한다
- 적용 시점에는 프로젝트 목록 조회, task/file/project 수정 API, 관리자 URL 접근을 모두 역할 기준으로 재검토한다

## 4. 전환 시점

### Vercel Hobby -> Pro

아래 중 하나라도 해당하면 `Vercel Pro`로 전환한다.

1. 개인 검증이 끝나고 내부 업무에서 실제 사용을 시작할 때
2. 유급 인력 / 팀 협업이 붙을 때
3. Hobby 한도 또는 pause 리스크를 감수하기 어려울 때
4. 운영 수준 안정성이 필요할 때

### Supabase Free -> Pro

아래 중 하나라도 해당하면 `Supabase Pro`를 검토한다.

1. Free 용량/트래픽 한도가 불편해질 때
2. 운영 백업/복구 관리가 더 필요할 때
3. 첨부파일 사용량이 늘어날 때
4. 실제 내부 업무 데이터가 안정적으로 쌓이기 시작할 때

## 5. 지금 바로 실행할 운영안

1. 당분간 `Vercel Hobby + Supabase Free`
2. 개인 검증은 `preview deployment`에서 수행
3. 로컬은 계속 `APP_BACKEND_MODE=local`
4. preview는 반드시 test용 Supabase에 연결
5. prod는 아직 열지 않거나, 열더라도 별도 prod Supabase로만 연결
6. migration/seed/admin bootstrap은 배포와 분리해서 수동 실행
7. cloud 변경 전에는 `npm run data:backup`

## 6. 배포 전 세부 구현 계획

- 배포 전 필수 구현 항목의 실제 작업 순서, 파일별 진입점, 완료 기준, 검증 루프는 [`docs/2026-04-07-predeploy-implementation-plan.md`](docs/2026-04-07-predeploy-implementation-plan.md)를 기준으로 본다.

## 7. 참고 문서

- 회의록 누적본: [`docs/PLAN_MEETING_LOG.md`](docs/PLAN_MEETING_LOG.md)
- 이전 상세 검토: [`docs/2026-04-06-phase1-cost-preservation-upload-plan.md`](docs/2026-04-06-phase1-cost-preservation-upload-plan.md)
- 플랫폼 handoff: [`docs/2026-04-06-platform-decision-handoff.md`](docs/2026-04-06-platform-decision-handoff.md)
- 배포 전 세부 구현 계획: [`docs/2026-04-07-predeploy-implementation-plan.md`](docs/2026-04-07-predeploy-implementation-plan.md)

## 8. 멀티유저 전환 계획

- 멀티유저 전환의 실제 구현 순서, 대상 파일, 권한/멤버십/동시성 처리 기준은 [`docs/2026-04-07-multi-user-transition-plan.md`](docs/2026-04-07-multi-user-transition-plan.md)에서 관리한다.
- `PLAN.md`는 운영 방향과 상세 계획 문서로 들어가는 길잡이 역할만 유지한다.
- 1차 멀티유저 권한 모델은 `admin / manager / member`로 고정한다.
- `viewer / editor` 권한은 2차 확장 단계에서 별도 설계한다. 이후 작업에서 누락하지 않도록 멀티유저 상세 계획 문서에서 계속 추적한다.
- `local` 모드는 단일 사용자 개발 보조 모드로만 유지하고, 실제 멀티유저 검증 책임은 `cloud` 모드에만 둔다.
- 멀티유저 사용자 식별은 Google 이메일 로그인 기준으로 설계하고, 협업 표시용 `shortName`은 3글자 이내 자동 생성 규칙을 별도 계획 문서에서 관리한다.
- `admin`은 모든 프로젝트에 전역 접근 권한을 가지며, 프로젝트별 역할 구분은 1차에서 `manager / member`로만 본다.
- 협업 UX 기준은 Google Sheets형 공동 작업 경험으로 두고, 그리드 반응성/기술 선택은 [`docs/2026-04-07-spreadsheet-grid-performance-plan.md`](docs/2026-04-07-spreadsheet-grid-performance-plan.md)와 함께 본다.

## 9. 스프레드시트급 반응성 전환 계획

- daily grid를 Google Sheets / Excel에 가까운 체감 성능으로 전환하는 계획은 앞으로의 계획에 포함한다.
- `PLAN.md`에는 항목만 유지하고, 실제 단계별 구현 순서와 기준은 [`docs/2026-04-07-spreadsheet-grid-performance-plan.md`](docs/2026-04-07-spreadsheet-grid-performance-plan.md)에서 관리한다.
