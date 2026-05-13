Req: Implement Slice 114 Knowledge queue layout stability after browser UI verification exposed stretched counter rows.
Diff: Changed the Knowledge Admin queue from a two-row grid to a vertical flex layout, let the candidate list flex and scroll, and updated the user guide.
Why: Candidate state/risk count rows must remain compact while the candidate list owns remaining scroll space.
Verify/Time: 2026-05-13 09:41 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; Playwright browser UI verified candidate state/risk count chips stay compact at 31px height and mobile remains single-column.
