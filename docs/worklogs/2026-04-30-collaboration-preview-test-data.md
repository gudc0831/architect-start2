Req: Prepare Step 11 Preview test data before the final login/browser verification pass.
Diff: Backed up Preview, added `preview-step11-*` Auth/profile fixtures for viewer, editor, pending, rejected, manager-request, and pending/revoked/expired invitations without changing the existing no-access baseline.
Why: Role, invitation, and access-request checks need dedicated Preview fixtures while Google/browser login verification remains deferred to the final pass.
Verify/Time: Backup `cloud-2026-04-30T02-10-24-568Z-9c4e4b70`; fixture readback query; `npm run data:doctor` clean with no write lock / 2026-04-30 KST.
