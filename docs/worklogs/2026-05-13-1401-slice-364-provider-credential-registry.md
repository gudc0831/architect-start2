Req: Implement Slice 364 provider credential registry readiness controls.
Diff: Added server-side credential registry metadata parsing, remote write readiness blockers, Admin UI readiness chips, and user guide notes for deployment-managed provider credentials.
Why: Provider execution should expose deployment readiness before any live Obsidian, Notion, or retrieval write adapter is enabled.
Verify/Time: typecheck passed; lint passed with 7 pre-existing React hook warnings; API validation passed for registry readiness; Browser UI validation passed for readiness chips on 2026-05-13 14:01 KST.
