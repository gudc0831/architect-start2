Req: Implement and verify Slice 385 provider execution package review coverage queue grouping.
Diff: Grouped Admin Knowledge provider execution package review coverage rows into stale, unreviewed, and reviewed queues; updated `사용자 가이드.md`.
Why: Reviewers need to scan coverage rows by review state after using coverage group totals and shortcuts.
Verify/Time: Passed 2026-05-14 09:45 KST: `npm run typecheck`; `npm run lint` (pre-existing task hook dependency warnings only); direct `getKnowledgeProviderExecutionPackageReviewNoteReport` group count validation; `npm run build`; Browser UI validation at 1440x900 and 390x844 confirmed stale, unreviewed, and reviewed group headings plus grouped `Focus digest` actions.
