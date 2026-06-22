# 2026-06-22 Local Codex review usage closeout

## Summary

- Added Browser Assistant page ready event: `architect:page-local-runtime-ready`.
- Added native host parsing for per-run `codex exec --json` usage metadata.
- Added SaaS Local Codex preflight before retrieval/generation.
- Changed Daily Local Codex usage recording from fire-and-forget to awaited, retryable state.
- Added `requestHash` idempotency for assistant usage events.
- Split `/ai-settings` server usage summary into SaaS API tokens and Local Codex recorded tokens.
- Added usage verifier script and runbook.

## Validation

- Browser Assistant: `npx vitest run src/content/content-script.test.ts`
- Browser Assistant: `node --test native-host/codex-bridge-host.node-test.mjs`
- Browser Assistant: `npm run typecheck`
- SaaS: `npx tsx scripts/ai-settings-contract-validate.ts`
- SaaS: `node --check scripts/verify-assistant-usage.mjs`
- SaaS: `npm run typecheck`
- SaaS: `npx prisma validate`

## Notes

The verified local machine state showed the Browser Assistant manifest, native host manifest, native host verifier, and Codex CLI were ready. The failure direction is therefore the active browser page/profile attachment: the current page must have the content script attached and answering before retrieval begins.
