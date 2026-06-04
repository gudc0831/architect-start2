Req: Document goal 09 Local Codex installed-path verifier in the SaaS user guide.
Diff: Updated `사용자 가이드.md` with `native-host:verify:windows` usage, current extension id verification result, and updated troubleshooting guidance.
Why: The default `/daily` popup remains the user workflow, but setup failures are easier to resolve when the guide points to the new browser-assistant verifier.
Verify/Time: Browser-assistant verifier passed with 7 pass / 0 warn / 0 fail; SaaS `npm run typecheck` passed for the doc-only repo state | 2026-05-11 13:36-13:44 KST.
