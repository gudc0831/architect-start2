# Phase 1 비용/보존/업로드 상세 계획

> 상태 메모
>
> 이 문서는 2026-04-06 초반 논의에서 잡은 `Pro + staging + 절대보존` 가정이 일부 포함된 초기 상세 검토 문서다.
> 현재 합의된 최신 운영 결론과 실제 시작안은 [`PLAN_MEETING_LOG.md`](./PLAN_MEETING_LOG.md)를 우선 기준으로 본다.

- 작성일: 2026-04-06
- 기준 문서: [`PLAN.md`](../PLAN.md)
- 목적: `Vercel + Supabase + 내부 팀 전용 + shared staging 1개` 기준안을 실제 운영 숫자와 정책으로 내리는 후속 계획

## 1. 전제

이 문서는 아래 전제로 계산한다.

- `프로젝트 2개`는 앱 내부의 업무 프로젝트 2개를 뜻한다.
- 운영 인프라는 `production 1개 + staging 1개`로 본다.
- 사용자 10명은 앱 사용자 수이며, Vercel 배포 seat 수와는 다르다.
- 현재 코드 기준 백엔드는 `Supabase Auth + Postgres + Storage`, 프론트/배포는 `Next.js + Vercel`이다.

참고:

- Supabase는 조직 안에 여러 프로젝트를 둘 수 있지만, `Compute`는 프로젝트별로 과금된다. 반면 `Egress`, `Storage Size`, `MAU` 같은 일부 quota는 조직 단위로 합산된다.
- Vercel은 앱 최종 사용자 수로 seat 비용이 늘지 않는다. Pro는 `1 deploying seat 포함`, `free viewer seats`가 기준이다.

## 2. 현재 코드 기준에서 확인한 운영 리스크

### 첨부파일 경로

현재 첨부 구조는 아래 특성을 갖는다.

- 업로드 API가 `/api/upload`에서 `multipart/form-data`를 직접 받는다.
- 서버가 `File.arrayBuffer()`로 파일 전체를 메모리에 올린 뒤 Supabase Storage로 다시 업로드한다.
- 대시보드 로딩 시 `/api/files`가 선택 task가 없어도 프로젝트 전체 파일 목록을 읽는다.
- Postgres 파일 조회는 목록 응답을 만들 때 signed download URL도 같이 생성한다.
- 휴지통 비우기와 개별 영구 삭제가 실제 스토리지 삭제까지 수행한다.

관련 코드:

- [`src/app/api/upload/route.ts`](../src/app/api/upload/route.ts)
- [`src/use-cases/file-service.ts`](../src/use-cases/file-service.ts)
- [`src/storage/supabase-storage.ts`](../src/storage/supabase-storage.ts)
- [`src/components/tasks/task-workspace.tsx`](../src/components/tasks/task-workspace.tsx)
- [`src/repositories/postgres/store.ts`](../src/repositories/postgres/store.ts)
- [`src/use-cases/trash-service.ts`](../src/use-cases/trash-service.ts)

### 의미

이 구조는 사용자 10명 수준에서는 당장 버틸 수 있지만, 첨부파일 크기와 개수가 늘면 아래 문제가 같이 커진다.

- Vercel 함수가 업로드 본문을 전부 받으므로 파일 업로드가 곧 Vercel 네트워크/함수 비용이 된다.
- 서버 메모리와 응답 시간에 파일 크기 영향이 직접 들어온다.
- task를 보지 않아도 프로젝트 전체 최신 파일 그룹과 signed URL을 매번 준비한다.
- `휴지통 전체 삭제`가 열려 있어 “절대보존” 정책과 정면 충돌한다.

## 3. 월 비용 시뮬레이션

### 3-1. 2026-04-06 기준 공식 가격에서 중요한 숫자

#### Vercel

