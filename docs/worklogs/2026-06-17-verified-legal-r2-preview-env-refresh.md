Req: Update `architect-saas` Preview runtime to use the new R2-backed `verified-legal-evidence-api` Preview deployment after the verified API `/health` and `/api/legal/search` smokes passed.

Target: Branch-scoped Vercel Preview env for branch `codex/multi-user-transition` on project `architect-start2`.

Env: Updated `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET` after explicit approval for transferring the verified API secret and Vercel bypass token to the `architect-start2` Vercel project. Values were not printed. `LAW_OPEN_DATA_OC` was not added to SaaS.

Deploy: Redeployed `architect-saas` commit `b4b6f51` to Vercel Preview `https://architect-start2-c9erggsl2-chois-projects-7b2948cf.vercel.app`, deployment `dpl_BgXejRj37WV8YPtAazBxDqPc6pWJ`. Inspect reported target `preview`, status `Ready`, and alias `https://architect-start2-gudc083111-4864-chois-projects-7b2948cf.vercel.app`.

Verify: `/preview/daily` on the exact Preview URL returned HTTP `200`. Pre/redeploy checks run in this session: `npm run db:generate` passed; `npm run deploy:migration-gate` passed during Vercel build against the configured cloud database and reported schema up to date; local `npm run deploy:migration-gate` earlier skipped because local `APP_BACKEND_MODE=cloud` and `DATABASE_URL` were not both configured; `npm run structured-knowledge:repository:validate` passed; `npm run typecheck` passed; `npm run legal-search:validate` passed with `72` cases; `npm run task-review:validate` passed; `npm run ai-review:readiness` returned `ready` with `DATABASE_URL`, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET` configured and `LAW_OPEN_DATA_OC` absent.

Boundary: Browser clients still do not receive R2 credentials, LAW OPEN DATA credentials, or verified legal server secrets. SaaS uses only server-to-server `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, and the Vercel protection bypass secret for the protected verified API Preview.

Residual: Production env/promotion remains out of scope. No Git push was performed in this session.
