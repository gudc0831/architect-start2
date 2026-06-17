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
