Req: Implement Slice 473 crop artifact retention/delete controls after committing the previous post-468 work.
Diff: Added an editor-only crop artifact DELETE route, file-service artifact deletion that preserves the analysis entry, and a `/daily` saved crop remove control beside preview/download actions.
Why: Persisted image-region crop artifacts were previewable and downloadable, but users had no narrow way to remove an accidentally retained crop without deleting the analysis evidence.
Verify/Time: 2026-05-15 14:00 KST; passed `npm run typecheck`, `npm run lint`, `NEXT_DIST_DIR=.next-build npm run build`, and local HTTP DELETE returned 401 without auth.