- Pro 플랫폼 fee: `$20/month`
- 포함 사항: `1 deploying team seat`, `$20/month usage credit`, `free viewer seats`
- Pro 포함 quota 일부:
  - `10M Edge Requests / month`
  - `1TB Fast Data Transfer / month`
  - `4 hours Active CPU / month`
  - `1M Invocations / month`
- 추가 paid seat: `$20/month each`
- Standard build minutes: `$0.014/minute`

#### Supabase

- Pro plan: `$25/month per organization`
- 포함 compute credit: `-$10`
- Compute:
  - `Micro`: about `$10/month per project`
  - `Small`: about `$15/month per project`
- 조직 단위 포함 quota:
  - `Storage 100GB included`, then `$0.021/GB/month`
  - `Egress 250GB included`, then `$0.09/GB`
  - `MAU 100,000 included`, then `$0.00325/MAU`
- PITR:
  - `7-day`: `$100/month per project`
  - PITR 사용 프로젝트는 최소 `Small compute` 필요

### 3-2. 이 문서의 계산 가정

- 앱 사용자: 10명
- 앱 내부 프로젝트: 2개
- production Supabase: 1개
- staging Supabase: 1개
- 총 MAU: 10
- 총 첨부 저장량: 20GB 이내
- 월 다운로드/egress: 50GB 이내
- Vercel 배포 권한자: 1명 기본

위 가정이면 MAU/Storage/Egress overage는 발생하지 않는다.

### 3-3. 시나리오별 월 비용

| 시나리오 | Vercel | Supabase | 합계 | 해석 |
| --- | ---: | ---: | ---: | --- |
| 최소 운영안 | $20 | $35 | $55 | `prod micro + staging micro`, PITR 없음 |
| 권장 운영안 | $20 | $40 | $60 | `prod small + staging micro`, PITR 없음 |
| 절대보존 운영안 | $20 | $140 | $160 | `prod small + staging micro + prod 7-day PITR` |

Supabase 계산식:

- 최소 운영안: `Pro $25 + prod micro $10 + staging micro $10 - credit $10 = $35`
- 권장 운영안: `Pro $25 + prod small $15 + staging micro $10 - credit $10 = $40`
- 절대보존 운영안: `Pro $25 + prod small $15 + staging micro $10 + prod PITR $100 - credit $10 = $140`

### 3-4. 추가 변동비

- Vercel 배포 권한자가 2명이면 `+ $20/month`
- Supabase 총 저장량이 100GB를 넘으면 초과분에 `+ $0.021/GB/month`
- Supabase 총 egress가 250GB를 넘으면 초과분에 `+ $0.09/GB`
- Vercel standard build minutes는 `+ $0.014/minute`

### 3-5. 해석

현재 규모에서 비용을 좌우하는 것은 `사용자 10명`보다 아래 3개다.

- Vercel paid seat 수
- Supabase 운영 프로젝트 수 (`prod`, `staging`)
- `PITR` 사용 여부

즉, `프로젝트 2개/사용자 10명` 자체는 거의 비용 요인이 아니다. 비용 급증 포인트는 `PITR`, `별도 staging 유지`, `배포 seat 추가`, `첨부 저장량 폭증`이다.

### 3-6. 예산 권장안

- 내부 팀 beta만 보면: `월 $55 ~ $60` 예산으로 시작 가능
- 실제 데이터 절대보존까지 걸면: `월 $160`을 기준선으로 잡는 것이 안전

주의:

- 이 계산은 `앱 내부 프로젝트 2개` 기준이다.
- 만약 “프로젝트 2개”가 고객별로 `Supabase production 프로젝트도 2개`라는 뜻이면, Supabase compute와 PITR 비용은 거의 2배로 뛴다.

## 4. 데이터 절대보존 운영안

## 결론

`절대보존`을 하려면 Supabase 기본 daily backup만으로는 부족하다.

이유는 명확하다.

