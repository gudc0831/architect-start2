Req: Implement Slice 369 provider execution package review history.
Diff: Added package review metadata to provider execution list responses, Admin UI history filters for target/status/artifact/digest, and user guide notes.
Why: Provider execution packages can be exported individually; admins need a retained evidence history view without regenerating packages or mutating audit records.
Verify/Time: API validation passed for package review metadata and filter criteria; Browser UI validation passed for execution package history filters; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing React hook warnings on 2026-05-13 15:59 KST.
