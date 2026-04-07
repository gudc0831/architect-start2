# 멀티유저 전환 구현 계획

- 작성일: 2026-04-07
- 기준 문서: [`../PLAN.md`](../PLAN.md)
- 목적: 현재 `1인 로그인 사용자 + 선택 프로젝트 전체 접근` 중심 구조를 `프로젝트 멤버십 기반 멀티유저 협업` 구조로 전환하기 위한 실제 구현 순서와 변경 범위를 정리한다.

## 1. 이 문서의 역할

- `PLAN.md`는 운영 방향과 상세 문서 링크만 유지한다.
- 이 문서는 멀티유저 전환을 위한 실제 작업 단위, 대상 파일, 선행 조건, 검증 기준을 관리한다.
- 문서 범위는 `cloud` 모드 기준의 실제 멀티유저 전환이며, `local` 모드는 개발 보조 모드로만 본다.

## 2. 현재 상태 요약

현재 코드에서 확인된 핵심 상태는 아래와 같다.

1. 사용자와 프로젝트의 N:M 구조는 이미 존재한다.
   - `ProjectMembership` 모델이 있고 프로젝트 생성 시 생성자를 `manager`로 넣는다.
2. 하지만 일반 사용자의 프로젝트 접근은 멤버십 기준으로 제한되지 않는다.
   - 프로젝트 목록이 현재 사용자 멤버십으로 필터링되지 않는다.
   - 선택 프로젝트 기준 task/file API는 동작하지만, 그 선택 자체가 사용자 권한으로 좁혀져 있지 않다.
3. 작업 수정은 `version` 기반 낙관적 충돌 제어가 있으나 범위가 제한적이다.
   - task 본문 수정은 충돌 검사를 한다.
   - task 생성, reorder, file next version 생성은 경쟁 조건이 남아 있다.
4. `assignee`는 실제 사용자 FK가 아니라 문자열이다.
   - 멤버 목록과 연결된 책임자/담당자 모델이 아니다.
5. 실시간 동기화는 없다.
   - 화면은 초기 로드 또는 본인 변경 후 refresh 시점에만 갱신된다.
6. 진짜 멀티유저 검증은 `cloud` 모드에서만 가능하다.
   - `local`/`firestore` 모드는 현재 인증 스텁 또는 보조 개발 모드에 가깝다.

## 3. 목표와 비목표

### 목표

1. 로그인 사용자는 자신이 속한 프로젝트만 조회하고 선택할 수 있다.
2. 프로젝트 단위 권한이 `admin / manager / member` 이상으로 실제 API에 반영된다.
3. task/file/project 변경 시 멀티유저 충돌이 예측 가능하게 처리된다.
4. task 담당자는 실제 프로젝트 멤버와 연결된다.
5. 최소한 충돌 시 복구 가능한 UX를 제공하고, 이후 실시간 동기화로 확장 가능한 구조를 만든다.
6. 협업 체감 기준은 Google Sheets형 공동 작업 경험으로 두고, 사용자 식별 표시는 `shortName` 중심으로 설계한다.

### 이번 단계의 비목표

1. 조직/팀/회사 단위의 복잡한 RBAC 전면 도입
2. 다중 assignee, watcher, mention, activity feed까지 한 번에 구현
3. 로컬 모드만으로 멀티유저 검증 완료라고 간주하는 것

## 4. 결정 고정 사항

이번 계획에서 바로 고정된 의사결정은 아래와 같다.

