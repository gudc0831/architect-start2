# Platform Decision Handoff

- Date: 2026-04-06
- Project: `architect-start2`
- Purpose: 다음 사용자 또는 다음 세션이 현재 논의 상태를 바로 이해하고 이어서 질문/결정할 수 있도록 정리한 handoff 문서

## 1. 지금까지 확정된 내용

### 사용자 확인 완료

- Phase 1 대상은 `내부 팀 전용`
- 외부 사용자는 테스트 기간 종료 후 다시 검토
- 사용자는 최신 기준 문서 하나만 남기길 원했고, 기존 계획 문서는 정리함

### 현재 최신 기준 문서

- 최신 기준 PLAN: [PLAN.md](D:/architect%20-%20start2/PLAN.md)
- 이번 논의의 추가 handoff 문서: [2026-04-06-platform-decision-handoff.md](D:/architect%20-%20start2/docs/2026-04-06-platform-decision-handoff.md)

## 2. 현재 코드베이스 기준으로 확인된 사실

아래는 실제 저장소에서 확인한 내용이다.

- 앱 프레임워크는 `Next.js App Router`
- 인증 흐름은 이미 `Supabase Auth` 기반 코드가 존재함
- 데이터 모델은 이미 `Prisma + PostgreSQL` 기준으로 정리돼 있음
- 파일 저장 provider도 이미 `Supabase Storage` 기준 코드가 존재함
- `bootstrap-admin.ts`로 초기 관리자 계정 생성 흐름이 있음
- `middleware.ts`와 `requireUser()` 기반 보호 구조가 이미 들어와 있음

관련 파일:

- [package.json](D:/architect%20-%20start2/package.json)
- [middleware.ts](D:/architect%20-%20start2/middleware.ts)
- [require-user.ts](D:/architect%20-%20start2/src/lib/auth/require-user.ts)
- [schema.prisma](D:/architect%20-%20start2/prisma/schema.prisma)
- [supabase-storage.ts](D:/architect%20-%20start2/src/storage/supabase-storage.ts)
- [bootstrap-admin.ts](D:/architect%20-%20start2/scripts/bootstrap-admin.ts)

핵심 해석:

- 이 프로젝트는 새 플랫폼을 탐색하는 단계가 아니라, 이미 들어와 있는 `Supabase + Prisma` 방향을 운영 기준으로 굳히는 단계다.

## 3. 왜 `Vercel`을 추천했는가

내 권장 기본안은 `Vercel + Supabase`다.

### 추천 이유

- 현재 앱이 `Next.js`라서 배포 마찰이 가장 적다
- preview 배포가 쉬워서 내부 팀 검토에 유리하다
- 환경변수/롤백/배포 이력 관리가 단순하다
- 초기 인프라 운영 시간을 최소화할 수 있다

### 쉽게 설명하면

- `Vercel`은 “Next.js 앱을 가장 쉽게 올리는 곳”
- `Railway/Render`는 “서버를 조금 더 직접 관리하는 느낌”

### 내 판단

- 특별한 이유가 없으면 `Vercel`이 더 효율적
- “무조건 가장 싸다”는 의미는 아님
- 하지만 “운영 시간까지 포함한 총비용” 기준으로는 지금 프로젝트에 유리함

## 4. Supabase가 좋은가, 특히 데이터 안전성 측면에서 어떤가

### 결론

`Supabase`는 현재 프로젝트에 잘 맞는다. 하지만 “데이터가 절대 삭제되면 안 된다”는 요구는 Supabase만 도입한다고 자동으로 해결되지 않는다.

### 좋은 점

- Auth / DB / Storage를 한 축으로 묶을 수 있다
- Postgres 기반이라 task, file, relation 구조와 잘 맞는다
- backup / restore / PITR 같은 운영 기능을 사용할 수 있다

### 중요한 한계

- DB backup과 Storage file backup은 같은 문제가 아니다
- DB가 복구돼도 첨부파일은 별도 백업 없이는 같이 복구되지 않을 수 있다
- 프로젝트 삭제 같은 강한 운영 실수는 별도 통제가 필요하다

### 따라서 필요한 운영 원칙

1. 앱 레벨에서 영구삭제를 기본 차단하거나 매우 강하게 제한
2. DB는 backup/PITR 전략 사용
3. 첨부파일은 별도 외부 백업도 고려
4. Supabase 프로젝트 삭제 권한은 극소수만 보유

## 5. 현재 코드에서 데이터 안전성 관점으로 중요한 사실

현재 코드는 휴지통/복구 구조가 있지만, 영구삭제 경로도 살아 있다.

관련 파일:

- [trash-service.ts](D:/architect%20-%20start2/src/use-cases/trash-service.ts)
- [task-service.ts](D:/architect%20-%20start2/src/use-cases/task-service.ts)
- [file-service.ts](D:/architect%20-%20start2/src/use-cases/file-service.ts)

중요한 해석:

- “실수로 지워도 복구 가능” 수준은 일부 갖고 있음
- 하지만 “절대 삭제되면 안 됨” 요구사항을 만족하려면 지금 상태로는 부족함
- 운영 전에는 영구삭제 정책을 다시 정해야 함

