Req: Implement Slice 365 Obsidian dry-run reconciliation package.
Diff: Added provider reconciliation package metadata to preview/execution records, Admin UI reconciliation rows, copied report sections, and user guide notes.
Why: Live provider writes need an exact reviewable path/intent package before any Obsidian vault mutation is enabled.
Verify/Time: typecheck passed; lint passed with 7 pre-existing React hook warnings; API validation passed for reconciliation package metadata; Browser UI validation passed for reconciliation rendering on 2026-05-13 14:11 KST.
