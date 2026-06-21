# Collaboration Preview Closeout - 2026-06-18

Status: MACHINE-VERIFIABLE PREVIEW CHECKS CLOSED. User-assisted real Google OAuth provider UI and a few invitation negative-edge checks remain open.

Preview URL checked: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`.

Final canonical alias proof:
- Command: `with-ascii-host npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf`.
- Result: PASS.
- Deployment id: `dpl_CfpmGz6YZMaCTd9bGfQRab9k1dLE`.
- Direct deployment URL: `https://architect-start2-3sa40o4gv-chois-projects-7b2948cf.vercel.app`.
- Target/status: `preview` / `Ready`.
- Created: Thu Jun 18 2026 17:12:27 GMT+0900.
- Route reachability: `curl.exe -I -L .../preview/daily` returned HTTP `200`.

## Code Fixes Made For Closeout

- Dependency audit: `overrides.hono` `4.12.18` -> `4.12.25`; `overrides.protobufjs` `7.5.9` -> `7.6.3`; lockfile refreshed.
- Supabase public env: `src/lib/supabase/config.ts` now uses static `process.env.NEXT_PUBLIC_*` property access so Next.js inlines client env correctly.
- File upload fallback: `src/components/tasks/task-workspace.tsx` falls back from direct Supabase Storage upload to guarded relay upload when client storage/RLS/env failures occur.
- Review hardening: direct-upload fallback now includes network/CORS-style fetch failures while refusing relay fallback for app API response errors, and live Preview mutation verifiers require `ALLOW_PREVIEW_MUTATION_PROBE=1`, an explicit `PREVIEW_PROJECT_B_ID`, and a branch Preview Vercel host.
- Reorder sync status: daily sync status now reflects active reorder requests even when the mutation journal has no active operation row.
- Two-window CRDT retry: `src/use-cases/task-cell-document-service.ts` gives the cell-document transaction explicit `maxWait`/`timeout` and retries retryable `P2028` transaction-start and `P2034` write-conflict errors.
- Preview API probe: `scripts/preview-collaboration-api-probe.ts` now verifies positive invitation acceptance and manager/admin access approval paths using disposable users, then deletes disposable profile/membership/request/invitation/auth artifacts.
- Browser file verifier: `scripts/preview-file-browser-flow-verify.ts` verifies browser create/upload/open plus viewer authorized and no-access denied file content.

## Final Preview Verification

All commands below targeted the canonical Preview alias above and project fixture `0b12f210-19e4-5bc1-a2af-cdb38b6bb9d8`.

| Check | Result | Evidence |
| --- | --- | --- |
| Collaboration API probe | PASS | `node --env-file=.env.preview.local --import tsx scripts/preview-collaboration-api-probe.ts` with `ALLOW_PREVIEW_MUTATION_PROBE=1`, `PREVIEW_BASE_URL`, `PREVIEW_PROJECT_B_ID`, `PREVIEW_MANAGER_EMAIL=preview-step11-manager@architect-start.test`, `PREVIEW_NO_ACCESS_EMAIL=preview-step11-no-access@architect-start.test`; output ended `Probe passed.` |
| Viewer/editor/no-access daily browser acceptance | PASS | `scripts/daily-remaining-acceptance-verify.ts --url .../daily --reorder-delay-ms 5000 --realtime-timeout-ms 30000 --viewer-ready-ms 5000`; output `ok: true`. |
| Two-window CRDT collaboration | PASS | `scripts/daily-cell-collaboration-two-window-verify.ts --url .../daily`; output `ok: true`, both windows posted updates `A=200`, `B=200`, server projection and both windows contained merged text, reload preserved it. |
| File browser upload/open/authorization | PASS | `scripts/preview-file-browser-flow-verify.ts --url .../daily`; output `ok: true`; browser uploaded a text file, `/api/files` listed it, viewer content read returned `200`, no-access content read returned `403`, browser Open popup returned uploaded file content. |
| Local static/type/build gates | PASS | `npm run typecheck`, `npm run lint`, `npm run build`, `npm run deps:audit`, `npx prisma validate`, `node --import tsx scripts/daily-editing-responsiveness-verify.ts`, `node --import tsx scripts/daily-cell-collaboration-verify.ts`. |

Important failure learning:
- Failed attempt 1: API probe defaulted to stale project id `2150d595-0570-4309-9198-031e90668af4`; result was `PROJECT_NOT_FOUND`.
- Failed attempt 2: API probe used stale manager/no-access default emails; result was manager `PROJECT_MANAGER_REQUIRED` and no-access project leakage false positives.
- Fix: pass current fixture overrides explicitly: `PREVIEW_PROJECT_B_ID=0b12f210-19e4-5bc1-a2af-cdb38b6bb9d8`, `PREVIEW_MANAGER_EMAIL=preview-step11-manager@architect-start.test`, `PREVIEW_NO_ACCESS_EMAIL=preview-step11-no-access@architect-start.test`.
- Failed attempt 3: two browser scripts were run in parallel and competed for Supabase magic-link/OTP and DB transaction resources.
- Prevention: run Preview browser probes that share fixture accounts sequentially.
- Failed attempt 4: two-window CRDT update reproduced a real Preview server bug: second concurrent update returned 500 with `PrismaClientKnownRequestError: Transaction API error: Unable to start a transaction in the given time.`
- Fix/evidence: added service-local transaction `maxWait`/`timeout` and retry for retryable transaction-start/write-conflict errors; final redeploy `dpl_CfpmGz6YZMaCTd9bGfQRab9k1dLE`; two-window verifier then passed.

## Remaining User-Owned Checks

Step 11 remains open only for checks that require real provider identities or specific negative fixtures not safely inventable here:

- Real Google OAuth provider UI: clean browser or incognito -> `/login` -> Google provider -> `/auth/callback` -> `/auth/post-login`, for admin, manager, and pending/no-access outcomes.
- Unsafe external `next` redirect check through the actual provider redirect path.
- Wrong Google email cannot accept an invitation.
- Revoked invitation cannot be accepted.
- Expired invitation cannot be accepted when an expired fixture is available.
- Explicit rejected-request audit/history negative case.

No secret values, cookies, OTP token hashes, auth sessions, DB URLs, signed URLs, or authorization headers were recorded.
