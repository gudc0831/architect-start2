Req: Task Assistant auto-save temporary review records and project wiki registration.
Task 0 preflight: `git status --short --branch` differed from the plan baseline because the implementation plan file was untracked.
Exact status:
```text
## codex/multi-user-transition...origin/codex/multi-user-transition [ahead 1]
 M docs/worklogs/2026-06-24-task-assistant-visible-answer-ux.md
 M scripts/task-assistant-unified-contract-validate.ts
 M src/app/globals.css
 M src/components/tasks/task-assistant-panel.tsx
?? docs/superpowers/plans/2026-06-24-task-assistant-autosave-project-wiki-implementation-plan.md
```
Worktree: normal checkout (`git rev-parse --git-dir` and `--git-common-dir` both returned `.git`), no submodule superproject; proceeding in the requested `codex/multi-user-transition` branch rather than creating a new local worktree.
Task 0 verify: `npm run task-assistant:unified:validate` passed for the coordination baseline UX change; `Select-String` confirmed the design spec contains `자동저장`, `프로젝트wiki`, `공용wiki 후보`, `비활성 포함`, and `보완 메모 추가`.
Lane assignment:
- Lane A Data/Domain: hy
- Lane B Temporary Review: ung
- Lane C Project WIKI Service: hy
- Lane D Retrieval: ung
- Lane E Task Assistant UX: ch
- Lane F Project Materials UX: ch
- Lane G Common Candidate: hy
- Lane H Verification: ul

Diff: Added project WIKI domain/repository/API/UI, temporary review auto-save/delete/restore, retrieval integration, project materials WIKI management, and common candidate disabled-source badge.
Why: Prevent review loss, separate temporary review records from work approval, and keep project-scoped WIKI distinct from common WIKI approval.

Completed commits:
- `c9db50b` docs: record project wiki implementation preflight
- `502fb0b` feat: add project wiki data contracts
- `d1757c6` fix: merge temporary review project wiki metadata
- `da80d09` fix: harden project wiki registration APIs
- `f4b0073` fix: preserve project wiki evidence through assistant policy
- `5fb719c` fix: allow project wiki registration retry
- `a1d2fd5` feat: add project wiki materials page
- `7bd4e10` feat: mark disabled project wiki sources on common candidates

Task summary:
- Task 1: Added project WIKI Prisma schema, migration, repository contracts, scoped relations, source-review/source-draft/common-candidate invariants, and static validators.
- Task 2: Implemented temporary review auto-save semantics, newest-six active review list, soft delete/restore routes, and narrow merge-safe project WIKI metadata updates.
- Task 3: Implemented project WIKI list/detail/preview/register/status APIs, deterministic suitability draft generation, participant access checks, malformed JSON handling, registration idempotency, and no-op status behavior.
- Task 4: Integrated active project WIKI into Task Assistant retrieval before common WIKI, added `project_wiki` evidence policy/default migration, and preserved project WIKI evidence through review-session and Legal Graph RAG context.
- Task 5: Replaced manual review-save flow with auto-save/retry, renamed history to `임시 검토 기록`, added delete/undo restore, approval-to-project-WIKI preview/register/cancel/retry, and registered/common candidate display.
- Task 6: Added `/materials` `자료` / `프로젝트 WIKI` segmented view, keyword-only search, `비활성 포함`, detail/status controls/action logs, preview samples, and strengthened Playwright smoke.
- Task 7: Synced linked common WIKI candidate metadata on project WIKI disable/restore, healed no-op status metadata, added admin DTO fallback to linked project WIKI status, and rendered `원본 비활성화됨` badge.

Review notes:
- Spec/code-quality review loops found and resolved Task 5 registration retry/cancel gaps, Task 6 hydration/timezone/preview action-log/stale-data issues, and Task 7 local-backend/no-op/backfill badge gaps.
- No production deploy or push was performed.

Final verification on 2026-06-24:
- `npm run project-wiki:validate` passed.
- `npm run project-wiki:behavior:validate` passed.
- `npm run task-assistant:unified:validate` passed.
- `npm run structured-knowledge:ui-contract:validate` passed.
- `npm run task-review:validate` passed.
- `npm run project-context:validate` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run project-wiki:preview-smoke` passed against local `http://localhost:3000/preview/materials?view=wiki`.
