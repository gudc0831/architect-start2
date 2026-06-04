Req: Implement goal 08, an in-page Local Codex bridge health checklist for the default `/daily` assistant popup.
Diff: Added `Check bridge` UI, health checklist state classification, and compact health styles to the `/daily` task assistant popup; updated `사용자 가이드.md` with the status-check workflow.
Why: Users need to distinguish missing extension/content-script response from native host or Codex CLI readiness problems without leaving the default SaaS popup.
Verify/Time: `npm run typecheck` passed; `npm run lint` passed with existing unrelated hook warnings; `npm run build` passed with existing data-guard dynamic pattern warnings; `Invoke-WebRequest http://localhost:3000/daily` returned 200 OK | 2026-05-11 13:25-13:32 KST.
