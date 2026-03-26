# architect-start2 실행 수정안 (for Codex)

## 목적
현재 프로젝트를 `로컬 프로토타입` 상태에서 `로그인 가능한 다중 사용자 앱`의 기반까지 올린다.
이번 단계의 핵심은 새 기능 추가가 아니라 **기반 전환**이다.

이번 단계에서 반드시 해결할 것:
- 인증/세션 도입
- 저장소 기준선을 하나로 통일
- 서버 API 보안 강화
- 로컬 파일/JSON 중심 구조를 운영 기준선에서 제거
- 동시 편집 문제는 `강한 잠금`이 아니라 `version 기반 충돌 방지`로 먼저 해결

이번 단계에서 **하지 않을 것**:
- public signup
- password reset
- social login
- fine-grained RBAC
- task 강한 잠금(`task_locks`, heartbeat, lease)
- dual write
- Cloudflare/R2 연동
- Firestore 신규 기능 확장

---

## 최종 의사결정
이 문서를 기준으로 아래 결정을 고정한다.

### 1) 인프라 기준선
- **Database**: `Supabase Postgres`
- **File Storage**: `Supabase Storage`
- **Auth / Session**: `Supabase Auth (email/password)`
- **ORM**: `Prisma`
- **App Framework**: 기존 `Next.js App Router` 유지

### 2) Firebase / Firestore / Cloudflare
- `Firebase / Firestore`는 **장기 기준선에서 제외**한다.
- 기존 Firestore 코드는 **이관 소스 또는 임시 개발 보조**로만 남긴다.
- `Firebase Console`은 더 이상 운영 기준 관리도구로 보지 않는다.
- `Cloudflare`는 **지금 넣지 않는다**.
- 파일 다운로드량이 실제로 커져서 비용 또는 속도 이슈가 보일 때만 `Cloudflare R2` 또는 CDN 분리를 검토한다.

### 3) 인증 전략
- `users / auth_identities / sessions`를 앱에서 직접 처음부터 다시 만들지 않는다.
- **Supabase Auth를 그대로 사용**한다.
- 앱 자체에는 `public.profiles` 테이블만 두고, 역할(role)과 표시명(display name)만 관리한다.
- public signup은 열지 않는다.
- 관리자가 계정을 생성하는 방식으로 시작한다.

### 4) 동시 편집 전략
- 이번 단계에서는 `task_locks`를 도입하지 않는다.
- 먼저 `tasks.version` 기반의 **낙관적 동시성 제어(optimistic concurrency)** 를 넣는다.
- 저장 시 `version`이 다르면 `409 Conflict`를 반환한다.
- 충돌이 실제로 자주 발생하는 것이 확인되면 그때 `task_locks`를 2단계로 추가한다.

---

## 왜 이렇게 바꾸는가
현재 프로젝트는 아래 문제가 있다.

- 메모리/로컬 파일/Firestore가 혼합되어 저장소 기준선이 일관되지 않다.
- 프로젝트 정보와 작업/파일 정보가 서로 다른 저장소를 볼 수 있다.
- API에 인증/권한 검사가 부족하다.
- 업로드가 로컬 디스크 중심이라 운영 환경에 맞지 않는다.
- Firestore 구조는 현재 접근 패턴상 전체 스캔에 가까워질 가능성이 높아 장기 확장에 불리하다.
- 강한 잠금까지 한 번에 넣으면 구현량과 운영 복잡도가 너무 커진다.

즉, 이번 단계의 목표는 **안전하게 운영 가능한 기준선을 먼저 만드는 것**이다.

---

## 구현 원칙
Codex는 아래 원칙을 지켜서 수정한다.

