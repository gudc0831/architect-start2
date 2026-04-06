Req: 보드 탭을 초고밀도 레이아웃으로 재구성하고 컬럼 접기/페이지 이동/카드 메모 펼침을 추가하며, 기본 카드에 제목과 날짜·지연정보만 노출되게 조정.
Diff: `src/components/tasks/task-workspace.tsx`에 보드 전용 collapse/page/expanded 상태와 상태 이동 후 페이지 보정 로직을 추가하고, `src/components/tasks/board-task-overview.tsx`와 `src/app/globals.css`에서 compact 컬럼/카드 구조와 2행 메타 레이아웃을 재편했으며 `src/lib/ui-copy/catalog.ts`에 보드 전용 라벨을 확장.
Why: 각 상태 컬럼을 독립적으로 접고 넘기며 스크롤할 수 있게 하고, 카드 기본형을 제목 + 날짜/임박·지연 + 메모 토글만 남겨 한 화면 스캔 밀도를 높이기 위해.
Verify: `npm run lint`(기존 경고 4건만 유지), `npm run typecheck`, `npm run build`(기존 `src/lib/data-guard/shared.ts` 경로 패턴 경고 2건만 유지), 로컬 `http://127.0.0.1:3000/board`에서 `1440x900` `1024x768` `390x844` 브라우저 확인.
Time: 2026-04-06 14:05 KST
