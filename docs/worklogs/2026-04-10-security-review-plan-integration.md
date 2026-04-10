Req: document the current security findings and fold them back into the active planning documents so the fixes become executable work.
Diff: add a security deployment review doc and update PLAN.md, auth/RBAC contract, multi-user transition plan, and deployment protection contract with concrete remediation items.
Why: the repo had real release blockers in authz, redirect handling, request integrity, dependency posture, and missing GitHub security automation that needed to become first-class planning inputs.
Verify/Time: reviewed updated links, finding-to-plan mapping, and referenced files locally; no code tests run | 2026-04-10 KST
