Req: Remove the visible `정렬` label from the issue ID rows and pull the issue ID badge closer to the left.
Diff: Replaced the reorder text with a compact drag grip in `src/components/tasks/task-workspace.tsx` and tightened issue ID cell spacing in `src/app/globals.css`.
Why: The reorder label consumed horizontal space in the issue ID cell and added scan noise without helping recognition.
Verify/Time: `npm run lint` passed with pre-existing warnings only; browser check on `http://127.0.0.1:3000/daily` confirmed the label removal at 1440 desktop with no visible regression at 1280 desktop or 390 mobile on 2026-04-08.
