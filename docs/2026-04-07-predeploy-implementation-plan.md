# 배포 전 구현 세부 계획

- 작성일: 2026-04-07
- 기준 문서: [`../PLAN.md`](../PLAN.md)
- 목적: 현재 저장소 구조를 유지한 채, 배포 직전까지 반드시 정리해야 할 구현 항목의 순서와 완료 기준을 고정

## 1. 적용 범위와 작업 방식

이 문서는 아래 5개를 배포 전 필수 정리 범위로 본다.

1. `영구삭제 제한`
2. `클라우드 프로젝트 동기화 잔여 공백 정리`
3. `task 단위 lazy file loading`
4. `download 시점 signed URL 발급`
5. `direct upload 전환`

현재 코드 기준 진입점은 아래 구조를 따른다.

- API 진입점: `src/app/api/**/route.ts`
- 서버 정책과 도메인 규칙: `src/use-cases/**`
- 백엔드 모드별 저장소 분기: `src/repositories/**`
- 스토리지 provider 분기: `src/storage/**`
- 프로젝트 선택/대시보드 로딩 상태: `src/providers/project-provider.tsx`, `src/providers/dashboard-provider.tsx`
- 주요 UI 작업면: `src/components/tasks/task-workspace.tsx`

작업 원칙:

1. 한 번호를 한 change set으로 본다. 가능하면 `feat/*` 브랜치 하나 또는 stacked commit 하나로 나눈다.
2. `route.ts`는 얇게 두고, 정책 변화는 `use-cases`, 저장 방식 변화는 `repositories`와 `storage`에 넣는다.
3. 프로젝트 범위 판정은 `getSelectedTaskProject()`와 `project-session` 흐름을 기준으로 통일한다.
4. 데이터/스토리지 관련 작업 전에는 `npm run data:doctor`를 먼저 본다.
5. cloud DB나 storage 동작에 영향을 주는 변경 전에는 `npm run data:backup`을 선행한다.
6. Prisma 변경이 필요하면 `npm run db:migrate:safe`만 사용하고 `npm run db:push`는 쓰지 않는다.
7. 각 번호가 끝날 때마다 `docs/worklogs/`에 짧은 로그를 남기고, 최소 `npm run typecheck`, `npm run lint`, `npm run build`를 다시 확인한다.

## 2. 구현 순서

### 1. 영구삭제 제한

선행 이유:

- 가장 먼저 사고 가능성을 줄여야 한다.
- 나머지 작업이 늦어져도, 이 단계가 끝나면 preview/prod에서 데이터가 물리적으로 사라질 가능성은 크게 줄어든다.

현재 기준 파일:

- `src/app/api/files/[fileId]/route.ts`
- `src/app/api/trash/bulk-delete/route.ts`
- `src/use-cases/file-service.ts`
- `src/use-cases/trash-service.ts`
- `src/components/tasks/task-workspace.tsx`

주요 작업:

1. 사용자 경로에서 개별 파일 영구삭제와 휴지통 비우기 UI를 제거하거나 비활성화한다.
2. 사용자 API에서 `DELETE /api/files/[fileId]`, `POST /api/trash/bulk-delete`를 기본 차단한다.
3. `permanentlyDeleteFile()`와 `permanentlyDeleteTrashSelection()`는 운영 기본 경로에서 호출되지 않게 막고, 필요하면 별도 admin-only feature flag 뒤로 보낸다.
4. 사용자 삭제는 `deletedAt` 기반 soft delete만 사용하도록 문서와 UI 문구를 맞춘다.
5. local 모드에서도 storage object를 즉시 삭제하지 않고 보존 정책 또는 quarantine 경로와 충돌하지 않게 정리한다.

완료 기준:

- 사용자가 삭제하면 active 화면에서는 사라지지만 DB row와 storage object는 남아 있다.
- preview/prod 사용자 경로에서 물리 삭제 API를 직접 칠 수 없다.
- 휴지통 화면은 복구 중심 동선으로 바뀐다.

검증:

1. task/file 삭제 후 active 목록에서는 사라지고 trash에서는 보인다.
2. API 직접 호출 시 영구삭제가 차단된다.
3. local/cloud 모두 row delete 대신 `deletedAt`만 바뀌는지 확인한다.

### 2. 클라우드 프로젝트 동기화 잔여 공백 정리

선행 이유:

- 이후 파일 조회, signed URL, direct upload는 모두 “현재 선택된 프로젝트가 정확히 무엇인가”에 의존한다.
- 지금 상태에서 cloud 프로젝트명 변경은 `PROJECT_RENAME_INTEGRATION_PENDING`으로 막혀 있다.

현재 기준 파일:

