# API and storage security hardening

Req: Audit and remediate file storage ownership, upload/download content handling, compensation safety, and malformed legal-change evidence.
Diff: Enforced canonical bucket and task/file-owned paths before artifact create/read/delete and purge; recalculated upload MIME from extension; retained objects on ambiguous commits; routed downloads through attachment-safe app responses; made malformed legal metadata conservatively require review.
Why: Prevent cross-tenant object access/deletion, active-content inline execution, destructive compensation after uncertain writes, and confidence bypass or runtime failure from incomplete legal metadata.
Verify/Time: `npm run typecheck`; targeted `npx eslint`; `npx tsx scripts/api-security-boundaries-validate.ts`; `npx tsx scripts/legal-change-monitor-validate.ts`; `npx tsx scripts/data-integrity-contract-validate.ts` — all passed on 2026-07-30 KST.
