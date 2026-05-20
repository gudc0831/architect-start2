# UI Copy Run Report

## 변경된 카탈로그
- translator-status.json is missing or does not list catalog files.

## 적용된 화면
- translator-status.json is missing or does not list applied screens.

## 검증 결과
- Report generatedAt: 2026-05-20T05:41:27.213Z
- Translator agent status: unknown
- Translator generatedAt: unknown
- Validator agent status: failed
- Validator generatedAt: 2026-05-20T05:41:27.066Z
- typecheck: passed (exit=0, 5397ms)
- lint: passed (exit=0, 19729ms)
- build: passed (exit=0, 36563ms)
- Failure count: 10

## 남은 경고
- 없음

## 영어 UI 전환 시 주의 식별자
- Routes: /board, /daily, /calendar, /trash
- TaskStatus: new, in_review, in_discussion, blocked, done
- Field keys: actionId, dueDate, coordinationScope, requestedBy, relatedDisciplines, locationRef, calendarLinked, issueDetailNote, statusHistory
- API payload aliases in src/app/api/tasks/route.ts
- Prisma enums and localStorage keys must remain English identifiers.

## 상태 파일 오류
- translator status file is missing: output\ui-copy\translator-status.json

