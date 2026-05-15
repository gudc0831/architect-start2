Req: Continue with the next roadmap candidate after Slice 473 by implementing Slice 474 source-by-source legal-source governance review workflow.
Diff: Added append-only regulation governance source review records, source-specific review API, report summary fields, `/admin/knowledge` source-row review controls, and copyable report source review content.
Why: Knowledge admins need durable per-source review evidence instead of only package-level acknowledgement notes.
Verify/Time: 2026-05-15 14:12 KST; passed `npm run typecheck`, `npm run lint`, `npm run regulation:governance:validate`, `NEXT_DIST_DIR=.next-build npm run build`, direct governance report check, and unauthenticated source review GET/POST returned 401.
