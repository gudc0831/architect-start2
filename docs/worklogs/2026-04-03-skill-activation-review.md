# 2026-04-03 Skill Activation Review

## User request

- Review whether skill changes are reflected immediately when a skill is used.

## Findings

- Existing skill content changes can be used immediately in this workspace when the updated `SKILL.md` is read directly.
- Repo-local and global skill copies do not auto-sync; this repo uses `npm run codex:skills:sync` to copy `codex/skills/*` into `$CODEX_HOME/skills`.
- New skill discovery is session-scoped and is not guaranteed to refresh automatically in the current conversation.

## Evidence checked

- `AGENTS.md` project-skill routing and sync guidance
- `package.json` scripts for `codex:skills:list` and `codex:skills:sync`
- `scripts/sync-project-skills.ps1` copy behavior
- Current timestamps and contents of both `harness-engineering` skill copies
- `npm run codex:skills:list` output

## Verification

- Confirmed the repo lists `harness-engineering`, `protect-data`, and `verify-browser-ui`.
- Confirmed both `harness-engineering` copies have matching length and matching write timestamp after the recent patch.

## Remaining risks

- Session-level skill discovery behavior is inferred from the current environment instructions that enumerate available skills for this session, not from a separate runtime API.
