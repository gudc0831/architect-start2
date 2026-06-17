# 2026-06-17 Assistant Record Legal Boundary

## Summary

- Hardened the generic `/api/assistant/records` save path so client-submitted legal verification metadata is not trusted as server-verified legal evidence.
- Added storage sanitization that removes client-submitted `verificationStatus`, `legal`, official-law metadata fields, and related legal-source claims from generic assistant record evidence.
- Records with removed legal verification claims are saved as `not_candidate`, keeping them out of WIKI candidate review.
- `/api/assistant/task-review` remains the server-side verified legal evidence path and keeps its existing server-verified evidence bundle behavior.

## Validation

- `npm run legal-search:validate`
- `npm run task-review:validate`
- `npm run typecheck`
- `npm run lint`

## Preview Closeout

- Commit: `053f897b124b78565a3b218e4d32035aab4a245a`
- Preview URL: `https://architect-start2-8706enjmu-chois-projects-7b2948cf.vercel.app`
- Deployment: `dpl_HMwvNWC9DED67GJS6CuGXhuAV5uy`
- `/preview/daily` returned HTTP `200`.
- Browser Assistant was rebuilt against this exact Preview URL and release readiness returned `16 pass`, `2 warn`, `0 fail`.

## Verified Legal Handoff

- `architect-saas` Preview env names were verified without values:
  - `VERIFIED_LEGAL_EVIDENCE_API_URL`
  - `VERIFIED_LEGAL_EVIDENCE_API_SECRET`
  - `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`
  - `VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS`
- After explicit approval to create a temporary Vercel authentication-bypass share URL, direct protected POST smoke against `verified-legal-evidence-api` `/api/legal/search` returned HTTP `200`, queryId `legal_query:826ec48199457b92`, `3` hits, `0` warnings, and first hit `law:건축법:001823` with `answerReady=true`.
- Do not write temporary share URLs, Vercel bypass tokens, API secrets, cookies, request headers, R2 credentials, or signed URLs into worklogs.

## Cleanup Note

- Requested cleanup target `D:\architect-workspace\architect-saas\scripts\import-miryang-bubuk-xlsx-once.ts` no longer exists; final `Test-Path` returned `False`.
