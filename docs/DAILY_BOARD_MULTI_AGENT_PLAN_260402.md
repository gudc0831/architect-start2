# Daily/Board Multi-Agent Execution Plan

## Branch And Scope

- Branch: `codex/detailcheckout_260402`
- Existing staged and unstaged changes remain part of the working baseline.
- Wave 1 scope focuses on `daily` execution UX and `board` overview polish.

## Roles

- Manager
  - Keep the current branch as the single integration branch.
  - Apply seam splits in `task-workspace`.
  - Coordinate merge order and validation gates.
- Screen verification agent
  - Verify `/daily` and `/board` on the local server at `1440`, `1024`, and `390`.
  - Report pass/fail, console issues, and responsive regressions.
- Worker A
  - Implement reorder persistence and use-case flow.
  - Keep ordering based on `parentTaskId`, `rootTaskId`, `depth`, and `siblingOrder`.
- Worker B
  - Extract board presentation seams and reusable focus-strip UI.
  - Keep `board` as overview only.
- Code review agent
  - Run `lint`, `typecheck`, `build`, and regression checks after integration.

## Implementation Waves

### Wave 0. Preparation

- Add this plan document.
- Keep `TaskWorkspace` stateful for now.
- Extract render-heavy view seams before deeper ownership changes.
- Reserve additive style sections with:
  - `daily-sheet-*`
  - `board-focus-*`
  - `task-state-*`

### Wave 1. Reorder Model

- Default mode is manual ordering.
- Add a batch reorder command endpoint.
- Support:
  - `manual_move`
  - `auto_sort`
- `manual_move` only reorders within the current parent in v1.
- Parent row moves keep subtree order by changing sibling order among siblings only.
- Child row moves stay inside the current parent.
- Auto sort strategies:
  - `priority`
  - `action_id`

### Wave 2. Daily UX

- Keep the first `Issue ID` column sticky.
- Add a header order menu with:
  - manual order
  - auto sort
  - restore Issue ID order
- Add drag handles in the tree cell.
- Add keyboard alternatives for row moves.
- Keep mobile as action-based, not drag-based.
- Export order follows the persisted tree order.

### Wave 3. Board UX

- Add a focus strip above the columns.
- Keep columns for status overview.
- Distinguish state and urgency separately:
  - state via rail/chip emphasis
  - urgency via due badges and focus categories
- Improve `1024px` readability without turning board into an editor.

## Validation Gates

- Manual move keeps parent subtree order intact.
- Child move does not cross parent boundaries.
- Auto sort persists after reload.
- Export follows visible tree order.
- `/daily` and `/board` pass local browser checks at `1440`, `1024`, and `390`.
- `npm run lint`
- `npm run typecheck`
- `npm run build`
