# Project Skills

This repo keeps shared Codex skills under `codex/skills` so the project has a versioned source of truth.

## Current Skills

- `verify-browser-ui`

## Commands

List project skills:

```powershell
npm run codex:skills:list
```

Sync all project skills into `$CODEX_HOME/skills`:

```powershell
npm run codex:skills:sync
```

Sync one skill only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-project-skills.ps1 -SkillName verify-browser-ui
```

## Update Flow

1. Edit the skill under `codex/skills/<skill-name>/`.
2. Validate the skill folder if the skill structure changes.
3. Sync the updated skill into `$CODEX_HOME/skills`.
4. Use the synced skill in the next task or session.

## Adding a New Shared Skill

1. Create `codex/skills/<skill-name>/SKILL.md`.
2. Add any required `agents/`, `references/`, `scripts/`, or `assets/` files.
3. Keep the folder self-contained and versioned in git.
4. Sync it with `npm run codex:skills:sync`.