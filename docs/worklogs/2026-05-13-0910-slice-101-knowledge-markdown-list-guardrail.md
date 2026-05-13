Req: Implement Slice 101 Knowledge Markdown list guardrail.
Diff: Reused the Markdown structure summary in approval guardrails, added ready/warning notes for Markdown list-item coverage, and updated the user guide.
Why: Reviewers need approval warnings when a draft has prose but no list structure for action or context extraction.
Verify/Time: 2026-05-13 09:14 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified missing/present list guardrails and checklist copy inclusion.