1. 기존 `UI -> use-case -> repository` 구조는 유지한다.
2. App 전체를 새 프레임워크 스타일로 갈아엎지 않는다.
3. 인증/권한은 **클라이언트가 아니라 서버에서** 보장한다.
4. 저장소 기준선은 반드시 `Postgres + Supabase Storage` 하나로 통일한다.
5. 기존 memory/firestore 구현은 즉시 삭제하지 말고, import/cutover가 끝날 때까지 남긴다.
6. 운영 중 `dual write`는 하지 않는다.
7. 충돌 방지는 먼저 `version`으로 해결하고, 잠금은 후속 단계로 미룬다.
8. 내부 경로, 로컬 디스크 절대경로, 서버 파일 시스템 정보는 API 응답으로 노출하지 않는다.

---

## 목표 아키텍처

### 서버 측 기준선
- 인증: Supabase Auth
- 데이터 접근: Prisma + Postgres
- 파일 저장: Supabase Storage
- 권한 검증: Next.js server utilities + route handlers
- 페이지 보호: middleware

### 클라이언트 측 기준선
- 클라이언트는 `local_owner` 같은 하드코딩 사용자값을 더 이상 사용하지 않는다.
- 현재 사용자 상태는 `GET /api/auth/me` 또는 서버 주입 세션 정보만 사용한다.
- 수정 가능 여부는 서버 응답 기준으로 결정한다.

### 데이터 접근 기준선
- `ProjectRepository`, `TaskRepository`, `FileRepository`에 대응하는 `postgres` 구현을 추가한다.
- `src/repositories/index.ts`는 운영 환경에서 postgres 구현을 기본값으로 사용한다.
- Firestore는 신규 기능 대상이 아니다.

---

## 데이터 모델

아래는 이번 단계에서 최소로 고정해야 하는 모델이다.

### `profiles`
Supabase Auth의 `auth.users`와 1:1로 연결되는 앱용 프로필 테이블.

필드:
- `id uuid primary key` — `auth.users.id` 참조
- `email text not null unique`
- `display_name text not null`
- `role text not null check (role in ('admin', 'member'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

설명:
- 인증 자체는 Supabase Auth가 담당한다.
- 앱 권한과 화면 표시용 정보만 `profiles`에 둔다.

### `projects`
현재 로컬 파일에 따로 있던 프로젝트 메타를 Postgres로 이동한다.

필드(최소):
- `id uuid primary key`
- `name text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid null`
- `updated_by uuid null`

### `tasks`
현재 `TaskRecord`의 기존 업무 필드는 최대한 유지하되, 아래 필드를 반드시 추가한다.

추가 필드:
- `id uuid primary key`
- `project_id uuid not null`
- `task_number integer not null`
- `version integer not null default 1`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null`
- `created_at timestamptz not null default now()`
- `created_by uuid null`
- `deleted_at timestamptz null`

유지해야 하는 기존 구조 필드:
- 부모/자식 관계
- depth
- sibling order
- 휴지통 상태
- 제목/설명 등 현재 UI가 쓰는 업무 필드

제약:
- `unique(project_id, task_number)`

### `files`
현재 파일 메타데이터를 DB로 이동하고, 실제 바이너리는 Supabase Storage에 둔다.

