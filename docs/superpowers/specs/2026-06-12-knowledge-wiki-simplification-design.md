# Knowledge WIKI 단순화 설계

작성일: 2026-06-12
상태: 브레인스토밍 설계 승인, 작성된 spec 사용자 리뷰 대기
범위: `/admin/knowledge` 정보구조, WIKI 후보 용어, 로컬 WIKI 가져오기, 승인 WIKI 읽기/내보내기 화면

## 목표

Knowledge admin 화면에서 WIKI 관련 업무를 단순하고 구분 가능한 개념으로 나눈다.

현재 문제는 기능 수 자체보다 모든 항목이 같은 "WIKI 후보"처럼 보인다는 점이다. 이 설계는 다음 네 개의 업무 표면을 분리한다.

- `자동 발굴 요청`: 완료 task를 AI가 주기적으로 훑고 WIKI 후보로 만들 만한 항목을 추천한 상태
- `AI 검토 WIKI 후보`: 사용자 AI 검토, 승격된 자동 발굴 요청, 로컬 WIKI 가져오기에서 생성된 실제 승인 검토 대상
- `로컬 WIKI 가져오기`: 로컬 Karpathy식 WIKI 작업장에서 SaaS 후보로 가져오는 연결 화면
- `승인 WIKI`: 검색, 복사, 링크, 내보내기, central knowledge 재사용이 가능한 승인 지식

## 하지 않는 것

- 로컬 WIKI 항목을 자동 승인하지 않는다.
- `pending_review`, import preview, discovery request를 `central_knowledge`로 노출하지 않는다.
- 로컬 WIKI 작업장을 두 번째 승인 시스템으로 만들지 않는다.
- 이번 설계에서 로컬 WIKI와 승인 SaaS WIKI의 양방향 동기화는 하지 않는다.
- legal evidence service의 evidence review를 SaaS WIKI approval과 합치지 않는다.

## 용어

`자동 발굴 요청`
: 완료 task를 주기적으로 스캔한 AI 추천이다. 아직 WIKI 후보가 아니라 "후보로 만들지 판단할 요청"이다. 실제 후보와 별도 저장소에 둔다.

`AI 검토 WIKI 후보`
: 실제 WIKI 승인 검토 대상이다. 사용자 AI 검토, 승격된 `자동 발굴 요청`, 확인된 로컬 WIKI import preview에서 생성될 수 있다.

`로컬 WIKI 작업장`
: raw 파일, Markdown WIKI, citation, index, 로컬 작성 규칙을 관리하는 Karpathy식 로컬 지식 작업장이다. SaaS 후보 큐가 아니다.

`로컬 WIKI 가져오기`
: SaaS에서 로컬 WIKI 작업장을 스캔하고, 자동 선별 결과를 미리보기로 보여준 뒤, admin 확인 후 `AI 검토 WIKI 후보`를 생성하는 흐름이다.

`승인 WIKI`
: SaaS에서 승인된 지식이다. 이 표면만 reusable `central_knowledge`가 될 수 있다.

## 사용자 흐름

### 1. 자동 발굴

1. 주 1회 정도의 AI 스캔이 완료 task를 분석한다.
2. 스캔은 task 링크, 추천 이유, 점수, 스캔 메타데이터를 포함한 `자동 발굴 요청`을 만든다.
3. admin이 요청 목록을 검토한다.
4. admin이 `WIKI 후보로 만들기`를 누른다.
5. 승격된 요청만 `AI 검토 WIKI 후보`가 된다.

스캔은 승인 WIKI나 `central_knowledge`를 만들 수 없다.

### 2. 사용자 AI 검토 후보

1. 사용자가 task에서 AI 검토를 실행한다.
2. AI 검토 결과에는 답변, confidence, 법규 근거, draft summary가 포함된다.
3. WIKI 검토에 적합한 결과가 `AI 검토 WIKI 후보`로 올라온다.
4. admin은 후보를 3단계로 검토한다.
   - `근거 확인`
   - `초안 다듬기`
   - `승인 결정`

### 3. 로컬 WIKI 가져오기

1. admin이 `로컬 WIKI 가져오기`를 연다.
2. admin이 `가져오기`를 누른다.
3. SaaS가 설정된 로컬 WIKI 작업장을 스캔한다.
4. 차단 규칙을 먼저 적용한다.
5. 차단 규칙을 통과한 항목만 LLM이 점수화한다.
6. UI는 균형 선별 미리보기를 보여준다.
7. admin이 미리보기를 확인한다.
8. 확인된 항목만 `AI 검토 WIKI 후보`가 된다.

로컬 WIKI 가져오기는 승인 WIKI를 직접 만들 수 없다.

### 4. 승인 후 마감

admin이 후보를 승인하면 같은 화면에 보조 액션을 표시한다.

- `승인 WIKI에서 보기`
- `내보내기`
- `복사`

승인 직후 자동으로 다른 화면으로 이동하지 않는다.