1. 1차 멀티유저 전환의 권한 모델은 `admin / manager / member`로 고정한다.
2. `viewer / editor` 권한은 2차 확장 단계에서 설계하고, 1차 구현 범위에서는 다루지 않는다.
3. `local` 모드는 단일 사용자 개발 보조 모드로만 유지한다.
4. 실제 멀티유저 검증 책임은 `cloud` 모드에만 둔다.
5. `firestore` 모드는 이번 멀티유저 전환의 기준 백엔드가 아니다.
6. 사용자는 Google 이메일 계정으로 로그인하는 것을 기본 전제로 둔다.
7. `admin`은 모든 프로젝트에 전역 접근 권한을 가진다.
8. 프로젝트별 역할 구분은 1차에서 `manager / member`로만 본다.
9. 협업 UX baseline은 Google Sheets형 공동 편집 경험으로 두고, 세부 반응성/그리드 기술 계획은 별도 문서와 함께 관리한다.
10. 기존 `assignee` 문자열을 실제 사용자로 backfill할 때 자동 매핑 범위는 해당 task의 현재 프로젝트 멤버로만 제한한다.
11. `shortName` 유일성은 프로젝트 단위가 아니라 전체 시스템 기준으로 강제한다.
12. `shortName`은 Google 이메일 local-part에서 특수문자를 제거한 뒤 앞 3글자를 사용하고, 3글자가 안 나오거나 전역 충돌이 발생하면 즉시 별칭 풀 fallback으로 생성한다.
13. 1차 구현에서 별칭 풀은 전역 공용 풀로 두고, 프로젝트별 override는 2차 확장 범위로 미룬다.
14. 1차 구현에서 별칭 풀 설정 위치는 admin 화면이나 JSON이 아니라 코드 상수 파일로 시작한다.
15. Google 이메일 로그인이라도 실제 프로필 식별 키는 이메일 문자열이 아니라 auth provider의 안정적인 user id로 유지한다.
16. `shortName`은 최초 발급 후 재로그인 때 다시 계산하지 않고 유지하며, 향후 admin 변경 기능이 생기기 전까지 자동 재발급하지 않는다.

## 6. Identity Strategy

사용자 식별과 프로필 생성은 Google 로그인 기준으로 정리한다.

1. 로그인 수단은 Google 이메일 기반 로그인을 기준으로 설계한다.
2. 로그인/연락용 기본 이메일은 Google 계정 이메일을 사용하되, 실제 프로필 식별 키는 auth provider의 안정적인 user id를 사용한다.
3. 프로필에는 최소한 아래 필드를 둔다.
   - `email`
   - `displayName`
   - `shortName`
   - `role`
4. `displayName`은 Google 계정 정보 또는 시스템 프로필 표시명으로 유지한다.
5. `shortName`은 협업 UI에서 빠르게 식별하기 위한 3글자 이내 별칭으로 사용한다.
6. `shortName`은 아래 순서로 생성한다.
   - Google 이메일 아이디(local-part)에서 특수문자를 제거한다.
   - 정리된 문자열의 앞 3글자를 `shortName` 후보로 사용한다.
   - 3글자를 만들 수 없거나 전역 중복이 발생하면 즉시 별칭 풀 기반 자동 생성으로 fallback한다.
7. 별칭 풀은 1차에서 코드 상수 파일로 관리하고, 코드 관리자가 이후 변경 가능하도록 둔다.
8. 초기 별칭 풀은 캐릭터 기반 예시 집합으로 시작할 수 있다.
   - 예: `아이언`, `스파이`, `엘사`, `올라프`, `토르`, `헐크`
9. 협업 화면에서는 Google Sheets처럼 상단 참여자 표시, `shortName` 배지, 이후 실시간 presence 확장 가능성을 전제로 UX를 설계한다.
10. `shortName` 중복 검사는 현재 프로젝트 범위가 아니라 전체 시스템 범위에서 수행한다.
11. 1차에서는 별칭 풀을 전역 공용으로 사용하고, 프로젝트별 별칭 풀 override는 도입하지 않는다.
12. `shortName`은 최초 발급 후 stable identifier처럼 취급하고, 사용자가 다시 로그인해도 자동 재계산하지 않는다.
13. phase 1 시작 전 전역 별칭 풀은 예상 cloud 계정 수의 3배 이상, 최소 50개 이상을 준비한다.
14. 남은 미사용 별칭이 10개 이하가 되면 다음 배포 전에 코드 상수 파일의 전역 별칭 풀을 확장한다.