필드(최소):
- `id uuid primary key`
- `task_id uuid not null`
- `project_id uuid not null`
- `original_name text not null`
- `mime_type text null`
- `size_bytes bigint not null`
- `storage_provider text not null default 'supabase-storage'`
- `storage_bucket text not null`
- `object_path text not null`
- `version integer not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `uploaded_by uuid null`
- `deleted_at timestamptz null`

중요:
- `storedPath` 같은 로컬 절대경로는 더 이상 저장하지 않는다.
- API는 `object_path`도 그대로 노출하지 말고, 필요 시 안전한 다운로드 URL 또는 다운로드용 API를 제공한다.

---

## 인증 설계

### 기본 방향
- `Supabase Auth`의 이메일/비밀번호 로그인만 먼저 사용한다.
- public signup은 막는다.
- 계정 생성은 관리자 seed 또는 Supabase admin API 기반으로만 한다.

### 구현 요구사항
1. `/login` 페이지 추가
2. 인증되지 않은 사용자는 보호 페이지 접근 시 `/login?next=...`로 이동
3. 인증된 사용자는 `/login` 접근 시 앱 메인으로 리다이렉트
4. 모든 보호 API는 `requireUser()`를 통과해야 함
5. `admin`만 허용하는 동작에는 `requireRole('admin')` 사용

### 권장 구현 방식
- `@supabase/ssr` 사용
- `middleware.ts`에서 세션 갱신 및 보호 경로 검사
- 서버 유틸 예시:
  - `src/lib/supabase/server.ts`
  - `src/lib/supabase/browser.ts`
  - `src/lib/auth/require-user.ts`
  - `src/lib/auth/require-role.ts`

### 앱 레벨에서 직접 만들지 않을 것
- 커스텀 `sessions` 테이블
- 커스텀 `auth_identities` 테이블
- 자체 비밀번호 해시 체계
- 자체 remember-me 설계

---

## API 재설계

이번 단계에서 API는 아래처럼 정리한다.

### 인증 관련
- `POST /api/auth/login`
  - 입력: `email`, `password`
  - 동작: Supabase Auth 로그인
  - 결과: 성공 시 세션 설정

- `POST /api/auth/logout`
  - 동작: 세션 종료

- `GET /api/auth/me`
  - 결과: 현재 사용자 정보 반환
  - 반환 예시:
    - `id`
    - `email`
    - `displayName`
    - `role`

### 프로젝트/작업/파일 관련
- 기존 `/api/project`, `/api/tasks`, `/api/tasks/[taskId]`, `/api/upload`, `/api/files`는 유지 가능하나 내부 구현은 postgres 기준으로 바꾼다.
- 모든 보호 API는 `requireUser()` 적용
- 모든 수정 API는 서버가 `updated_by`를 채운다.

### 충돌 방지 규칙
- `PATCH /api/tasks/[taskId]`는 반드시 현재 `version`을 받는다.
- 저장 쿼리는 아래 의미를 만족해야 한다.

```sql
update tasks
set
  ...,
  version = version + 1,
  updated_at = now(),
  updated_by = $currentUserId
where id = $taskId
  and version = $clientVersion
