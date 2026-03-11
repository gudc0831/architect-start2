# Architect Start2

Supabase/Postgres 기반 협업 작업 관리 앱입니다. 현재 운영 기준선은 다음과 같습니다.

- 인증: `Supabase Auth` 이메일/비밀번호 로그인
- 데이터: `Supabase Postgres + Prisma`
- 파일: `Supabase Storage` private bucket
- 앱: `Next.js App Router`
- 동시 수정 방지: `tasks.version` 기반 optimistic concurrency

## 환경 준비

1. `.env.example`를 `.env.local`로 복사합니다.
2. 아래 값들을 채웁니다.
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
3. 레거시 import가 필요하면 Firebase public env도 채웁니다.
4. 의존성을 설치합니다.

```bash
npm install
```

## DB 초기화

Prisma 설정은 `.env.local`도 읽도록 맞춰져 있습니다.

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

`db:seed`는 기본 프로젝트 1개를 생성합니다.

## 관리자 계정 부트스트랩

다음 env를 채운 뒤 실행합니다.

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`

```bash
npm run bootstrap:admin
```

이 스크립트는 다음을 수행합니다.

- Supabase Auth admin 사용자 생성 또는 갱신
- `profiles` 테이블 upsert
- 기본 프로젝트가 없으면 생성

## 개발 실행

```bash
npm run dev
```

보호 페이지는 로그인 없이 접근할 수 없고 `/login?next=...`로 이동합니다.

## 레거시 데이터 가져오기

지원 소스:

- `--source=local`: `LOCAL_DATA_ROOT` 아래 JSON + 로컬 업로드 파일
- `--source=firestore`: 기존 Firestore 컬렉션
- `--source=auto`: local 우선, 없으면 Firestore

기본 실행:

```bash
npm run import:legacy -- --source=auto
```

원본 파일이 일부 없어도 우선 진행하려면:

```bash
npm run import:legacy -- --source=local --skip-missing-files
```

이 스크립트는 다음 순서로 동작합니다.

1. 레거시 project/task/file 읽기
2. task 번호를 정규화하고 stable UUID로 매핑
3. Postgres에 project/task upsert
4. 로컬 파일을 현재 storage provider로 업로드
5. `files` 메타데이터 upsert
6. 행 수와 휴지통 수를 검증

## 검증 명령

```bash
npm run typecheck
npm run lint
npm run build
```

`build`는 다른 `next dev` 프로세스가 `.next`를 점유 중이면 Windows에서 `EPERM`으로 실패할 수 있습니다.

## 주요 동작

- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- 보호 API는 모두 `requireUser()` 기반
- task 수정은 항상 `version`을 보내야 하며 충돌 시 `409`
- 파일 응답에는 로컬 절대경로를 내보내지 않고 `downloadUrl`만 제공합니다.

## 추가 문서

- [Supabase Migration Guide](docs/SUPABASE_MIGRATION.md)