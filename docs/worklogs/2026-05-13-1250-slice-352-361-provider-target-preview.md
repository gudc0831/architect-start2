Req: Continue 10 roadmap-driven slices without splitting work that fits one slice.
Diff: Added provider target config APIs, provider preview API, sync target config UI, provider-ready audit status, dry-run adapter preview, copyable preview report, responsive provider preview styling, and user-guide updates.
Why: Persisted export audits need an admin-controlled provider boundary and dry-run adapter preview before any real external write adapter is enabled.
Verify/Time: `npm run typecheck`; `npm run lint` with 7 pre-existing SaaS hook warnings; API sync-target/export-audit/provider-preview validation; Browser UI provider preview desktop/mobile validation | 2026-05-13 12:50 KST