## UI 구조

상위 탭은 다음 네 개로 한다.

1. `후보 관리`
2. `승인 WIKI`
3. `로컬 WIKI 가져오기`
4. `운영 점검`

### 후보 관리

`자동 발굴 요청`과 `AI 검토 WIKI 후보`를 같은 업무 안에서 다루되, 목록/필터/섹션으로 명확히 구분한다.

후보 상세는 다음 3단계로 단순화한다.

1. `근거 확인`
2. `초안 다듬기`
3. `승인 결정`

기존의 품질, guardrail, blocker 정보는 별도 주 탭으로 경쟁시키지 않고 관련 단계 안에 접힘/경고 패널로 둔다.

### 승인 WIKI

DB를 직접 열지 않고도 승인 지식을 볼 수 있는 readback 화면이다.

지원 기능:

- 검색
- 필터
- 항목 상세
- 승인 WIKI 링크 복사
- Markdown 복사
- export handoff
- 출처/reference 확인

### 로컬 WIKI 가져오기

지원 기능:

- 로컬 WIKI 작업장 상태
- 마지막 스캔 시간
- `가져오기` 버튼
- import preview
- 포함/제외 이유
- rubric version 표시
- Knowledge admin용 rubric 관리 진입점

### 운영 점검

후보 검토와 섞이면 안 되는 운영 기능을 모은다.

- export/sync audit
- provider preview/execution
- legal batch audit status
- legal change monitor
- regulation source governance
- file chunk/debug report

## 데이터 책임

### `knowledge_discovery_requests`

`자동 발굴 요청` 전용 저장소다.

필수 필드:

- `id`
- `projectId`
- `taskId`
- `scanId`
- `state`: `new | reviewed | promoted | dismissed | stale`
- `recommendationScore`
- `recommendationReason`
- `evidenceSummary`
- `createdAt`
- `updatedAt`
- `promotedCandidateId`
- `reviewedBy`
- `reviewedAt`

### `assistant_task_records`

사용자 AI 검토 결과와 실제 WIKI 후보를 계속 저장한다.

후보 출처를 명시하기 위해 metadata에 다음 값을 둔다.

- `sourceType`: `user_ai_review | discovery_request | local_wiki_import | verified_legal_import`
- `sourceRef`
- `candidateState`
- `knowledgeReview`
- `approvedKnowledgeItem`

### `knowledge_import_previews`

로컬 WIKI 자동 선별 미리보기를 저장한다.

필수 필드:

- `id`
- `rubricId`
- `rubricVersion`
- `state`: `draft | ready | confirmed | imported | expired`
- `workspaceFingerprint`
- `includedItems`
- `excludedItems`
- `createdBy`
- `confirmedBy`
- `createdAt`
- `confirmedAt`

각 item은 포함/제외 이유를 보존해야 한다.

### `knowledge_import_rubrics`

Knowledge admin이 UI에서 관리하는 로컬 WIKI import 기준이다.

필수 필드:

