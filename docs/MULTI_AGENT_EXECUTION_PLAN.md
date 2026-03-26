# Multi-Agent Execution Plan

## 현재 프로젝트 구조 요약

- `src/app`
  - 페이지 라우트: `board`, `daily`, `calendar`, `trash`, `login`
  - API 라우트: `auth`, `tasks`, `files`, `upload`, `project`, `preferences`, `system/status`
- `src/components`
  - 인증 UI: `auth`
  - 레이아웃/UI 셸: `layout`
  - 핵심 작업 UI: `tasks/task-workspace.tsx`
- `src/providers`
  - `auth-provider.tsx`
  - `project-provider.tsx`
- `src/use-cases`
  - `task-service.ts`
  - `file-service.ts`
  - `project-service.ts`
  - `preference-service.ts`
- `src/repositories`
  - `contracts.ts`
  - `index.ts`
  - 저장소 구현: `postgres`, `firestore`, `memory`, `local`
- `src/storage`
  - `supabase-storage.ts`
  - `local-dev-storage.ts`
- `prisma`
  - `schema.prisma`
  - `migrations`
  - `seed.ts`
- `scripts`
  - `bootstrap-admin.ts`
  - `import-legacy-data.ts`

현재 구조상 가장 큰 충돌 지점은 아래 파일들이다.

- `src/components/tasks/task-workspace.tsx`
- `src/app/globals.css`
- `src/repositories/postgres/store.ts`
- `src/repositories/index.ts`
- `prisma/schema.prisma`
- `middleware.ts`

원칙:

- 위 파일들은 한 번에 한 에이전트만 소유한다.
- 공통 파일 수정이 필요하면 임의로 진행하지 말고 먼저 보고한다.
- 모든 에이전트는 `main` 최신 상태에서 자기 브랜치를 따고 시작한다.

## 권장 분배안

### 권장안: 5명

이 프로젝트는 5명으로 나누는 것이 가장 안정적이다. 이유는 프론트 UI 허브, 인증, 태스크 도메인, 파일 파이프라인, 프로젝트 메타데이터가 서로 다른 계층에 있기 때문이다.

| Agent | 역할 | 주요 소유 범위 | 수정 금지 핵심 범위 |
| --- | --- | --- | --- |
| Agent 1 | 인증/세션 | `src/app/login`, `src/components/auth`, `src/app/api/auth`, `src/lib/auth`, `src/providers/auth-provider.tsx`, `middleware.ts` | `task-workspace.tsx`, `prisma/schema.prisma` |
| Agent 2 | 앱 셸/프로젝트 메타데이터 | `src/components/layout`, `src/providers/project-provider.tsx`, `src/app/api/project`, `src/app/layout.tsx`, 필요 시 `src/app/globals.css`의 셸 영역 | `task-workspace.tsx`, `src/app/api/tasks`, `prisma/**` |
| Agent 3 | 태스크 UI/화면 동작 | `src/components/tasks/task-workspace.tsx`, `src/app/board`, `src/app/daily`, `src/app/calendar`, `src/app/trash`, 필요 시 `src/app/globals.css`의 워크스페이스 영역 | `middleware.ts`, `src/app/api/auth`, `prisma/**` |
| Agent 4 | 태스크 API/도메인/저장소 | `src/app/api/tasks`, `src/use-cases/task-service.ts`, `src/domains/task`, `src/repositories/contracts.ts`, `src/repositories/postgres/store.ts` 내 task 관련 구간 | `task-workspace.tsx`, `src/storage/**`, `src/app/api/files` |
| Agent 5 | 파일 업로드/스토리지/설정 지속화 | `src/app/api/files`, `src/app/api/upload`, `src/app/api/preferences`, `src/use-cases/file-service.ts`, `src/use-cases/preference-service.ts`, `src/storage/**`, `scripts/import-legacy-data.ts`, 필요 시 `prisma/**`의 파일/프로필 설정 영역 | `task-workspace.tsx`, `middleware.ts`, `src/app/api/tasks` |

### 축소안: 4명

4명으로 줄일 때는 Agent 2와 Agent 3을 합친다.

- Agent 1: 인증/세션
- Agent 2: 앱 셸 + 프로젝트 메타데이터 + 태스크 UI
- Agent 3: 태스크 API/도메인/저장소
- Agent 4: 파일 업로드/스토리지/설정 지속화

주의:

- 이 경우 `src/app/globals.css`와 `src/components/tasks/task-workspace.tsx` 충돌 가능성이 올라간다.
- Agent 2만 `src/app/globals.css`를 수정하도록 고정한다.

### 축소안: 3명

