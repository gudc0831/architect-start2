Req: Refine the collaboration expansion plan so realtime starts with refresh, then presence/active editor signals, then actual edit leases instead of task-selection locks.
Diff: locked Gate 5, added a four-layer realtime model, inserted an edit-lease work order, and updated verification/rollout rules to reject selection-based locks and defer automatic merge.
Why: selection is too broad to block collaboration; field/cell edit leases protect active editing while keeping viewing and task selection lightweight.
Verify/Time: document diff and worklog checks run on 2026-04-28.