## 7. Backend Support Contract

멀티유저 전환 중 백엔드별 기대치를 아래처럼 분리한다.

### cloud

- 멀티유저의 기준 구현과 기준 검증 환경이다.
- 권한, 멤버십, 충돌 제어, 실시간 동기화는 모두 이 모드 기준으로 설계한다.

### local

- 단일 사용자 개발 보조 모드다.
- 구조 개발, 스키마 변경, UI 작업, 단위 수준 검증까지만 책임진다.
- 실제 사용자 3명 기준 접근 제어와 동시성 검증의 근거로 사용하지 않는다.

### firestore

- 이번 전환의 기준 구현 대상은 아니다.
- 유지 여부는 별도 판단 대상으로 두고, 이번 단계에서는 `cloud` correctness를 우선한다.

## 8. 권장 구현 순서

아래 순서를 그대로 따르는 것을 기본안으로 한다. 이유는 `접근 제어 -> 권한 -> 데이터 모델 -> 동시성 -> UX/실시간` 순서가 가장 안전하기 때문이다.

### Phase 0. 기준선 고정과 테스트 계정 준비

목적:
- 실제 멀티유저 검증을 위한 최소 환경을 먼저 확보한다.

작업:
1. `cloud` 모드 기준 테스트 계정 3개를 준비한다.
2. 테스트 프로젝트 2개 이상을 만들고 멤버 구성을 다르게 둔다.
3. 검증 시나리오를 먼저 고정한다.
   - 사용자 A/B/C가 같은 프로젝트에 접근
   - 사용자 A만 다른 프로젝트에도 접근
   - 같은 task 동시 수정
   - 같은 부모 내 reorder 동시 실행
   - 같은 file에 next version 동시 업로드

산출물:
- 테스트 계정 표
- 검증 시나리오 체크리스트

검증 기준:
- 세 계정 모두 로그인 가능
- 프로젝트 멤버 조합이 명확히 분리됨

### Phase 0.5. Identity / Membership Provisioning 경로 고정

목적:
- 구현보다 먼저 막히기 쉬운 사용자/프로필/멤버십 준비 절차를 고정한다.

작업:
1. 테스트용 사용자 생성 기본 경로를 고정한다.
   - 기본 경로: 각 테스트 사용자가 Google 로그인 1회를 수행해 auth user와 profile을 생성한다.
   - 기본 경로 이후: bootstrap/seed 스크립트로 프로젝트와 멤버십을 구성한다.
   - fallback 경로: 로그인 준비가 막힌 계정만 수동 admin upsert로 보완한다.
   - 초대 기반 생성은 2차 범위로 미룬다.
2. `auth user -> profile -> project membership`가 어떤 순서로 연결되는지 문서화한다.
   - `profile.id`는 auth provider user id와 동일 키로 유지한다.
3. 프로젝트 멤버 추가 시 필요한 최소 필드를 고정한다.
   - `profileId`
   - `displayName`
   - `email`
   - `role`
4. 검증용 프로젝트/멤버십 시드 절차를 만든다.
5. Google 로그인 후 `auth user -> profile` 생성 규칙을 고정한다.
6. `shortName` 생성 규칙과 충돌 시 fallback 규칙을 고정한다.

검증 기준:
1. 테스트 계정 3개와 프로젝트 멤버 구성이 재현 가능하다.
2. 수동 준비 없이도 검증 시작점까지 가는 절차가 문서 또는 스크립트로 남는다.
3. 동일한 Google 계정으로 재로그인해도 같은 프로필과 같은 `shortName` 규칙으로 복구 가능하다.

### Phase 1. 프로젝트 접근 제어를 멤버십 기준으로 전환

목적:
- 멀티유저 전환의 가장 중요한 보안/데이터 경계 문제를 먼저 해결한다.

