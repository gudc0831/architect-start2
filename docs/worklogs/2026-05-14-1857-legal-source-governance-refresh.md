Req: Implement production legal-source import governance and refresh validation for regulation seed packages.
Diff: Added regulation governance domain validator, foundation governance manifest, `regulation:governance:validate` script, and package script.
Why: Legal-source seed import needed deterministic offline controls for official URL matching, Knowledge admin promotion blocking, verification checklist coverage, and refresh due dates.
Verify/Time: 2026-05-14 18:57-19:05 KST. `npm run regulation:governance:validate`, `npm run typecheck`, `npm run lint`, and `npm run build` passed.