권장 방향:

- Phase 1에서는 `soft delete only`
- `empty trash` 또는 `permanent delete`는 비활성화 또는 superadmin 제한
- 운영 데이터는 외부 백업 체계 추가

## 6. 가격 측면 판단

### 내 판단

작은 내부 팀 기준으로는 `Vercel + Supabase` 조합이 꽤 합리적이다.

### 대략적인 성격

- Vercel은 개발 생산성 비용
- Supabase는 백엔드 운영 비용
- 둘 다 “직접 서버 운영 시간”을 줄여주는 쪽에 가깝다

### 해석

- 가장 싼 조합만 찾으면 다른 선택지도 있을 수 있음
- 하지만 지금 프로젝트처럼 내부 팀용, 빠른 배포, Next.js 중심이면 총비용 대비 효율이 좋음
- 특히 팀이 작고 운영 인력이 따로 없을수록 유리함

### 중요한 예외

- PITR를 길게 붙이면 비용이 빨리 올라갈 수 있음
- staging과 production을 모두 항상 띄우면 Supabase 비용은 자연히 증가함
- 첨부파일 용량과 다운로드량이 커지면 Storage / egress 비용을 계속 봐야 함

## 7. `task 1000개/프로젝트`는 괜찮은가

### 결론

`task 1000개/프로젝트` 자체는 괜찮다.

이유:

- Postgres 기준으로 1000 rows는 큰 규모가 아니다
- 현재 스키마도 기본 인덱스를 이미 갖고 있다
- task tree / sibling order / version 구조도 이 정도 규모는 충분히 처리 가능하다

관련 파일:

- [schema.prisma](D:/architect%20-%20start2/prisma/schema.prisma)
- [store.ts](D:/architect%20-%20start2/src/repositories/postgres/store.ts)
- [task-service.ts](D:/architect%20-%20start2/src/use-cases/task-service.ts)

단, 주의:

- DB보다 먼저 병목이 될 가능성이 큰 곳은 UI 렌더링과 파일 목록 조회 방식이다

## 8. 첨부파일은 괜찮은가

### 결론

중소형 첨부파일은 가능하지만, 큰 첨부파일이 자주 올라오면 현재 구현은 보완이 필요하다.

### 현재 코드에서 확인된 점

- 기본 업로드 최대 크기: `10MB`
- 서버에서 파일 전체를 메모리로 읽어 업로드함
- 프로젝트 전체 파일 목록을 한 번에 불러오는 패턴이 일부 존재함

관련 파일:

- [runtime-config.ts](D:/architect%20-%20start2/src/lib/runtime-config.ts)
- [upload route](D:/architect%20-%20start2/src/app/api/upload/route.ts)
- [supabase-storage.ts](D:/architect%20-%20start2/src/storage/supabase-storage.ts)
- [file-service.ts](D:/architect%20-%20start2/src/use-cases/file-service.ts)
- [task-workspace.tsx](D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

### 해석

- PDF, XLSX, 이미지 정도의 중소형 첨부 위주라면 현재 방향 유지 가능
- DWG, DXF, ZIP, 고용량 문서가 많아지면 현재 방식은 비효율적
- Vercel 서버를 거쳐서 큰 multipart 파일을 업로드하는 방식은 장기적으로 좋지 않다

### 권장 개선 방향

1. 파일 목록은 task 상세를 열 때만 lazy-load
2. 큰 파일은 서버 중계형이 아니라 direct upload로 전환
3. 큰 파일은 resumable upload 방식 검토
4. 파일 백업 정책을 DB 백업과 별도로 설계

## 9. 현재 기준 추천 운영안

특별한 반대 이유가 없다면 아래가 가장 실용적이다.

- 앱 배포: `Vercel`
- 백엔드: `Supabase`
- 인증: `email/password`
- 계정 정책: `관리자 생성만 허용`
- Phase 1 대상: `내부 팀`
- 환경: `local`, `staging`, `production`
- preview: 화면 확인용
- staging: 실제 기능 검증용 1개
- 운영 삭제 정책: `soft delete only`

## 10. 다음 사용자/다음 세션이 이어서 물어볼 만한 질문

아래 질문으로 바로 이어가면 된다.

1. `월 비용을 staging/prod 기준으로 현실적으로 계산해줘`
2. `데이터 절대 보존을 위한 백업/복구 운영안을 짜줘`
3. `영구삭제를 막는 정책과 코드 변경 포인트를 정리해줘`
4. `첨부파일 direct upload 구조로 바꾸려면 어떤 설계가 필요한지 설명해줘`
5. `1000개 task에서 UI가 버벅이지 않게 하려면 어떤 최적화가 필요한지 알려줘`

## 11. 한 줄 요약

현재 프로젝트는 `Vercel + Supabase`가 가장 효율적인 방향이다. 다만 “데이터 절대 삭제 금지”를 만족하려면, 플랫폼 선택보다 `영구삭제 차단 + DB 백업 + 첨부파일 별도 백업` 정책이 더 중요하다.
