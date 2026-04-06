Req: 캘린더에 보이는 task의 내용과 시각적 UI 느낌을 보드 task와 비슷한 compact card 계열로 맞추고, 월간 셀은 내부 스크롤로 유지하면서 모바일 agenda도 같은 카드 패밀리로 정렬.
Diff: `src/components/tasks/task-preview-card.tsx` 공용 compact preview card 추가; `src/components/tasks/board-task-overview.tsx`가 공용 카드 사용; `src/components/tasks/task-workspace.tsx`에서 calendar month/agenda를 공용 카드로 교체하고 due-date 그룹 정렬을 고정; `src/app/globals.css`에 공용 카드, 월간 셀 고정 높이/내부 스크롤, agenda/card density 스타일 추가.
Why: 캘린더가 단순 링크 목록처럼 보여 상태와 우선순위가 약하게 읽히던 문제를 줄이고, 보드와 같은 정보 위계로 task를 빠르게 스캔할 수 있게 하기 위해.
Verify/Time: `npm run typecheck` x2, `npm run lint`(기존 경고 4건만 유지), 브라우저 QA로 `/preview/calendar` 1440 월간·1152 월간·1024 agenda·390 agenda 확인, `/preview/board` 1440에서 메모 토글 및 이전/다음 버튼 유지 확인, DOM stress test로 월간 셀 1칸에 카드 5개 주입 시 row 확장 없이 내부 스크롤 유지 확인 | 2026-04-06 14:40-14:47 KST
