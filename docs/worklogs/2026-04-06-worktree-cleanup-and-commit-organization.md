Req: Preserve remaining uncommitted work, split it into logical commits, drop only unnecessary generated artifacts, and leave the branch in a clean state.
Diff: Grouped remaining changes into calendar/task support, admin UI, and plan/docs commits; removed generated `output/owner-discipline-export.xlsx`; ran final repo verification after the commit split.
Why: The previously pushed regression fix depended on still-uncommitted support files, and the mixed worktree made the branch hard to reason about or reuse safely.
Verify/Time: `git diff --cached --name-status` before each commit; final `git status`, `npm run typecheck`, and `npm run lint` (existing warnings only) after the split | 2026-04-06 KST
