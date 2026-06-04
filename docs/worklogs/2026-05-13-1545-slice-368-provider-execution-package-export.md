Req: Implement Slice 368 immutable provider execution package export.
Diff: Added provider execution package assembly, read-only package download API, Admin UI copy/download controls, and user guide notes.
Why: Provider execution preflight evidence needs a stable export package tied to append-only audit records for rollback and governance review.
Verify/Time: API validation passed for immutable package contents and secret exclusion; Browser UI validation passed for execution package download; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing React hook warnings on 2026-05-13 15:45 KST.
