Req: Implement SaaS API Mode live provider adapter and admin reporting.
Diff: Added server-only SaaS provider adapter with mock and OpenAI Responses API paths; recorded provider failures as usage/audit events; added admin audit API and `/admin/assistant` reporting UI; updated `/daily` SaaS API output, API contract, and user guide.
Why: Slice 05D/05E needs the SaaS server to own provider execution and give admins policy, usage, cost estimate, and audit visibility before production hardening.
Verify/Time: 2026-05-08 18:30 KST; `npm run typecheck`, `npm run lint`, and `npm run build` passed. In-app browser verified `/admin/assistant` policy/report/audit rendering and `/daily` SaaS API popup generation with provider/usage output.