3명으로 줄일 때는 프론트엔드/백엔드 경계 중심으로 묶는다.

- Agent 1: 인증/세션 + 앱 셸 + 프로젝트 메타데이터
- Agent 2: 태스크 UI 전체
- Agent 3: 태스크 API + 파일 API + 저장소 + Prisma + 스크립트

주의:

- 3명 체제에서는 Agent 3이 `src/repositories/postgres/store.ts`와 `prisma/schema.prisma` 전체를 단독 소유해야 한다.
- Agent 2는 `task-workspace.tsx` 외 서버 계층 변경 금지.

## 에이전트 공통 운영 규칙

- 브랜치 이름은 `codex/agent-*` 형태로 만든다.
- 변경은 자기 소유 범위 안에서만 한다.
- 자기 범위를 넘는 수정이 필요하면 멈추고 충돌 가능 파일을 보고한다.
- 완료 전 최소 검증:
  - `npm run lint`
  - `npm run typecheck`
- 아래를 건드렸다면 추가로 `npm run build`까지 실행한다.
  - `middleware.ts`
  - `src/app/layout.tsx`
  - `src/providers/**`
  - `src/app/api/**`
  - `prisma/**`
- 보고 형식은 아래 4줄로 고정한다.
  - 변경 파일
  - 핵심 변경점
  - 실행한 검증
  - 남은 리스크

## 바로 붙여넣을 실전 프롬프트

아래 프롬프트는 5명 권장안 기준이다. 4명 또는 3명으로 운영할 때는 위의 축소 규칙에 따라 역할을 합쳐서 사용하면 된다.

### Agent 1 프롬프트

```text
너는 이 프로젝트의 인증/세션 담당 에이전트다.

프로젝트 컨텍스트:
- Next.js App Router + React 19 + Prisma + Supabase 기반이다.
- 로그인 페이지, 세션 확인, 보호 라우트, 인증 API, auth provider가 이미 존재한다.
- main 기준으로 병렬 작업 중이며, 다른 에이전트와 충돌을 줄이는 것이 중요하다.

작업 브랜치:
- codex/agent-auth

수정 가능 범위:
- src/app/login/**
- src/components/auth/**
- src/app/api/auth/**
- src/lib/auth/**
- src/providers/auth-provider.tsx
- middleware.ts

수정 금지 범위:
- src/components/tasks/task-workspace.tsx
- src/app/api/tasks/**
- src/app/api/files/**
- src/storage/**
- prisma/**

작업 목표:
- 인증 흐름, 로그인 UX, 세션 확인, 보호 라우트 처리, 로그아웃 흐름 중 네 범위 안에서 필요한 개선을 구현한다.
- placeholder auth와 real auth 전환 구간에서 깨질 수 있는 흐름을 우선 점검한다.
- preview 경로와 보호 경로가 충돌하지 않게 유지한다.

작업 규칙:
- 네 범위 밖 파일 수정이 필요하면 임의로 건드리지 말고 파일 경로와 이유만 보고한다.
- 기능 변경이 있다면 기존 동작을 깨지 않도록 최소 범위로 수정한다.

완료 전 검증:
- npm run lint
- npm run typecheck
- npm run build

최종 보고 형식:
- 변경 파일:
- 핵심 변경점:
- 실행한 검증:
- 남은 리스크:
```

### Agent 2 프롬프트

```text
너는 이 프로젝트의 앱 셸/프로젝트 메타데이터 담당 에이전트다.

프로젝트 컨텍스트:
- 사이드바, 프로젝트 이름 동기화, 앱 셸, 루트 레이아웃, 프로젝트 메타데이터 API가 이미 존재한다.
- main 기준 병렬 작업이며 task-workspace.tsx는 다른 에이전트가 소유한다.

작업 브랜치:
- codex/agent-shell

수정 가능 범위:
- src/components/layout/**
- src/providers/project-provider.tsx
- src/app/api/project/**
- src/app/layout.tsx
- src/app/globals.css 중 셸/사이드바/레이아웃 관련 구간만

수정 금지 범위:
- src/components/tasks/task-workspace.tsx
- src/app/api/tasks/**
- src/app/api/files/**
- src/storage/**
- prisma/**

작업 목표:
- 레이아웃, 사이드바, 프로젝트 이름 편집/동기화, 전역 셸 UX를 개선한다.
- preview와 실제 앱 경로 모두에서 셸 동작이 일관되게 유지되도록 정리한다.
- task workspace 내부 로직은 건드리지 않는다.

작업 규칙:
- src/app/globals.css를 수정할 때는 셸 관련 selector만 만진다.
- task workspace 스타일과 충돌할 가능성이 있으면 변경 범위를 최소화하고 이유를 보고한다.

완료 전 검증:
- npm run lint
- npm run typecheck
- npm run build

최종 보고 형식:
- 변경 파일:
- 핵심 변경점:
- 실행한 검증:
- 남은 리스크:
```

