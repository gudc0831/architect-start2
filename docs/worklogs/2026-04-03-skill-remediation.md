# 2026-04-03 Skill Remediation

## User request

- Apply the recommended skill cleanup: remove duplicate slash-entry conflicts, keep Codex as the primary global skill root, and repair the broken `ui-ux-pro-max` install.

## Implementation summary

- Moved duplicate skill names out of `C:\Users\hcchoi\.agents\skills` into `C:\Users\hcchoi\.agents\skills-disabled\20260403-182257`.
- Moved the broken `C:\Users\hcchoi\.codex\skills\ui-ux-pro-max` copy into `C:\Users\hcchoi\.codex\skills-backups\20260403-182257\ui-ux-pro-max`.
- Reinstalled a fresh Codex-targeted `ui-ux-pro-max` by generating it in a temp directory with `npx uipro-cli init --ai codex` and moving the resulting folder into `C:\Users\hcchoi\.codex\skills\ui-ux-pro-max`.

## Verification

- Confirmed no duplicate skill names remain across `C:\Users\hcchoi\.codex\skills` and `C:\Users\hcchoi\.agents\skills`.
- Confirmed `C:\Users\hcchoi\.codex\skills\ui-ux-pro-max\data` and `C:\Users\hcchoi\.codex\skills\ui-ux-pro-max\scripts` are real directories with expected CSV and Python assets.
- Ran `python C:\Users\hcchoi\.codex\skills\ui-ux-pro-max\scripts\search.py "saas landing" --domain style` successfully.

## Remaining risks

- Current session skill discovery may remain stale until Codex is restarted.
- Upstream README documents Codex for auto-activation, but its slash-command support section does not list Codex, so natural-language activation is still the safer path for this skill.