returning *;
```

- update 결과가 0건이면:
  - task가 없으면 `404`
  - task는 있지만 version mismatch면 `409 Conflict`

### 에러 응답 규칙
에러 코드는 최소 아래 기준으로 나눈다.
- `400 Bad Request` — 요청 형식 오류
- `401 Unauthorized` — 비로그인
- `403 Forbidden` — 권한 부족
- `404 Not Found` — 대상 없음
- `409 Conflict` — version 충돌
- `422 Unprocessable Entity` — 업무 규칙 위반
- `500 Internal Server Error` — 서버 내부 오류

에러 응답 형태는 통일한다.

예시:
```json
{
  "error": {
    "code": "TASK_VERSION_CONFLICT",
    "message": "다른 사용자가 먼저 수정했습니다. 최신 내용을 불러와 다시 시도하세요."
  }
}
```

---

## 파일 업로드 설계

### 운영 기준
- 운영 환경에서는 로컬 디스크 업로드를 기준선으로 사용하지 않는다.
- 실제 바이너리는 `Supabase Storage`에 저장한다.
- 로컬 디스크 업로드는 개발 모드 fallback으로만 남긴다.

### 업로드 규칙
- 파일 크기 제한 추가
- 허용 MIME / 확장자 화이트리스트 적용
- `taskId`가 실제 존재하는지 확인
- 파일명은 UUID 기반 안전 이름으로 변경
- object path 예시:
  - `projects/{projectId}/tasks/{taskId}/{uuid}-{safeFilename}`

### 보안 규칙
- private bucket 사용
- 다운로드는 signed URL 발급 또는 서버 proxy 중 하나로 구현
- 클라이언트에 서버 로컬 경로를 절대 노출하지 말 것

### 메타데이터 저장 규칙
DB에는 아래만 저장한다.
- bucket
- object_path
- original_name
- mime_type
- size_bytes
- version
- uploaded_by

저장하지 말 것:
- 로컬 절대경로
- 서버 파일 시스템 루트 정보

---

## 저장소 계층 변경

### 추가할 구현체
- `PostgresProjectRepository`
- `PostgresTaskRepository`
- `PostgresFileRepository`

### 유지할 것
- 기존 repository 인터페이스
- use-case 계층

### 변경할 것
- `src/repositories/index.ts`
  - 운영 기본값을 postgres로 전환
- Firestore 구현은 import 전용 또는 fallback 개발용으로만 유지
- 로컬 JSON 기반 project 저장소는 제거 대상

### 중요
- 이번 단계 완료 후 `project/task/file`이 서로 다른 저장소를 보지 않게 해야 한다.
- 저장소 기준선은 무조건 하나여야 한다.

---

## 현재 코드에서 반드시 바꿔야 하는 파일들

아래 파일 또는 동일 책임의 파일을 수정 대상으로 본다.

### 인증/앱 구조
- `src/providers/auth-provider.tsx`
  - `local-user`, `local_owner` 제거
  - 서버 세션 기반 현재 사용자 상태로 교체

- `src/app/layout.tsx`
  - 보호 영역과 공개 영역 구조 재정리

- `middleware.ts`
  - 보호 라우트 차단 및 세션 갱신

### API
- `src/app/api/project/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[taskId]/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/files/route.ts`
- `src/app/api/system/status/route.ts`
  - 내부 경로 노출 제거

### 저장소
- `src/repositories/index.ts`
- `src/repositories/postgres/*` 신규 추가
- 기존 `memory/*`, `firestore/*`는 즉시 삭제하지 말 것

### UI
- `src/components/tasks/task-workspace.tsx`
  - 현재 사용자/권한/409 충돌 처리 반영
  - 업로드 응답 구조 변경 반영
  - 필요 시 컴포넌트/훅으로 분리

### 서비스
- `task-service` 계열 코드
  - CRUD + version 충돌 처리 반영
  - `updated_by`, `updated_at` 채우기

---

## Prisma 및 마이그레이션

### 필수 작업
1. `prisma/schema.prisma` 추가 또는 갱신
2. Postgres 기준 테이블 정의
3. migration 생성
4. seed 스크립트 추가
5. admin bootstrap 경로 추가

### seed 정책
- 최초 admin 계정 1개 생성 가능하게 한다.
- public signup이 없으므로 운영 초기에 admin이 member 계정을 만들 수 있어야 한다.

### 주의
- 인증 사용자 생성은 Supabase Auth admin API를 사용하거나 초기 bootstrap 스크립트로 처리한다.
- `profiles` row도 함께 생성되어야 한다.

---

## 단계별 실행 순서

Codex는 아래 순서로 구현한다. 순서를 바꾸지 않는다.

### Phase 0. 준비
- Supabase 프로젝트 생성
- 환경변수 정리
- Prisma 도입
- `.env.example` 정리
- Supabase SSR 유틸 준비

필수 환경변수 예시:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Phase 1. Postgres/Storage 기반 추가
- Prisma schema 작성
- Postgres repositories 구현
- Supabase Storage provider 구현
- local dev fallback storage 유지
- `ProjectRepository`까지 Postgres 기준선으로 통일

완료 기준:
- project/task/file CRUD가 모두 Postgres + Storage 기준으로 동작
- 운영 경로에서 local JSON / local disk / Firestore에 의존하지 않음

### Phase 2. 인증/세션 도입
- `/login` 페이지 추가
- middleware 보호 라우트 적용
- `requireUser()`, `requireRole()` 구현
- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` 구현
- 기존 `local_owner` 제거

완료 기준:
- 보호 페이지는 로그인 없이는 접근 불가
- 보호 API는 로그인 없이는 `401`
- admin-only 동작은 `403` 처리 가능

### Phase 3. API 보안/응답 정비
- 모든 보호 API에 인증 적용
- 응답 shape 통일
- 내부 절대경로 노출 제거
- 업로드 검증 추가

완료 기준:
- 브라우저와 네트워크 응답 어디에도 로컬 절대경로가 보이지 않음
- 업로드 실패가 명확한 에러코드로 반환됨

### Phase 4. version 기반 충돌 방지
- `tasks.version` 추가
- 목록/상세 응답에 version 포함
- task 수정 API에서 version 필수화
- `409 Conflict` 처리 및 UI 반영

완료 기준:
- 같은 task를 두 사용자가 수정할 때 뒤늦은 저장은 `409`
- UI는 “최신 내용 재불러오기” 안내를 표시

### Phase 5. UI 전환 및 정리
- task workspace를 auth-aware 상태로 수정
- 필요 시 큰 컴포넌트 분리
- project name 수정/파일 업로드/휴지통 동작 모두 새 API 기준에 맞춤

완료 기준:
- 사용자가 누군지 UI가 실제 세션 기준으로 표시됨
- 기존 핵심 UX는 유지됨

### Phase 6. 데이터 import / cutover
- memory/Firestore/local file 데이터 import 스크립트 작성
- task/file/project 데이터 이관
- local uploads를 Supabase Storage로 업로드
- 행 수, 계층관계, 최신 파일 버전 검증
- postgres를 기본값으로 전환

완료 기준:
- import 후 주요 데이터가 손실 없이 보존됨
- 운영 기본 설정에서 Firestore/local JSON이 사용되지 않음

---

## Import / Cutover 정책

### 반드시 지킬 것
- 운영 중 dual write는 하지 않는다.
- 이관은 `one-time import -> 검증 -> cutover` 방식으로 한다.

### import 대상
- memory JSON 저장소 데이터
- Firestore 데이터
- local disk 업로드 파일

### import 절차
1. 기존 데이터 읽기
2. project/task/file를 Postgres용 shape로 변환
3. local files를 Supabase Storage에 업로드
4. 새 `files` row에 `bucket/object_path` 기록
5. task hierarchy와 file version 검증
6. 검증 통과 후 postgres 기본값 전환

### 검증 항목
- project 수
- task 수
- trash task 수
- file 수
- parent-child 관계
- task_number 연속성 또는 기존 번호 유지 여부
- 최신 파일 버전 보존 여부

---

## 비용/운영 기본 방침

### 지금 당장 하지 않을 것
- Cloudflare CDN/R2 별도 도입
- Firebase 유지 비용 최적화 작업
- realtime 기능
- websocket 잠금 시스템

### 기본 운영 방침
- 개발/검증 단계에서는 Supabase 단독 구성으로 시작
- 비용 모니터링은 `DB size`, `Storage size`, `Storage egress`, `Auth MAU` 중심으로 본다.
- 파일 다운로드 비용이 실제로 눈에 띄게 커질 때만 storage provider abstraction을 이용해 R2를 검토한다.

### storage abstraction 이유
지금 Cloudflare를 넣지는 않지만, 나중에 바꾸기 쉽게 아래 인터페이스를 둔다.

예시 책임:
- `upload(file, options)`
- `delete(objectPath)`
- `createSignedDownloadUrl(objectPath)`

이번 단계 구현체:
- `supabase-storage`
- `local-dev-storage`

---

## 테스트 계획

아래 테스트는 반드시 통과해야 한다.

### 인증/권한
- 비로그인 사용자는 보호 페이지 접근 시 `/login?next=...`로 이동
- 보호 API는 비로그인 시 `401`
- 권한 없는 사용자의 관리자 기능 호출은 `403`
- 로그인 후 새로고침해도 세션 유지
- 로그아웃 후 보호 페이지/API 접근 불가

### CRUD
- project/task/file CRUD가 postgres 기준으로 정상 동작
- task 계층 구조가 유지됨
- 휴지통 이동/복원 동작이 유지됨

### 업로드
- 허용되지 않은 파일 형식 거절
- 크기 제한 초과 파일 거절
- 존재하지 않는 taskId 업로드 거절
- 성공 시 파일 메타데이터와 storage object가 함께 생성됨

### 충돌 방지
- 같은 task를 두 클라이언트가 열고 저장 시, 먼저 저장한 쪽만 성공
- 뒤늦은 저장은 `409`
- UI가 최신 재불러오기 안내를 표시

### import
- memory/Firestore/local file import 후 행 수 보존
- parent-child 관계 보존
- 최신 파일 버전 보존
- 프로젝트명/작업/파일이 모두 같은 저장소 기준선에서 조회됨

---

## 절대 하지 말아야 하는 것

1. Supabase를 쓰면서 동시에 커스텀 인증 DB를 별도로 설계하지 말 것
2. 이번 단계에서 `task_locks`, `heartbeat`, `lease`, `lock_token`까지 넣지 말 것
3. 서버 절대경로를 API 응답에 넣지 말 것
4. `ProjectRepository`만 로컬 파일에 남겨두지 말 것
5. Firestore를 장기 기준선처럼 더 확장하지 말 것
6. local disk upload를 운영 기준선으로 유지하지 말 것
7. version 충돌을 클라이언트에서만 우회 처리하지 말 것. 반드시 서버에서 막을 것

---

## Codex 최종 작업 지시

아래 요구사항을 순서대로 구현하라.

1. `Supabase Postgres + Prisma + Supabase Storage + Supabase Auth`를 현재 프로젝트의 운영 기준선으로 도입하라.
2. `Project/Task/File` 저장소를 Postgres로 통일하라.
3. `local_owner` 기반 인증을 제거하고 Supabase Auth 세션 기반 구조로 바꿔라.
4. `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `middleware`, `requireUser`, `requireRole`을 구현하라.
5. 기존 `/api/project`, `/api/tasks`, `/api/tasks/[taskId]`, `/api/upload`, `/api/files`를 보호 API로 바꾸고 응답/에러 shape를 통일하라.
6. 업로드를 Supabase Storage 기반으로 바꾸고, 로컬 디스크 절대경로 노출을 제거하라.
7. `tasks.version`을 도입하고, task 수정 시 optimistic concurrency를 구현하라.
8. `409 Conflict`를 UI에서 처리하라.
9. memory/Firestore/local file 데이터를 위한 one-time import script를 작성하라.
10. 변경 파일 목록, 마이그레이션 방법, 환경변수, 테스트 방법, 남은 리스크를 문서화하라.

---

## 완료 조건
이 단계가 끝났다고 판단하는 기준은 아래와 같다.

- 로그인 없이 보호 페이지/API에 접근할 수 없다.
- project/task/file이 모두 같은 저장소 기준선(Postgres + Storage)을 본다.
- 로컬 절대경로가 브라우저/응답에 노출되지 않는다.
- task 저장 시 version 충돌이 서버에서 차단된다.
- 업로드가 Storage 기반으로 안전하게 동작한다.
- import 후 기존 데이터가 보존된다.
- Firestore/local JSON/local disk는 운영 기본경로에서 빠진다.

---

## 후속 단계 메모
이번 단계가 끝난 뒤에만 다음 항목을 검토한다.

- public signup
- password reset
- social login
- 세분화된 RBAC
- task 강한 잠금(`task_locks`)
- 실시간 협업 상태 표시
- Cloudflare R2/CDN 분리

이 순서를 지키는 이유는, 지금 필요한 것은 `협업 플랫폼 풀셋`이 아니라 `운영 가능한 안전한 기반선`이기 때문이다.