- `src/lib/project-session.ts`
- `src/use-cases/admin/admin-service.ts`
- `src/use-cases/task-project-context.ts`
- `src/use-cases/project-service.ts`
- `src/providers/project-provider.tsx`
- `src/providers/dashboard-provider.tsx`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/select/route.ts`
- `src/repositories/admin/index.ts`
- `src/repositories/admin/postgres-store.ts`

주요 작업:

1. cloud에서 프로젝트 선택의 authoritative source를 `cookie + server selection lookup`으로 확정한다.
2. 프로젝트 전환 후 task, file, work type, category 캐시가 섞이지 않게 invalidate 기준을 통일한다.
3. `renameCurrentProjectForSession()`가 cloud에서도 동작하도록 프로젝트명 변경과 task issueId sync를 같은 흐름으로 묶는다.
4. project rename 후 선택 상태, sidebar/project provider, dashboard data owner key가 모두 같은 project 기준으로 다시 로드되게 만든다.
5. 다중 프로젝트 preview/test 절차를 문서화한다.

완료 기준:

- cloud preview에서 프로젝트를 바꿔도 task/file/category가 다른 프로젝트와 섞이지 않는다.
- 프로젝트명 변경이 더 이상 pending 상태로 막히지 않는다.
- 프로젝트명 변경 후 issueId sync와 현재 선택 상태가 함께 정리된다.

검증:

1. test Supabase에서 프로젝트 2개를 만든다.
2. 프로젝트 A/B를 오가며 task/file 목록이 섞이지 않는지 본다.
3. 프로젝트명을 바꾼 뒤 issueId와 현재 선택 프로젝트 이름이 함께 갱신되는지 본다.

### 3. Task 단위 Lazy File Loading

선행 이유:

- 지금은 대시보드 진입만 해도 `/api/files`가 프로젝트 전체 파일 목록을 읽는다.
- 이 경계를 먼저 줄여야 이후 signed URL 온디맨드 발급과 direct upload 전환이 깔끔해진다.

현재 기준 파일:

- `src/providers/dashboard-provider.tsx`
- `src/components/tasks/task-workspace.tsx`
- `src/app/api/files/route.ts`
- `src/use-cases/file-service.ts`
- `src/repositories/postgres/store.ts`
- `src/repositories/memory/store.ts`
- `src/repositories/firestore/store.ts`

주요 작업:

1. `DashboardProvider`에서 초기 로딩 시 프로젝트 전체 `/api/files` 호출을 제거한다.
2. 선택된 task의 detail panel 또는 file section이 열릴 때만 해당 task의 첨부를 조회한다.
3. board/list에 파일 요약이 꼭 필요하면 full file list 대신 `fileCount`, `latestFileName` 같은 summary만 task 응답에 붙인다.
4. trash scope도 전체 preload 대신 선택 또는 명시적 진입 시점 로딩으로 바꾼다.
5. file fetch 상태를 task selection lifecycle과 함께 관리한다.

완료 기준:

- `/board`, `/daily`, `/calendar` 첫 진입에서 프로젝트 전체 파일 목록을 불러오지 않는다.
- task를 선택할 때만 그 task의 파일 목록이 로딩된다.
- 파일이 없는 프로젝트에서도 초기 렌더 비용이 task 수에만 비례한다.

검증:

1. 브라우저 네트워크에서 대시보드 첫 진입 시 `/api/files` 전체 호출이 사라졌는지 확인한다.
2. task 선택 시 `taskId`가 붙은 파일 조회만 나가는지 확인한다.
3. task 전환 시 이전 task 파일이 잔상으로 남지 않는지 본다.

### 4. Download 시점 Signed URL 발급

선행 이유:

- lazy loading 이후에는 file list 응답을 메타데이터 전용으로 줄이기 쉽다.
- signed URL을 목록 응답에서 미리 만드는 구조를 없애야 비용과 만료 처리도 안정된다.

현재 기준 파일:

- `src/repositories/postgres/store.ts`
- `src/storage/supabase-storage.ts`
- `src/storage/contracts.ts`
- `src/app/api/files/route.ts`
- `src/app/api/files/[fileId]/route.ts`
- `src/components/tasks/task-workspace.tsx`

주요 작업:

1. file list 응답 생성 시 signed URL을 만들지 않도록 repository 변환 로직을 바꾼다.
2. `POST /api/files/[fileId]/download-url` 또는 동등한 전용 route를 추가한다.
3. 다운로드 버튼 클릭 시점에만 signed URL을 발급받아 이동하게 바꾼다.
4. URL 만료는 짧게 유지하고, 만료 시 재발급 재시도를 허용한다.
5. trash item, old version download도 같은 방식으로 맞춘다.

완료 기준:

- `/api/files` 응답에는 `downloadUrl`이 상시 들어 있지 않다.
- 사용자가 다운로드를 눌렀을 때만 signed URL이 발급된다.
- URL 만료가 file list 재조회와 결합되지 않는다.

검증:

1. file list 응답 payload에서 상시 signed URL이 빠졌는지 확인한다.
2. 다운로드 버튼 클릭 시 전용 API 호출 뒤 실제 다운로드가 되는지 본다.
3. 잠시 기다린 뒤 다시 다운로드해도 새 URL이 정상 발급되는지 본다.

### 5. Direct Upload 전환

선행 이유:

- direct upload는 앞 단계의 프로젝트 범위, file fetch 경계, download contract가 안정된 뒤 적용하는 편이 안전하다.
- 현재 `task-workspace.tsx`와 `/api/upload`는 서버 중계형이므로 마지막에 바꾸는 것이 회귀 위험이 작다.

현재 기준 파일:

- `src/app/api/upload/route.ts`
- `src/components/tasks/task-workspace.tsx`
- `src/use-cases/file-service.ts`
- `src/storage/supabase-storage.ts`
- `src/lib/supabase/browser.ts`
- `src/domains/file/types.ts`

신규 또는 대체 예정 진입점:

- `src/app/api/files/upload-intents/route.ts`
- `src/app/api/files/commit/route.ts`
- 필요 시 `src/app/api/files/[fileId]/version/route.ts` 계약 조정

주요 작업:

1. 서버는 `upload intent`를 발급하고, `projectId`, `taskId`, `fileGroupId`, `nextVersion`, `objectPath`를 결정한다.
2. 클라이언트는 Supabase browser client로 storage에 직접 업로드한다.
3. 업로드 완료 후 `commit` API가 object 존재와 메타데이터를 검증한 뒤 `files` row를 생성한다.
4. 새 파일과 버전 업로드를 같은 계약으로 통일한다.
5. 초기 배포 전환은 현재 제한(`MAX_UPLOAD_SIZE_BYTES=10MB`)을 유지한 채 standard upload로 먼저 마무리한다.
6. 파일 크기 정책을 키울 필요가 생기면 그 다음 단계에서 TUS resumable upload를 붙인다.
7. `/api/upload`는 migration 기간 동안만 유지하고, cutover 후 제거한다.

완료 기준:

- 업로드 binary payload가 더 이상 Vercel route body를 통과하지 않는다.
- 파일 row는 upload 완료 후 commit 시점에만 생성된다.
- version upload도 direct upload 흐름으로 통일된다.

검증:

1. 새 파일 업로드가 선택 project/task 아래에 정확히 기록되는지 확인한다.
2. 버전 업로드 시 같은 `fileGroupId` 아래 version만 증가하는지 본다.
3. 업로드 실패 시 orphan DB row가 생기지 않는지 확인한다.

## 3. 릴리스 게이트

### Gate A. Preview 안전화

아래가 끝나면 preview 검증 품질이 크게 올라간다.

1. 영구삭제 제한
2. 클라우드 프로젝트 동기화 공백 정리
3. task 단위 lazy file loading

이 시점 검증:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- preview + test Supabase에서 다중 프로젝트 수동 검증

### Gate B. 배포 직전 구조 전환

아래가 끝나면 storage 접근 경로가 운영형에 가까워진다.

4. download 시점 signed URL 발급
5. direct upload 전환

이 시점 검증:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- preview 업로드/다운로드 실사용 검증
- 필요 시 `npm run data:backup` 후 cloud preview smoke test

## 4. 각 번호별 산출물

1. 영구삭제 제한
- 코드 변경
- UI 문구 정리
- 운영 기본 정책 문서 갱신

2. 클라우드 프로젝트 동기화 잔여 공백 정리
- rename/project switch 안정화
- 다중 프로젝트 수동 테스트 절차

3. task 단위 lazy file loading
- 파일 로딩 경계 재정의
- 필요 시 task summary contract 추가

4. download 시점 signed URL 발급
- 전용 download-url API
- file list payload 축소

5. direct upload 전환
- intent/commit API
- 클라이언트 업로드 전환
- `/api/upload` 제거 계획

## 5. 최종 배포 전 체크

아래가 모두 충족될 때만 production open을 검토한다.

1. 사용자 경로에서 영구삭제가 불가능하다.
2. 프로젝트 전환과 프로젝트명 변경이 cloud preview에서 안정적으로 동작한다.
3. 파일은 task 선택 시점에만 로드된다.
4. signed URL은 다운로드 시점에만 발급된다.
5. 업로드는 direct upload로 동작하고 서버는 intent/commit만 담당한다.
6. preview와 production은 서로 다른 Supabase 프로젝트를 사용한다.
7. migration/seed/bootstrap은 여전히 자동 배포와 분리되어 있다.
