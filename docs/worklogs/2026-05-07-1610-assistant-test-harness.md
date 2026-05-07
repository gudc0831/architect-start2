Req: Make the PLAN.md Task Assistant Core Loop service immediately testable and add a user guide.
Diff: Added `/assistant-test` same-origin SaaS test harness for task selection, sample task creation, evidence retrieval, mock generation, assistant record save, and work summary approval. Added `사용자 가이드.md`.
Why: The browser extension boundary is implemented, but users need an immediate local test path without Chrome extension installation or real local runtime bridge.
Verify/Time: 2026-05-07 16:15 KST; ran `npm run typecheck`, `npm run lint`, and `npm run build`. Lint passed with pre-existing task component warnings; build passed with pre-existing data-guard dynamic file-pattern warnings.
