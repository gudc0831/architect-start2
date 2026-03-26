# UI Copy Agent Runbook

## 목적
- 내부 식별자, 라우트, enum, API 키, DB 값은 유지한다.
- 사용자에게 보이는 문구만 `src/lib/ui-copy` 카탈로그를 통해 관리한다.
- 검증 에이전트는 변경 감시와 오류 검증을 담당한다.

## 에이전트 역할
- `UI Copy Agent`
  - `src/lib/ui-copy/catalog.ts`, `src/lib/ui-copy/index.ts`
  - 사용자 표시 문구가 있는 UI 컴포넌트
  - `output/ui-copy/translator-status.json`
- `UI Copy Validator Agent`
  - `scripts/ui-copy-validator.ts`
  - `scripts/ui-copy-report.ts`
  - `package.json` validation scripts
  - `output/ui-copy/validator-status.json`
  - `docs/UI_COPY_RUN_REPORT.md`

## 실행 순서
1. UI Copy Agent가 카탈로그와 UI 컴포넌트를 갱신한다.
2. UI Copy Agent가 `output/ui-copy/translator-status.json`을 갱신한다.
3. Validator Agent가 감시 모드 또는 1회 검증 모드로 실행된다.
4. 마지막 검증 결과를 기준으로 `npm run ui-copy:report`를 실행한다.

## 명령어
```bash
npm run ui-copy:watch
npm run ui-copy:validate
npm run ui-copy:report
```

## 상태 파일
- `output/ui-copy/translator-status.json`
- `output/ui-copy/validator-status.json`

## 감시 규칙
- 변경 감지 후 1초 debounce 뒤 static scan + `typecheck` + `lint`를 실행한다.
- 빠른 검사가 통과하면 3초 idle 뒤 `build`를 실행한다.
- watcher는 중단하지 않고 warnings/failures를 누적 기록한다.

## 종료 절차
1. `translator-status.json`에 적용 파일과 화면 목록이 기록되어 있는지 확인한다.
2. `validator-status.json`에 마지막 `typecheck`, `lint`, `build` 결과가 기록되어 있는지 확인한다.
3. `npm run ui-copy:report`로 보고서를 생성한다.
4. `docs/UI_COPY_RUN_REPORT.md`를 검토한 뒤 작업을 종료한다.
