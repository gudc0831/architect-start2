Req: Implement Slice 362 provider credential boundaries and the first guarded provider execution adapter.
Diff: Added credentialRef/credentialStatus to Knowledge sync target config, raw-secret rejection, provider preview listing, guarded provider execution service/API, portable archive execution audit records, Admin Knowledge UI controls, and user guide updates.
Why: Provider previews were stable; the next safe implementation step is a server-audited execution boundary that does not expose secrets to the browser or enable remote provider side effects prematurely.
Verify/Time: `npm run typecheck` passed; `npm run lint` passed with 7 unrelated pre-existing React Hook warnings; API and Browser UI verification passed on 2026-05-13 13:20 KST.
