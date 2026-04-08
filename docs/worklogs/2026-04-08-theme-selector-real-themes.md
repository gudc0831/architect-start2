Req: 기존 테마 버튼이 실제 화면을 바꾸도록 연결하고, 현재 기본 화면도 하나의 테마로 유지한 채 각 테마별 차이를 적용.
Diff: `src/app/globals.css`에서 `classic`/`swiss-modern`/`productivity` 토큰을 분리하고 주요 하드코딩 색상을 의미 토큰으로 치환. `src/lib/ui-copy/catalog.ts`에서 테마 도움말과 설명을 실제 동작 기준으로 수정.
Why: 저장만 되던 테마 선택을 실제 시각 시스템 전환으로 바꿔 사용자가 즉시 비교·피드백할 수 있게 하기 위해.
Verify: `npm run lint` (기존 hook warning 8건 유지), `npm run build` 통과, `http://127.0.0.1:3000/board` 및 `/daily`에서 테마 전환/내비게이션/1024px/390px 실브라우저 확인.
Risk: `Classic`과 `Swiss Modern`의 차이는 의도적으로 구조를 유지해 상대적으로 절제되어 있으며, 사용 후 추가 대비 조정 요청이 들어올 수 있음.
