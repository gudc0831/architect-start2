Req: Fix the garbled text in the issue ID area of the daily task list.
Diff: Replaced broken reorder button labels in `src/components/tasks/task-workspace.tsx` with readable Korean labels for desktop task rows.
Why: The issue ID column still rendered `??` and mixed English aria labels after the earlier text repair, so the remaining desktop controls needed explicit cleanup.
Verify: Browser check on `http://127.0.0.1:3000/daily` plus `npm run lint` after the patch.
