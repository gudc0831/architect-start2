Req: 전환된 계획에 따라 `/assistant-test` 중심이 아닌 기존 `/daily` task 클릭에 반응하는 PC 전용 assistant panel을 구현한다.
Diff: `src/components/tasks/task-assistant-panel.tsx`를 추가하고 `TaskWorkspace`에 연결했다. `/daily` 선택 task를 기준으로 질문/검토 지침 입력, SaaS evidence retrieval, mock 건축 검토 의견 생성, assistant record 저장, 작업 기록 승인 흐름을 제공한다. `globals.css`에 floating panel 스타일을 추가하고 `사용자 가이드.md`를 `/daily` 중심 테스트 흐름으로 갱신했다.
Why: 사용자는 일일목록을 떠나지 않고 선택한 건축 task에 특화된 답변과 검토 의견을 받아야 하며, 모바일 assistant UX는 후속 확장으로 남긴다.
Verify/Time: 2026-05-07 16:57 KST. `npm run typecheck`, `npm run lint`(기존 warnings 7건), `npm run build`(기존 data-guard Turbopack warnings 2건) 통과. Browser-use로 `http://localhost:3000/daily`에서 `AI 검토 001` 열기, `근거 조회 + 의견 생성`, `작업 기록 승인`까지 직접 확인했고 콘솔 error/warn 없음.