- Supabase DB backup은 `Storage API 객체 자체`를 포함하지 않는다.
- 프로젝트 삭제 시 백업까지 같이 영구 삭제된다.
- 현재 앱 코드에는 실제 영구삭제 경로가 열려 있다.

따라서 운영 원칙은 아래처럼 잡아야 한다.

### 4-1. 운영 원칙

1. 앱에서 사용자가 누르는 삭제는 전부 `soft delete`로만 처리한다.
2. `empty trash`, `permanent delete`, Supabase 프로젝트 삭제는 운영 기본값에서 금지한다.
3. DB 백업과 파일 백업은 분리한다.
4. 복구는 `기존 프로젝트 직접 restore`와 `새 프로젝트로 restore` 두 경로를 둘 다 준비한다.
5. 최소 월 1회 복구 훈련을 실제로 한다.

### 4-2. 즉시 막아야 하는 것

현재 구조에서 절대보존과 가장 충돌하는 것은 아래다.

- [`src/app/api/files/[fileId]/route.ts`](../src/app/api/files/%5BfileId%5D/route.ts) 의 영구 삭제 API
- [`src/use-cases/file-service.ts`](../src/use-cases/file-service.ts) 의 `permanentlyDeleteFile()`
- [`src/use-cases/trash-service.ts`](../src/use-cases/trash-service.ts) 의 `emptyTrash()` / 실제 storage delete
- [`src/components/tasks/task-workspace.tsx`](../src/components/tasks/task-workspace.tsx) 의 휴지통 전체 삭제 UI

운영 정책:

- Phase 1에서는 `영구 삭제 기능 OFF`
- 필요한 경우에도 `superadmin + 별도 feature flag + 2인 승인` 없이는 실행 금지

### 4-3. 권장 백업 계층

#### Layer A. Supabase 기본 보호

- production: `Small compute + 7-day PITR`
- staging: daily backup만 유지
- Supabase Spend Cap 활성화
- 단, Spend Cap은 `Compute`와 `PITR`를 막아주지 못하므로 별도 모니터링 필요

#### Layer B. DB 오프사이트 백업

- 매일 새벽 `supabase db dump`로 `roles.sql`, `schema.sql`, `data.sql` 생성
- 저장 위치는 `사내 NAS` 또는 `별도 private object storage`
- 최소 보존 기간: `30일`
- 주 1회는 다른 위치로 복제

실행 기준:

- DB dump는 공식 CLI 흐름 그대로 사용
- public repo 저장 금지

#### Layer C. 파일 오프사이트 백업

- Supabase Storage bucket 전체를 일 단위로 inventory/export
- 새로 추가되거나 변경된 object만 별도 백업 저장소로 복제
- 메타데이터는 `file id`, `fileGroupId`, `version`, `objectPath`, `size`, `sha256`, `deletedAt`, `backupCopiedAt`까지 남김

핵심:

- DB 복구만 해서는 첨부 원본이 같이 살아나지 않는다.
- 절대보존의 본체는 사실상 `Storage object 별도 백업`이다.

### 4-4. 복구 운영안

#### 일상 복구

- 잘못 수정/삭제: production PITR 또는 daily backup 기준 복구 검토
- 첨부 누락: offsite object backup에서 개별 object 복구

#### 중대 사고 복구

- 우선 `restore to new project`로 복구본 생성
- 복구본 검증 후 traffic 전환 또는 데이터 re-import
- 원본 production은 즉시 덮어쓰지 말고 보존

### 4-5. 운영 절차

#### 주간

- 백업 성공 여부 확인
- 최근 7일 dump 파일 checksum 확인
- storage backup 복제 누락 여부 확인

#### 월간

- production DB를 새 프로젝트로 restore drill
- 파일 3건 이상 랜덤 복구 drill
- 복구 소요 시간과 누락 항목 기록

### 4-6. 권장 목표

- RPO:
  - daily backup만 쓰면 최대 1일 손실 가능
  - PITR를 켜면 훨씬 촘촘하게 줄일 수 있음
