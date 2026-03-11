# Supabase Migration Guide

## 범위

이번 단계의 목표는 다음 4가지를 운영 기준으로 고정하는 것입니다.

1. `Supabase Auth` 기반 로그인
2. `Postgres + Prisma` 단일 데이터 저장소
3. `Supabase Storage` 기반 파일 저장
4. `tasks.version` 기반 충돌 방지

이번 단계에 포함하지 않는 항목:

- public signup
- password reset
- social login
- task lock/heartbeat/lease
- realtime
- 관리자 UI

## 마이그레이션 순서

1. `.env.local` 작성
2. `npm install`
3. `npm run db:generate`
4. `npm run db:push`
5. `npm run db:seed`
6. `npm run bootstrap:admin`
7. 필요하면 `npm run import:legacy -- --source=...`
8. `npm run typecheck`
9. `npm run lint`
10. `npm run build`

## 필수 환경 변수

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=task-files
USE_POSTGRES_PRIMARY=true
```

레거시 import가 필요하면 아래도 채웁니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
LOCAL_DATA_ROOT=
LOCAL_UPLOAD_ROOT=
```

## 계정 부트스트랩 체크리스트

- Supabase 프로젝트 생성
- Email/Password auth 활성화
- service role key 확인
- `BOOTSTRAP_ADMIN_EMAIL` 입력
- `BOOTSTRAP_ADMIN_PASSWORD` 입력
- `npm run bootstrap:admin`
- `/login`에서 로그인 확인

## import 체크리스트

- local JSON 또는 Firestore 중 원본 선택
- 로컬 업로드 파일 경로 확인
- `npm run import:legacy -- --source=...`
- 출력 JSON에서 `ok: true` 확인
- task 수 / trash task 수 / file 수 확인
- 상위-하위 task 관계 확인
- 최신 파일 version 확인

## cutover 기준

아래가 모두 만족되면 운영 기본값을 Postgres/Supabase로 봅니다.

- `USE_POSTGRES_PRIMARY=true`
- 로그인 없이 보호 페이지 접근 불가
- project/task/file이 모두 같은 저장소를 본다
- 파일 응답에 로컬 절대경로가 없다
- task 수정 충돌 시 `409`가 난다
- import 검증 결과가 일치한다

## 남은 리스크

- Windows에서 다른 `next dev`가 `.next`를 점유하면 `npm run build`가 실패할 수 있습니다.
- Firestore import는 기존 보안 규칙에 따라 읽기 권한이 필요합니다.
- `--skip-missing-files`로 import하면 file count가 줄 수 있습니다.