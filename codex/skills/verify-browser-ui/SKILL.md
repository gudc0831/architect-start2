---
name: verify-browser-ui
description: "Standardize browser-based visual verification on Windows. Use when Codex should open a page itself, step through interactions, take screenshots, inspect them with `view_image`, and report concrete UI issues such as layout problems, clipped content, missing styles, copy defects, or regressions, especially for local dev servers, localhost URLs, preview builds, and step-by-step browser QA."
---

# Verify Browser UI

## Overview

Use this skill as the default workflow for browser QA that Codex should verify by looking at real screenshots, not by assuming the UI is correct from code alone.

## Default Behavior

- Act autonomously by default. Do not pause for approval between ordinary browser steps.
- Ask the user only when one of these blockers applies: login is required, permissions block access, the target URL is still unknown after local discovery, or the expected state is ambiguous enough that visual findings would be guesswork.
- Prefer a headed browser so the visual state matches what you are verifying.
- Save artifacts under `output/browser-check/<session>/` inside the current repo.
- After every meaningful state change, capture a screenshot, inspect it with `view_image`, and report what is visibly true.

## Windows Quick Start

Set the Windows wrapper once per task:

```powershell
if (-not $env:CODEX_HOME) {
  $env:CODEX_HOME = Join-Path $HOME ".codex"
}
$SkillRoot = Join-Path $env:CODEX_HOME "skills\\verify-browser-ui"
$PwCli = Join-Path $SkillRoot "scripts\\playwright_cli.ps1"
```

Confirm the prerequisite:

```powershell
npx --version
```

If `npx` is missing, stop and ask the user to install Node.js/npm first.

## Standard Verification Loop

1. Resolve the target URL by following `references/workflows.md`.
2. Create a session folder under `output/browser-check/<session>/` and run browser commands from there.
3. Open the page in headed mode.
4. Run `snapshot` before using any element ref.
5. Interact with the page one step at a time. Re-run `snapshot` after navigation or any substantial DOM change.
6. After each state worth checking, run `screenshot`, rename the new file to the next ordered name such as `01-home.png`, `02-after-login.png`, or `03-modal-open.png`, and inspect that image with `view_image`.
7. Report concrete observations: overlap, clipping, missing assets, wrong copy, broken spacing, disabled controls, unexpected empty states, or successful rendering.

Minimal loop:

```powershell
& $PwCli open http://127.0.0.1:3000 --headed
& $PwCli snapshot
& $PwCli screenshot
& $PwCli click e3
& $PwCli snapshot
& $PwCli screenshot
```

If the CLI prints only a filename, resolve it against the current working directory before calling `view_image`.
If the screenshot path is unclear, list the newest `.png` in the artifact folder and inspect that file.

## Inspection Rules

- Treat screenshots as the source of truth for visual claims.
- Describe only what is visible or directly inferable from the screenshot.
- Compare consecutive screenshots when checking whether an interaction changed the UI as expected.
- Prefer short factual findings over design commentary.
- When no issue is visible, say so explicitly and mention what was verified.

## Fallbacks

- If a ref is stale or missing, run `snapshot` again instead of guessing.
- If Playwright cannot reproduce the current browser state, capture the active browser window with the repo-local or global screenshot flow and inspect that image instead.
- If the page opens blank, clipped, or obviously mis-sized, keep the browser headed and retry after resizing or reopening.
- If you need Bash- or macOS/Linux-specific Playwright guidance, open the global `playwright` skill if available. This skill stays Windows-first.

## References

- Open `references/workflows.md` for URL discovery order, artifact naming, fallback commands, and prompt examples.