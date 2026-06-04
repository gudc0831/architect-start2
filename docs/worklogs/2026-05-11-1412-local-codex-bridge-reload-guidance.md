Req: Continue slice 11 by making the `/daily` Local Codex bridge failure actionable while installed-extension proof is blocked on manual Chrome reload.
Diff: Updated the in-page assistant missing-bridge diagnostics to name the Chrome extension reload step and native-host verifier command.
Why: Browser proof currently fails because the installed content script is not responding even though the native path verifies; the default popup should guide the operator to the exact recovery step.
Verify/Time: `npm run typecheck` passed; `/daily` popup showed the updated `chrome://extensions` reload guidance and installed-path verifier command in the Local Codex missing-bridge report | 2026-05-11 14:12 KST.
