# Task Assistant Project WIKI Plan Alignment Fixes

Date: 2026-06-25
Branch: `codex/multi-user-transition`

## Request

Fix remaining deviations from the Task Assistant auto-save / work approval / Project WIKI / common WIKI candidate plan after multi-agent review. Use harness and Superpowers workflow, keep deployment out of scope unless explicitly requested.

## Fixes

- Routed Project WIKI suitability live-provider calls through a shared SaaS governance wrapper so policy, evidence-kind, token, budget, usage, failure, and audit records are applied before provider egress.
- Persisted the registration preview draft into review-session Project WIKI state and changed registration to use that stored preview instead of recomputing a different provider draft.
- Made `/daily` review-session deep links reopen linked sessions even when the session is outside the default six-item history list.
- Made Project WIKI detail deep links select the requested `projectWikiItemId` even when another visible item is already selected.
- Removed the 100-item pre-filter cap from assistant Project WIKI retrieval so keyword matching can scan all active Project WIKI items before ranking.
- Synced local Project WIKI common-candidate status from the linked assistant record so approval/rejection state does not go stale in local/preview stores.
- Extended validators so these concrete regressions are checked rather than only relying on broad anchor presence.

## Verification

- `npm run project-wiki:behavior:validate`
- `npm run project-wiki:validate`
- `npm run task-assistant:unified:validate`
- `npm run structured-knowledge:ui-contract:validate`
- `npm run task-review:validate`
- `npm run project-context:validate`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run project-wiki:preview-smoke`

The six feature validators were also rerun in parallel after the fixes.

## Deployment

No production or preview deployment was performed in this worklog. The scope ended at local implementation, validation, and commit.
