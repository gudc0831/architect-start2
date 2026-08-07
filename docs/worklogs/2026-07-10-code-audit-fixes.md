Req: Repair the stale legal-search validation gate found during the workspace audit.
Diff: Replaced removed `setPendingTaskReview` and outdated formatting/state assertions with current retrieval assignment, review-session auto-save payload, multiline POST, and saved-evidence contracts.
Failure: `npm.cmd run legal-search:validate` failed even though the current Task Assistant unified contract and runtime flow were valid.
Cause: Source-text assertions still targeted the pre-auto-save review implementation.
Fix: Updated only the validator anchors; production Task Assistant behavior was unchanged.
Evidence: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run legal-search:validate` (75 cases), and `npm.cmd run task-assistant:unified:validate` passed on 2026-07-10 KST.
Prevention: Anchor legal-search validation to persisted retrieval/review invariants rather than removed intermediate state names.