- RTO:
  - DB size와 파일량에 따라 달라지므로 월간 복구 훈련으로 실제 수치를 잡아야 함

## 5. 첨부파일 업로드 구조 개편안

## 결론

현재의 `Vercel 서버 경유 업로드`는 Phase 1 소규모 테스트에는 가능하지만, 운영 구조로는 유지하지 않는 편이 맞다.

목표 구조는 아래다.

- 메타데이터 제어는 앱 서버가 담당
- 파일 바이트 전송은 클라이언트가 Supabase Storage로 직접 업로드
- 파일 목록은 task 단위 lazy-load
- download signed URL은 필요할 때만 발급

### 5-1. 왜 바꿔야 하는가

#### 비용

Vercel 공식 문서 기준으로 `POST` 업로드는 요청 body 전체가 Fast Origin Transfer 계산에 포함된다. 지금 구조처럼 서버가 파일을 중계하면 첨부가 커질수록 Vercel 비용과 병목이 함께 증가한다.

#### 안정성

Supabase 공식 문서는 아래를 권장한다.

- `standard upload`: 6MB 이하 작은 파일
- `resumable upload (TUS)`: 6MB 초과 파일
- 큰 파일은 direct storage hostname 사용 권장

그런데 현재 앱은 `10MB`까지 허용하면서도 서버 메모리에 파일 전체를 올리는 방식이다.

#### 성능

현재 대시보드는 로드할 때 프로젝트 전체 파일 목록을 읽고 signed URL도 생성한다. 파일 수가 늘수록 task와 무관한 파일 작업이 화면 진입 비용이 된다.

### 5-2. 목표 구조

#### A. 메타데이터 plane

앱 서버가 아래를 담당한다.

- 업로드 권한 확인
- `projectId`, `taskId`, `fileGroupId`, `version` 결정
- 저장 경로 예약
- 업로드 intent 생성

#### B. 데이터 plane

클라이언트가 아래를 담당한다.

- 6MB 이하: standard upload
- 6MB 초과: TUS resumable upload
- 업로드 대상: `https://<project-ref>.storage.supabase.co/...`

#### C. finalize plane

업로드 완료 후 앱 서버가 아래를 담당한다.

- object 존재 검증
- `size`, `mimeType`, `sha256` 검증
- `files` 레코드 commit

### 5-3. 추천 object path 규칙

현재 경로:

- `projects/{projectId}/tasks/{taskId}/{uuid}-{safeName}`

권장 경로:

- `env/{env}/projects/{projectId}/tasks/{taskId}/groups/{fileGroupId}/v{version}/{uuid}-{safeName}`

이유:

- 환경 분리 명확화
- file group/version 추적 쉬움
- 백업/복구/감사 시 경로만 봐도 분류 가능

### 5-4. 추천 API 흐름

1. `POST /api/files/upload-intents`
- 입력: `taskId`, `originalName`, `sizeBytes`, `contentType`, `replaceFileId?`
- 출력: `objectPath`, `uploadMode(standard|tus)`, `bucket`, `token or signed headers`, `fileGroupId`, `nextVersion`

2. client direct upload
- small file: supabase-js upload
- large file: `tus-js-client`

3. `POST /api/files/commit`
- 입력: `taskId`, `fileGroupId`, `objectPath`, `sizeBytes`, `contentType`, `sha256`
- 서버가 object 검증 후 DB row 생성

4. `GET /api/tasks/:taskId/files`
- 해당 task 첨부만 조회

5. `POST /api/files/:id/download-url`
- 필요 시 1회 signed URL 발급

### 5-5. 파일 조회 방식 개편

현재:

- dashboard 진입 시 `/api/files` 전체 조회
- 최신 파일 그룹별 signed URL 선발급

개편:

