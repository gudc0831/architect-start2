Req: 페이지 보기에서 이전/다음 전환이 불안정한 문제를 보완하고, 원하는 페이지를 직접 누를 수 있는 숫자 페이지 UI를 추가.
Diff: `src/components/tasks/task-workspace.tsx`에 명시적 페이지 이동 시 선택 기반 페이지 동기화를 한 번 건너뛰는 guard와 숫자 페이지 버튼 렌더링 추가, `src/app/globals.css`에 숫자 페이지/모바일 래핑 스타일 추가, `src/lib/ui-copy/catalog.ts`에 페이지 이동 aria/copy 추가.
Why: 명시적 페이지 이동 직후 선택된 task의 페이지 동기화 effect가 같은 렌더 주기에서 현재 페이지를 다시 덮어쓸 여지를 줄이고, 사용자가 `2`, `3`, `4`, `5`처럼 바로 원하는 페이지로 이동할 수 있게 하기 위해.
Verify/Time: `npm run typecheck` 통과, `npm run lint` 통과(기존 unrelated warning 3건 유지), `npm run ui-copy:validate`는 기존 validator failure로 실패; `verify-browser-ui`로 `/daily`에서 `1 -> 2 -> 3 -> 4 -> 5 -> 4`, 숫자 버튼 `2 -> 5 -> 4`, 모바일 `390x844` 페이지 버튼 노출까지 확인.
