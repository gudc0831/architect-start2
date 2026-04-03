# UI Copy Run Report

## 변경된 카탈로그
- translator-status.json is missing or does not list catalog files.

## 적용된 화면
- translator-status.json is missing or does not list applied screens.

## 검증 결과
- Report generatedAt: 2026-04-03T01:04:29.650Z
- Translator agent status: unknown
- Translator generatedAt: unknown
- Validator agent status: failed
- Validator generatedAt: 2026-04-03T01:04:29.463Z
- typecheck: passed (exit=0, 3812ms)
- lint: passed (exit=0, 10020ms)
- build: passed (exit=0, 25280ms)
- Failure count: 9

## 남은 경고
- src/components/admin/admin-foundation-shell.tsx:37 Potential raw UI leak: json.error?.message
- src/providers/project-provider.tsx:82 Potential raw UI leak: json.error?.message

## 영어 UI 전환 시 주의 식별자
- Routes: /board, /daily, /calendar, /trash
- TaskStatus: new, in_review, in_discussion, blocked, done
- Field keys: actionId, dueDate, coordinationScope, requestedBy, relatedDisciplines, locationRef, calendarLinked, issueDetailNote, statusHistory
- API payload aliases in src/app/api/tasks/route.ts
- Prisma enums and localStorage keys must remain English identifiers.

## 상태 파일 오류
- translator status file is missing: output\ui-copy\translator-status.json

