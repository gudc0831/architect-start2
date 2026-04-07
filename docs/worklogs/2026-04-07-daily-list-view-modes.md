Req: 일일목록에 전체 보기와 50개씩 페이지 보기 모드를 추가하고, 모드 토글을 집중 영역 라인 우측 끝에 배치.
Diff: `src/components/tasks/task-workspace.tsx`, `src/domains/task/daily-list.ts`, `src/app/globals.css`, `src/lib/ui-copy/catalog.ts`에 보기 모드 상태/로컬 저장, 루트 단위 페이지 helper, pagination UI, 반응형 스타일, UI copy 추가.
Why: 필터/정렬 결과를 유지한 채 대량 task를 페이지 단위로 읽을 수 있게 하고, 부모/자식 묶음 분리를 피하면서 페이지 모드에서는 수동 재정렬을 막아 숨겨진 행과의 순서 충돌을 방지.
Verify/Time: `npm run typecheck`, `npm run lint` 통과(기존 unrelated warning만 존재); `verify-browser-ui`로 `/daily`에서 토글 위치, `1-49 / 199`, `50-98 / 199`, 페이지 이동, 페이지 모드 재정렬 비활성화, 전체 모드 복귀 시 재활성화, `1280`, `1024`, `390x844` 레이아웃 확인.