핵심 변경:
1. 일반 사용자의 프로젝트 목록 조회를 현재 사용자 멤버십 기준으로 필터링한다.
2. `admin`은 멤버십이 없어도 모든 프로젝트를 조회하고 선택할 수 있게 예외 처리한다.
3. 현재 선택 프로젝트가 사용자 멤버십 범위 밖이면 자동으로 접근 가능한 첫 프로젝트로 교체한다.
4. task/file/project scope guard가 선택 프로젝트뿐 아니라 현재 사용자의 프로젝트 접근 권한까지 함께 확인하도록 만든다.

주요 대상 파일:
- `src/lib/auth/require-user.ts`
- `src/use-cases/admin/admin-service.ts`
- `src/use-cases/task-project-context.ts`
- `src/use-cases/project-scope-guard.ts`
- `src/repositories/admin/postgres-store.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/select/route.ts`

권장 세부 작업:
1. 현재 사용자 기준 프로젝트 목록 조회용 repository/use-case 경로를 분리한다.
2. `listProjectsForSession()`이 일반 사용자에게는 접근 가능 프로젝트만, `admin`에게는 전체 프로젝트를 반환하게 바꾼다.
3. `getSelectedTaskProject()`에서 현재 사용자 멤버십이 없는 프로젝트는 선택되지 않게 막되, `admin`은 예외 처리한다.
4. 공통 helper를 도입한다.
   - 예: `requireProjectAccess(projectId, user)`
   - 예: `requireProjectManager(projectId, user)`
5. `requireProjectAccess()`는 `admin` bypass와 멤버십 검사를 한곳에서 처리한다.

검증 기준:
1. 프로젝트 A의 멤버가 아닌 사용자는 프로젝트 A를 프로젝트 스위처에서 볼 수 없다.
2. 프로젝트 A의 task/file API를 직접 호출해도 403 또는 404 성격으로 차단된다.
3. 쿠키에 이전 projectId가 남아 있어도 접근 가능한 프로젝트로 정상 보정된다.
4. `admin`은 별도 멤버십이 없어도 모든 프로젝트를 스위처에서 보고 접근할 수 있다.

### Phase 2. 프로젝트 권한 체계 실제 적용

목적:
- `global admin`과 `project manager/member` 책임을 분리한다.

핵심 변경:
1. 현재 `requireUser()`만 쓰는 민감 API를 역할별로 재분류한다.
2. 프로젝트 이름 변경, 프로젝트 멤버 수정, 프로젝트별 카테고리/워크타입 수정에 manager 이상 권한을 요구한다.
3. 글로벌 관리 기능은 admin만 유지한다.

주요 대상 파일:
- `src/app/api/project/route.ts`
- `src/app/api/admin/projects/**/route.ts`
- `src/lib/auth/require-user.ts`
- 신규 helper 파일 제안:
  - `src/lib/auth/require-project-role.ts`
  - 또는 `src/use-cases/project-membership-guard.ts`

권장 권한 기준:
- `admin`: 전역 설정, 전체 프로젝트 관리
- `manager`: 프로젝트 이름, 멤버, 프로젝트별 정의값 관리
- `member`: task/file 일반 작업

이번 단계 제외:
- `viewer`
- `editor`

후속 단계 메모:
- `viewer / editor / manager / admin` 확장은 2차 권한 설계 문서에서 별도로 다룬다.

검증 기준:
1. `member`는 프로젝트 이름 변경 불가
2. `manager`는 자신이 관리하는 프로젝트만 수정 가능
3. `admin`은 전체 프로젝트 관리 가능

### Phase 3. task 담당자 모델을 실제 사용자와 연결

목적:
- 멀티유저 협업에서 `assignee`를 문자열이 아니라 실제 사람 데이터로 다룬다.

권장안:
1. 최소 변경안
   - `Task.assigneeProfileId` 추가
   - 기존 `assignee` 문자열은 표시용 스냅샷 또는 마이그레이션 호환 필드로 잠시 유지