- task detail panel 열릴 때만 해당 task 파일 조회
- board/list 요약에는 `fileCount`, `latestFileName` 정도만 task 응답에 포함
- signed URL은 다운로드 클릭 시점에만 발급

이렇게 바꾸면:

- 초기 로딩 비용 감소
- signed URL 대량 생성 제거
- 프로젝트 파일 수 증가에 덜 민감

### 5-6. 삭제/보존 구조 개편

첨부파일 쪽도 절대보존 기준으로 바꿔야 한다.

- 기본 삭제: `deletedAt`만 세팅
- 실제 object 삭제: 운영 기본값 OFF
- 필요한 경우 `quarantine` 상태로 이동 후 별도 보존 기간을 거친 뒤 관리자 배치 작업으로만 physical delete

권장 메타데이터 추가:

- `uploadStatus`
- `sha256`
- `quarantinedAt`
- `backupCopiedAt`
- `physicalDeletedAt`
- `legalHold`

### 5-7. 실행 순서

#### Phase 0. 즉시

- 영구 삭제 UI/API 비활성화
- 파일 API를 task 단위 조회로 분리 설계

#### Phase 1. 1차 개편

- upload intent / commit API 추가
- client direct upload로 전환
- task detail lazy-load
- on-demand signed URL 발급

#### Phase 2. 보존 강화

- `sha256`, `uploadStatus`, `backupCopiedAt` 저장
- quarantine/hold 정책 추가
- storage backup manifest 작업 추가

#### Phase 3. 운영 안정화

- 10MB 제한 재검토
- 대용량 문서(PDF, XLSX, ZIP, DWG 등) 별 정책 분리
- 복구 drill 자동화

## 6. 내가 바로 확정하길 권하는 항목

지금 바로 확정해도 되는 것은 아래다.

1. 비용 기준선은 `월 $55~$60`이 아니라, 운영 의사결정 기준으로는 `월 $160` 절대보존안까지 함께 본다.
2. Phase 1 운영에서는 `영구 삭제 금지`, `soft delete only`를 기본값으로 한다.
3. 첨부는 다음 스프린트에서 `direct upload + lazy file loading + on-demand signed URL`로 전환한다.
4. production은 실제 데이터가 쌓이기 시작하면 `Small compute + 7-day PITR`로 올린다.
5. DB 백업과 파일 백업을 같은 것으로 취급하지 않는다.

## 7. 남은 사용자 확인 3개

아래 3개만 정하면 실행 계획을 바로 일정화할 수 있다.

1. `절대보존`을 정말 운영 기본값으로 둘지, 아니면 `30일 보존 후 관리자 삭제`로 둘지
2. offsite backup 저장 위치를 `사내 NAS`로 할지, `별도 private object storage`로 할지
3. Vercel deploy 권한자를 `1명`으로 시작할지, `2명 이상`으로 바로 열지

## 8. 참고한 공식 문서

가격과 정책은 2026-04-06 KST 기준 아래 공식 문서를 확인했다.

- Vercel Pricing: <https://vercel.com/pricing>
- Vercel Pro Plan: <https://vercel.com/docs/plans/pro>
- Vercel Spend Management: <https://vercel.com/docs/spend-management>
- Vercel CDN pricing and usage: <https://vercel.com/docs/manage-cdn-usage>
- Supabase About billing: <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Supabase Compute and Disk: <https://supabase.com/docs/guides/platform/compute-and-disk>
- Supabase Database Backups: <https://supabase.com/docs/guides/platform/backups>
- Supabase PITR usage: <https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery>
- Supabase Storage Pricing: <https://supabase.com/docs/guides/storage/pricing>
- Supabase Standard Uploads: <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
- Supabase Resumable Uploads: <https://supabase.com/docs/guides/storage/uploads/resumable-uploads>
- Supabase CLI backup guide: <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- Supabase automated backups with GitHub Actions: <https://supabase.com/docs/guides/deployment/ci/backups>
