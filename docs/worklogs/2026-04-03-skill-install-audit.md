# 2026-04-03 Skill Install Audit

## User request

- Review skill-install issues similar to the broken `ui-ux-pro-max` setup and explain how to fix them.

## Findings

- `ui-ux-pro-max` exists in both `C:\Users\hcchoi\.codex\skills` and `C:\Users\hcchoi\.agents\skills`, so slash-style selection can show duplicate names.
- Both `ui-ux-pro-max` copies are structurally broken on Windows: root-level `scripts` and `data` are plain text pointer files, not real directories, and their targets under `C:\Users\hcchoi\src\ui-ux-pro-max\` do not exist.
- Duplicate names are not always identical. `frontend-design`, `ui-ux-pro-max`, and `web-design-guidelines` are effectively the same content, while `agent-browser` and especially `pdf` materially differ between `.agents` and `.codex`.
- The upstream repository README advertises `uipro init --ai codex`, but its slash-command section lists workflow-mode slash support only for Kiro, GitHub Copilot, Roo Code, and KiloCode.

## Evidence checked

- Local skill trees under `C:\Users\hcchoi\.codex\skills` and `C:\Users\hcchoi\.agents\skills`
- Hash and diff comparison of duplicate `SKILL.md` files
- Pointer-file target resolution for all skill files under both roots
- GitHub repository page for `nextlevelbuilder/ui-ux-pro-max-skill`

## Verification

- Confirmed only `ui-ux-pro-max` has the broken pointer-file pattern in the current local skill roots.
- Confirmed duplicate skill names exist for `agent-browser`, `frontend-design`, `pdf`, `ui-ux-pro-max`, and `web-design-guidelines`.

## Remaining risks

- The exact precedence rule for duplicate slash entries is not exposed by a local runtime API in this session, so selection behavior is inferred from duplicate registration plus the observed local state.
