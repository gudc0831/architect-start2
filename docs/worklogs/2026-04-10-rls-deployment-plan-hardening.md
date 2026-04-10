Req: harden the planning docs so long-term security uses Supabase RLS and Storage policies, and private-repo deployment uses branch protection, required checks, and Vercel environment separation.
Diff: update PLAN.md, auth/RBAC contract, multi-user transition plan, and Supabase migration guide; add deployment protection contract.
Why: the previous plan direction was sound but under-specified on SSR OAuth callback rules, policy-backed security boundaries, and private-repo release guardrails.
Verify/Time: reviewed updated links, file references, and official Supabase/GitHub/Vercel guidance while revising docs; no app tests run | 2026-04-10 KST
