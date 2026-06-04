Req: Implement dedicated file-analysis chunks and pgvector-ready rerank path for project-document retrieval.
Diff: Added Prisma schema/migration for `file_analysis_chunks`, deterministic chunk generation, Postgres chunk sync on metadata update, chunk-first search with optional query embedding, and retrieval validation coverage.
Why: Long file analysis and OCR outputs need chunk-level search quality and a forward-compatible pgvector path.
Verify/Time: 2026-05-14 18:53-19:05 KST. `npm run db:generate`, `npm run typecheck`, `npm run retrieval:hybrid:validate`, `npm run lint`, and `npm run build` passed.
