Req: update harness-engineering so planning work checks for conflicting existing plans, unresolved options, expected bottlenecks, and user-choice points before execution.
Diff: update global and repo-local harness-engineering SKILL.md | add a Planning Decision Gate, require 1 recommendation + at least 3 alternatives with reasons, and wire the gate into execution flow/output expectations.
Why: prevent silent plan reconciliation and force an explicit user decision before decision-dependent work starts.
Verify/Time: quick_validate.py passed for C:\Users\hcchoi\.codex\skills\harness-engineering and D:\architect - start2\codex\skills\harness-engineering | 2026-04-09 KST
