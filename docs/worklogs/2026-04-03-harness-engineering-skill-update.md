# 2026-04-03 Harness Engineering Skill Update

## User request

- Apply the previously recommended `harness-engineering` updates.

## Changes

- Updated the global `harness-engineering` skill at `C:\Users\hcchoi\.codex\skills\harness-engineering\SKILL.md`.
- Updated the repo-local `harness-engineering` skill at `codex/skills/harness-engineering/SKILL.md` to keep behavior aligned in this workspace.
- Added:
  - review passes
  - design direction expansion guidance
  - design review heuristics
  - a debugging gate
  - learning capture expectations
  - a blocked escalation format
- Tightened the execution flow so these checks sit inside the existing coordinator-led harness instead of replacing it.

## Verification

- Read both skill files before editing.
- Read both skill files after editing and confirmed the global and repo-local copies are aligned.

## Changed files

- `C:\Users\hcchoi\.codex\skills\harness-engineering\SKILL.md`
- `codex/skills/harness-engineering/SKILL.md`
- `docs/worklogs/2026-04-03-harness-engineering-skill-update.md`

## Remaining risks

- I did not run a separate skill sync command because both the global and repo-local copies were edited directly.