2. 확장 가능안
   - 향후 다중 assignee 가능성이 높다면 `TaskAssignment` 조인 테이블로 바로 간다.

이번 프로젝트의 권장 선택:
- 지금 단계에서는 변경량과 호환성을 고려해 `assigneeProfileId + assignee display snapshot` 구조를 우선 권장한다.

주요 대상 파일:
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/domains/task/types.ts`
- `src/repositories/contracts.ts`
- `src/repositories/postgres/store.ts`
- `src/use-cases/task-service.ts`
- `src/components/tasks/task-workspace.tsx`

세부 작업:
1. task create/update payload에서 `assigneeProfileId`를 받도록 변경
2. 선택 가능한 assignee 목록은 현재 프로젝트 멤버 목록으로 제한
3. 기존 문자열 `assignee`는 마이그레이션 기간 동안만 읽기 호환 유지
4. UI에서는 멤버 탈퇴/이름 변경에 대한 fallback 표시 규칙 정의
5. 기존 `assignee` 문자열 backfill 순서는 `email exact match -> displayName exact match -> displayName normalized match`로 고정한다.
6. 한 단계에서 여러 profile이 동시에 매칭되면 자동 매핑하지 않고 `assigneeProfileId = null`로 남긴다.
7. backfill 결과는 CSV/JSON 리포트와 실행 로그로 남긴다.
8. 미매핑 task는 배포 차단 사유로 보지 않고, phase 1 배포 후 후속 정리 대상으로 둔다.
9. 기존 `assignee`가 현재 프로젝트 멤버가 아니면 과거 기록용 문자열은 유지하되 현재 담당자 `assigneeProfileId`는 비운다.
10. 자동 매핑 탐색 범위는 해당 task의 현재 프로젝트 멤버 목록으로만 제한한다.

검증 기준:
1. task 담당자 드롭다운이 현재 프로젝트 멤버만 노출
2. 잘못된 profileId를 직접 PATCH해도 서버가 차단
3. 기존 데이터도 화면이 깨지지 않고 fallback으로 표시
4. 비멤버 assignee는 과거 기록 표시가 유지되지만 현재 담당자로는 연결되지 않는다.
5. 다른 프로젝트에만 속한 동일 이름 사용자는 자동 매핑 후보에 포함되지 않는다.

### Phase 4. 동시성 제어 강화

목적:
- 멀티유저에서 가장 먼저 문제를 일으킬 create/reorder/file version 경쟁 조건을 줄인다.

세부 항목:

#### 4-1. task 생성 번호 발급

현재 문제:
- `getNextTaskNumber()` 후 insert 방식이라 동시 생성 시 충돌 가능성이 있다.

권장안:
1. `projectId`별 다음 번호를 관리하는 전용 카운터 테이블을 도입한다.
2. 번호 발급과 task create를 하나의 DB transaction으로 묶고, 카운터 row를 기준으로 증가시킨다.

대상:
- `prisma/schema.prisma`
- `src/repositories/postgres/store.ts`

#### 4-2. reorder 충돌 제어

현재 문제:
- reorder는 `version` 검사 없이 `siblingOrder`를 직접 덮어쓴다.

권장안:
1. reorder 요청 payload에 sibling 집합의 `taskId + version` 스냅샷을 함께 보낸다.
2. 서버는 같은 부모 그룹의 현재 sibling 집합과 version이 모두 일치할 때만 reorder를 적용한다.
3. 집합이나 version이 다르면 명시적 `409`를 반환하고 클라이언트는 최신 순서를 다시 불러온다.

대상:
- `src/domains/task/ordering.ts`
- `src/use-cases/task-service.ts`
- `src/repositories/contracts.ts`
- `src/repositories/postgres/store.ts`
- `src/app/api/tasks/reorder/route.ts`

#### 4-3. file next version 중복 방지

현재 문제:
- 같은 fileGroup에서 next version 계산이 경쟁 조건에 노출된다.

권장안:
1. `(fileGroupId, version)` unique index 추가
2. version 계산과 insert를 transaction으로 수행
3. 충돌 시 서버 내부 재시도 없이 명시적 `409`를 반환한다.

대상:
- `prisma/schema.prisma`
- `src/use-cases/file-service.ts`
- `src/repositories/postgres/store.ts`

검증 기준:
1. 같은 프로젝트에서 task 동시 생성 시 번호 중복 없이 모두 성공하거나, 실패 시 명시적 재시도 정책으로 처리
2. 같은 부모 내 reorder 충돌 시 조용히 덮어쓰지 않고 충돌로 복구 가능
3. 같은 file next version 동시 업로드 시 같은 version 번호가 중복 저장되지 않음

### Phase 5. 충돌 복구 UX와 데이터 갱신 UX 정리

목적:
- 충돌이 생겼을 때 사용자가 무엇을 잃었는지 알 수 있게 만든다.

핵심 변경:
1. 409 응답을 단순 refresh로 끝내지 말고 충돌 안내 상태를 분리
2. 서버 최신본과 내 draft 차이를 보여줄 수 있는 최소 구조 도입
3. 자동 refresh와 사용자 액션 refresh를 구분

주요 대상 파일:
- `src/components/tasks/task-workspace.tsx`
- `src/providers/dashboard-provider.tsx`
- `src/lib/ui-copy/**`

권장 UX:
1. `다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다.` 수준의 최소 피드백
2. 가능하면 dirty field 기준으로 재적용 선택지 제공
3. reorder 충돌도 별도 메시지 분리

검증 기준:
1. 409 발생 시 무반응처럼 보이지 않음
2. 사용자가 다시 저장 가능한 상태로 돌아옴
3. 최근 변경이 누구에 의해 발생했는지 최소한 `updatedBy` 기반으로 확장 가능한 데이터 구조 유지

### Phase 6. 실시간 동기화 추가

목적:
- 여러 사용자가 동시에 일할 때 새로고침 의존도를 줄인다.

전제:
- 이 단계는 Phase 1~5 이후에 들어간다.
- 먼저 correctness를 확보한 뒤 realtime을 붙인다.

권장안:
1. `projectId` 단위 변경 이벤트 수신 추상화 도입
2. task/file/project 변경을 각각 invalidate 하는 방식으로 시작
3. 처음부터 세밀한 patch merge보다 `scope refresh + selected item revalidate`를 우선

후보 구현:
- Supabase Realtime
- 또는 server event / polling fallback abstraction

대상:
- `src/providers/dashboard-provider.tsx`
- `src/providers/project-provider.tsx`
- 신규 helper 파일 제안:
  - `src/lib/realtime/project-events.ts`

검증 기준:
1. 사용자 A가 task를 수정하면 사용자 B 화면이 일정 시간 내 최신 상태로 갱신
2. 선택 task가 열린 상태에서도 치명적인 draft 손실 없이 안내 가능

### Phase 7. local 개발 모드와 검증 전략 정리

목적:
- 로컬에서 할 수 있는 것과 없는 것을 명확히 분리한다.

지금 로컬에서 가능한 것:
1. repository/use-case/API 구조 개편
2. Prisma 스키마와 마이그레이션 작성
3. 권한 helper와 멤버십 필터 로직 구현
4. UI 컴포넌트와 충돌 메시지 UX 구현
5. 단위 수준 로직 테스트와 수동 smoke test

로컬만으로는 부족한 것:
1. 실제 로그인 사용자 3명 기준 접근 제어 검증
2. 실제 멀티세션 동시성 체감 검증
3. Realtime 동기화 검증

최종 검증은 반드시 `cloud` 모드에서 수행할 것:
1. 계정 3개
2. 프로젝트 2개 이상
3. 브라우저 세션 3개 이상

## 9. 운영 결정과 예상 병목

phase 1 진행에 필요한 핵심 의사결정은 이번 계획에서 모두 고정한다.

### Assignee / Backfill

기본안으로 고정한 규칙:

1. 기존 `assignee` 문자열 매핑 순서는 아래와 같이 고정한다.
   - `email exact match`
   - `displayName exact match`
   - `displayName normalized match`
2. 한 단계에서 여러 profile이 동시에 매칭되면 자동 매핑하지 않고 `assigneeProfileId = null`로 남긴다.
3. 현재 프로젝트 멤버가 아닌 사용자를 가리키는 기존 assignee 문자열은 과거 기록용 문자열만 유지하고 현재 담당자는 비운다.
4. backfill 결과는 phase 1에서 CSV/JSON 리포트와 실행 로그로 남기고, admin 검토 화면은 2차 범위로 미룬다.
5. 미매핑 task가 남아 있어도 phase 1 배포는 진행한다.
6. phase 1 배포 시 미매핑 task는 `assigneeProfileId = null` 상태로 두고, 과거 `assignee` 문자열 표시와 CSV/JSON 리포트로 후속 정리한다.

### 예상 병목

1. `assignee` 미매핑 데이터가 많으면 phase 1 배포 일정이 데이터 정리 속도에 묶일 수 있다.
2. `shortName` 전역 유일성과 3글자 제한을 함께 유지하면 장기적으로 별칭 풀이 고갈될 수 있다.
3. phase 1에서 별칭 풀이 부족해지면 자동 suffix fallback을 도입하지 않고 코드 상수 파일의 전역 별칭 풀을 수동 확장한다.
4. 위 두 병목은 배포 차단 사유가 아니라 운영 리스크로 추적하되, backfill 리포트와 남은 별칭 수를 배포 체크리스트에 포함한다.

### Short Name Generation

1차 `shortName` 생성 규칙은 이번 계획에서 모두 고정했다. 이후 확장 질문은 admin 설정 화면이나 프로젝트별 override를 도입하는 2차 단계에서 다시 연다.

## 10. 권장 작업 묶음

구현은 아래 4개 change set으로 나누는 것을 권장한다.

1. `멀티유저 접근 제어 기반`
   - Phase 1, Phase 2
2. `담당자 모델과 멤버 연동`
   - Phase 3
3. `동시성 안정화`
   - Phase 4
4. `UX 및 실시간 동기화`
   - Phase 5, Phase 6

이유:
- 접근 제어를 먼저 고정해야 이후 UI와 데이터 모델 판단이 흔들리지 않는다.
- assignee 모델은 권한/멤버 목록이 준비된 뒤 손대는 편이 안전하다.
- realtime은 correctness 이후에 붙이는 편이 디버깅 비용이 낮다.

## 11. 완료 기준

아래가 모두 충족되면 멀티유저 1차 전환 완료로 본다.

1. 사용자는 자신이 속한 프로젝트만 본다.
2. 프로젝트별 manager/member 권한이 API에 반영된다.
3. task 담당자는 실제 프로젝트 멤버와 연결된다.
4. task create/reorder/file version 경쟁 조건에 대한 방어가 들어간다.
5. 충돌 시 사용자에게 복구 가능한 UX가 제공된다.
6. `cloud` 모드에서 3계정 수동 검증이 통과한다.

## 12. 후속 문서화 권장

구현이 시작되면 아래 문서를 함께 유지하는 것을 권장한다.

1. `docs/worklogs/` change set별 작업 로그
2. 멀티유저 검증 체크리스트
3. 권한 정책 요약 문서
4. 스키마 마이그레이션 가이드

## 13. 바로 다음 액션

가장 먼저 시작할 작업은 아래 3개다.

1. `Phase 1` 기준으로 현재 사용자 멤버십 기반 프로젝트 목록 조회 경로 설계
2. `Phase 2` 기준으로 프로젝트 수정 API의 권한 분류표 작성
3. `Phase 4` 기준으로 project task counter, reorder version snapshot payload, file version `409` 정책 명세 작성
