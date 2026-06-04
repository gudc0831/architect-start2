Req: Implement and verify Slice 24 guarded assistant audit cleanup execution.
Diff: Added preview cutoff/token validation, guarded cleanup API, audit-event deletion repository methods, Admin UI cleanup controls, and user guide cleanup instructions.
Why: Admin cleanup must require a matching archive preview/export token and leave an audit trail before assistant audit records can be deleted.
Verify/Time: 2026-05-12 11:00 KST; typecheck passed during implementation; API guard returned 400 for token mismatch and no-op cleanup wrote a cleanup audit; Browser UI verified desktop and mobile cleanup controls.