### Agent 3 프롬프트

```text
너는 이 프로젝트의 태스크 UI/화면 동작 담당 에이전트다.

프로젝트 컨텍스트:
- board, daily, calendar, trash 화면은 모두 src/components/tasks/task-workspace.tsx를 중심으로 동작한다.
- 이 파일은 현재 가장 큰 공용 UI 허브다.
- 다른 에이전트가 인증, 파일, API, Prisma를 맡고 있으므로 네 작업은 프론트엔드 상호작용과 화면 품질에 집중해야 한다.

작업 브랜치:
- codex/agent-task-ui

수정 가능 범위:
- src/components/tasks/task-workspace.tsx
- src/app/board/**
- src/app/daily/**
- src/app/calendar/**
- src/app/trash/**
- src/app/globals.css 중 task workspace 관련 구간만

수정 금지 범위:
- middleware.ts
- src/app/api/auth/**
- src/app/api/tasks/**
- src/app/api/files/**
- src/storage/**
- prisma/**

작업 목표:
- task workspace의 상호작용, 레이아웃, 폼 동작, 반응형 동작, 보드/캘린더/데일리/휴지통 화면 품질을 개선한다.
- 기존 API 계약은 유지한다.
- 새 API 필드가 필요하면 직접 추가하지 말고 필요한 필드와 이유를 보고한다.

작업 규칙:
- task-workspace.tsx는 네가 단독 소유한다.
- 서버 응답 형식 변경 없이 해결 가능한 범위부터 처리한다.
- 공통 CSS를 바꿀 때는 workspace 영역에 한정한다.

완료 전 검증:
- npm run lint
- npm run typecheck
- UI 동작에 영향이 크면 npm run build

최종 보고 형식:
- 변경 파일:
- 핵심 변경점:
- 실행한 검증:
- 남은 리스크:
```

### Agent 4 프롬프트

```text
너는 이 프로젝트의 태스크 API/도메인/저장소 담당 에이전트다.

프로젝트 컨텍스트:
- 태스크 목록, 생성, 수정, 휴지통 이동/복원, 부모-자식 구조, version 기반 optimistic concurrency가 이미 존재한다.
- 서버 계층은 use-case -> repository -> postgres store 구조다.
- UI 파일은 다른 에이전트가 맡고 있으니 API 계약 안정성을 우선한다.

작업 브랜치:
- codex/agent-task-api

수정 가능 범위:
- src/app/api/tasks/**
- src/use-cases/task-service.ts
- src/domains/task/**
- src/repositories/contracts.ts
- src/repositories/postgres/store.ts 중 task 관련 구간
- 필요 시 src/repositories/index.ts

수정 금지 범위:
- src/components/tasks/task-workspace.tsx
- src/app/api/files/**
- src/storage/**
- middleware.ts
- prisma/schema.prisma 전체 구조 변경은 사전 보고 없이 금지

작업 목표:
- 태스크 도메인 로직, API 검증, 부모-자식 정합성, version 충돌 처리, 휴지통/복원 흐름을 개선한다.
- 저장소 계층 수정 시 기존 반환 타입과 사용처 호환성을 유지한다.

작업 규칙:
- 파일 업로드/다운로드 계약은 건드리지 않는다.
- Prisma 스키마 수정이 필요하면 먼저 어떤 모델/필드가 필요한지 보고한다.
- repository 공용 계약을 바꾸면 영향 파일을 함께 정리한다.

완료 전 검증:
- npm run lint
- npm run typecheck
- npm run build

최종 보고 형식:
- 변경 파일:
- 핵심 변경점:
- 실행한 검증:
- 남은 리스크:
```

### Agent 5 프롬프트