- `id`
- `name`
- `version`
- `state`: `draft | active | archived`
- `hardBlockers`
- `scoringCriteria`
- `weights`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`
- `archivedAt`

로컬 WIKI import에는 한 번에 하나의 active rubric만 사용한다.

### 승인 WIKI 표면

승인 WIKI만 reusable `central_knowledge`가 될 수 있다.

`자동 발굴 요청`, import preview, `pending_review` 후보는 승인 WIKI 검색이나 central knowledge retrieval에 나오면 안 된다.

## 로컬 WIKI 자동 선별

선별 흐름:

1. 차단 규칙
2. LLM 점수화
3. 균형 선별 미리보기
4. admin 확인
5. 후보 생성

### 차단 규칙

차단 규칙은 LLM 점수화보다 먼저 실행된다. 실패 항목은 LLM 판단과 무관하게 제외한다.

차단 조건:

- raw source, citation, source digest 누락
- secret marker 또는 credential 가능성
- 기존 승인 WIKI 중복
- 기존 후보 중복
- 허용된 로컬 WIKI 경로 밖 파일
- 비어 있거나 사용할 수 없는 본문
- lint blocker
- 매우 낮은 confidence 또는 부족한 evidence

### LLM 점수화 기준

LLM은 차단 규칙을 통과한 항목만 평가한다.

기본 `wiki-import-rubric v1` 기준:

- 재사용 가치
- 근거 강도
- task/project/legal-topic 연결성
- 최신성
- 승인 WIKI 공백 보완성
- 초안 작성 가능성
- 위험도

페이지에는 작은 안내를 둔다.

> LLM은 차단 규칙을 통과한 항목만 재사용 가치, 근거 강도, 업무 연결성, 최신성, WIKI 공백 보완성, 초안 작성 가능성, 위험도로 점수화합니다. 기준 버전: `wiki-import-rubric v1`.

상세 기준은 접힘 패널에서 확인한다.

### 균형 선별

미리보기에는 다음을 나눠 보여준다.

- 상위 추천
- 검토 가능 항목
- 제외 항목과 이유

admin 확인 전에는 후보를 생성하지 않는다.

## Rubric 관리

Knowledge admin만 UI에서 로컬 WIKI import 기준을 바꿀 수 있다.

지원 기능:

- active rubric 보기
- draft rubric 편집
- draft rubric 활성화
- 이전 rubric archive
- 이전 rubric으로 rollback
- 변경 이력 확인

import preview는 생성 시점의 rubric version을 기록한다. preview 생성 이후 active rubric이 바뀌면 재선별 안내를 띄우거나 명시적 admin 확인을 요구한다.

## 상태 흐름

`자동 발굴 요청`:

```text
new -> reviewed -> promoted
new -> reviewed -> dismissed
new -> stale
```

`AI 검토 WIKI 후보`:

```text
pending_review -> in_review -> approved
pending_review -> in_review -> rejected
```

`로컬 가져오기 미리보기`:

```text
draft -> ready -> confirmed -> imported
draft -> ready -> expired
```

`선별 기준`:

```text
draft -> active -> archived
archived -> active
```

rollback은 이전 rubric version을 active로 되돌리고 현재 active version을 archived로 바꾼다.

## 오류 처리

로컬 작업장 연결 실패:

- 마지막 정상 스캔 시간을 보여준다.
- 후보 생성은 차단한다.
- 재시도 버튼을 제공한다.
- 기존 audit history는 지우지 않는다.

차단 규칙 실패:

- 항목별 제외 이유를 보여준다.
- 해당 항목의 후보 생성 액션을 비활성화한다.

중복 감지:

- 기존 후보 또는 승인 WIKI 링크를 보여준다.
- 새 후보 생성은 기본 차단한다.

rubric version 불일치:

- preview 생성 기준과 현재 active 기준이 다르면 경고한다.
- 재선별 또는 명시적 admin 확인을 요구한다.

후보 생성 실패:

- preview와 item 상태를 보존한다.
- 실패 항목에 오류 이유를 남긴다.
- 실패 항목만 재시도할 수 있게 한다.

승인 실패:

- 후보는 review 상태에 남긴다.
- 승인 WIKI 보조 액션은 표시하지 않는다.
- 승인 차단 이유를 설명한다.

## URL 상태

route query로 다음 상태를 복원한다.

- `work`: 상위 탭
- `candidateTab`: 후보 검토 단계
- `candidateId`
- `discoveryId`
- `approvedId`
- `importPreviewId`
- `rubricId`

잘못된 ID는 page crash 대신 URL에서 제거하고 status message를 보여준다.

## 검증 기준

정적 검증:

- 탭 라벨과 route query parsing이 설계와 일치한다.
- `자동 발굴 요청`, `AI 검토 WIKI 후보`, `로컬 WIKI 가져오기`, `승인 WIKI`가 별도 UI 개념으로 보인다.
- discovery request와 import preview가 승인 WIKI 라벨을 쓰지 않는다.
- 차단 규칙이 LLM 점수화보다 먼저 적용된다.
- import preview output에 rubric version이 포함된다.

서비스 검증:

- discovery request 승격은 실제 후보를 만들지만 승인 WIKI를 만들지 않는다.
- 로컬 WIKI import 확인은 후보를 만들지만 승인 WIKI를 만들지 않는다.
- `pending_review`, discovery request, import preview는 central knowledge retrieval에 나오지 않는다.
- 기존 AI 검토 후보 승인/반려가 유지된다.
- 승인 WIKI 읽기/검색/export가 유지된다.

브라우저 검증:

- 상위 탭이 URL query에서 복원된다.
- 후보 검토는 3단계 workflow만 보여준다.
- 승인 후 `승인 WIKI에서 보기`, `내보내기`, `복사`가 표시된다.
- 로컬 import preview는 admin 확인 없이 후보를 만들 수 없다.
- rubric 기준은 작은 안내와 접힘 상세로 표시된다.

회귀 게이트:

- typecheck
- lint
- Knowledge admin tab validator
- task review validator
- verified legal candidate import validator
- approved WIKI export/sync validators
- `/admin/knowledge` browser smoke

## 완료 기준

- admin이 추천, 실제 후보, local import preview, 승인 WIKI를 헷갈리지 않는다.
- scheduled task scan이 후보 큐를 오염시키지 않고 `자동 발굴 요청`만 만든다.
- 로컬 WIKI import는 자동 선별을 할 수 있지만 preview confirmation 없이 후보를 만들 수 없다.
- Knowledge admin이 UI에서 rubric을 업데이트하고 version history/rollback을 사용할 수 있다.
- 승인 WIKI 화면에서 DB를 직접 열지 않고 승인 지식을 확인할 수 있다.
- 승인은 SaaS에서만, 명시적으로만 이루어진다.