```text
너는 이 프로젝트의 파일 업로드/스토리지/설정 지속화 담당 에이전트다.

프로젝트 컨텍스트:
- 파일 목록, 업로드, 버전 업로드, 휴지통 이동/복원, signed download URL, quick-create width preference 저장 로직이 존재한다.
- storage provider는 Supabase와 local dev 구현으로 분리되어 있다.
- 필요 시 legacy import 스크립트와 Prisma 스키마 일부까지 다룰 수 있다.

작업 브랜치:
- codex/agent-files

수정 가능 범위:
- src/app/api/files/**
- src/app/api/upload/**
- src/app/api/preferences/**
- src/use-cases/file-service.ts
- src/use-cases/preference-service.ts
- src/storage/**
- scripts/import-legacy-data.ts
- prisma/** 중 파일/프로필 설정 관련 구간만
- 필요 시 src/repositories/postgres/store.ts 중 file/preference 관련 구간

수정 금지 범위:
- src/components/tasks/task-workspace.tsx
- src/app/api/tasks/**
- middleware.ts
- src/app/login/**

작업 목표:
- 파일 업로드/버전 관리/휴지통/복원/다운로드 흐름과 quick-create width preference 저장 흐름을 개선한다.
- storage provider 교체 지점과 Postgres persistence 사이 계약을 안정적으로 유지한다.
- import 스크립트 수정 시 기존 데이터 이관 흐름을 깨지 않도록 한다.

작업 규칙:
- task API 계약을 직접 바꾸지 않는다.
- Prisma 스키마를 수정했다면 migration 영향과 seed 영향까지 함께 점검한다.
- download URL, private storage, deleted file 처리 규칙을 유지한다.

완료 전 검증:
- npm run lint
- npm run typecheck
- npm run build

최종 보고 형식:
- 변경 파일:
- 핵심 변경점:
- 실행한 검증:
- 남은 리스크:
```

## main 통합 담당 merge 체크리스트

### 1. 통합 시작 전

- `main` 작업 트리가 깨끗한지 확인한다.
- 각 에이전트 브랜치가 최신 `main`에서 시작됐는지 확인한다.
- 각 브랜치의 담당 범위가 겹치는지 먼저 본다.
- 아래 충돌 위험 파일을 건드린 브랜치가 둘 이상이면 바로 수동 비교 대상으로 분류한다.
  - `src/components/tasks/task-workspace.tsx`
  - `src/app/globals.css`
  - `src/repositories/postgres/store.ts`
  - `src/repositories/index.ts`
  - `prisma/schema.prisma`
  - `middleware.ts`

### 2. 브랜치별 1차 검토

- `git diff --name-only main...<branch>`로 변경 파일 목록 확인
- 담당 범위 밖 파일이 섞였는지 확인
- 에이전트 보고서의 "핵심 변경점"과 실제 변경 파일이 맞는지 확인
- `lint`, `typecheck`, `build` 실행 여부 확인

### 3. 병합 순서

권장 병합 순서:

1. 인증/세션
2. 앱 셸/프로젝트 메타데이터
3. 태스크 API/도메인
4. 파일 업로드/스토리지/설정 지속화
5. 태스크 UI

이 순서를 권장하는 이유:

- UI가 가장 상위 의존 레이어라서 서버/API 계약이 먼저 고정되는 편이 안전하다.
- `task-workspace.tsx`는 마지막에 병합해야 충돌과 재작업이 줄어든다.

### 4. 충돌 해결 원칙

- 인증 관련 충돌: `middleware.ts`, `src/lib/auth/**`는 인증 담당 브랜치 우선
- 셸/레이아웃 충돌: `src/components/layout/**`, `src/app/layout.tsx`는 셸 담당 브랜치 우선
- 워크스페이스 충돌: `src/components/tasks/task-workspace.tsx`는 태스크 UI 담당 브랜치 우선
- 태스크 도메인 충돌: `src/use-cases/task-service.ts`, `src/app/api/tasks/**`는 태스크 API 담당 브랜치 우선
- 파일/설정 충돌: `src/app/api/files/**`, `src/app/api/preferences/**`, `src/storage/**`는 파일 담당 브랜치 우선
- Prisma 충돌: 기능별로 나눠 보고, 둘 다 같은 모델을 바꿨다면 수동 검토 후 병합

### 5. 최종 검증

모든 브랜치 병합 후 아래를 순서대로 실행한다.

- `npm run lint`
- `npm run typecheck`
- `npm run build`

가능하면 수동 스모크 체크도 한다.

- `/login`
- `/board`
- `/daily`
- `/calendar`
- `/trash`
- 태스크 생성/수정
- 태스크 휴지통 이동/복원
- 파일 업로드/버전 업로드
- 프로젝트 이름 수정
- 로그아웃

### 6. 최종 보고 형식

```text
병합한 브랜치:
충돌 해결 파일:
최종 검증:
보류 이슈:
```

## 운영 팁

- 여러 에이전트를 동시에 돌릴 때는 먼저 "공용 파일 소유권"을 선언하는 것이 가장 중요하다.
- 이 프로젝트에서는 특히 `task-workspace.tsx`와 `src/repositories/postgres/store.ts`를 분산 소유하면 거의 반드시 재조정 비용이 생긴다.
- 작업 속도보다 병합 비용이 더 커지지 않게, 처음부터 파일 경계 중심으로 나누는 편이 좋다.
