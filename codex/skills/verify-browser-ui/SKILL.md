---
name: verify-browser-ui
description: "Standardize desktop-first browser-based visual verification on Windows. Use when Codex should open a page itself, verify desktop and mobile layouts, run repeated desktop resize checks, click and drag through real user interactions, inspect screenshots with `view_image`, and report concrete UI issues such as layout problems, clipped content, missing styles, copy defects, interaction regressions, or resize instability on local dev servers, localhost URLs, preview builds, and step-by-step browser QA."
---

# Verify Browser UI

## Overview

Use this skill as the default workflow for desktop-first browser QA that Codex should verify by looking at real screenshots, not by assuming the UI is correct from code alone.

## Default Behavior

- Act autonomously by default. Do not pause for approval between ordinary browser steps.
- Ask the user only when one of these blockers applies: login is required, permissions block access, the target URL is still unknown after local discovery, or the expected state is ambiguous enough that visual findings would be guesswork.
- Prefer a headed browser so the visual state matches what you are verifying.
- Treat desktop verification as the primary signoff surface. Use mobile verification as a secondary confirmation pass.
- Prefer a minimized window only when the browser state remains observable and the captures stay reliable. If minimizing is unstable or interferes with inspection, switch to the compact fallback window state instead of guessing.
- Save artifacts under `output/browser-check/<session>/` inside the current repo while the workflow is running, then remove screenshots, logs, traces, and the session folder before finishing unless the user explicitly asks to keep them.
- After every meaningful state change, capture a screenshot, inspect it with `view_image`, and report what is visibly true.

## Windows Quick Start

Set the Windows helper paths once per task:

```powershell
if (-not $env:CODEX_HOME) {
  $env:CODEX_HOME = Join-Path $HOME ".codex"
}
$SkillRoot = Join-Path $env:CODEX_HOME "skills\\verify-browser-ui"
$PwCli = Join-Path $SkillRoot "scripts\\playwright_cli.ps1"
$SessionTools = Join-Path $SkillRoot "scripts\\session_tools.ps1"
$WindowState = Join-Path $SkillRoot "scripts\\window_state.ps1"

function Invoke-SkillScript {
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ScriptPath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
  )

  powershell -ExecutionPolicy Bypass -File $ScriptPath @ScriptArgs
}
```

Confirm the prerequisite:

```powershell
npx --version
```

If `npx` is missing, stop and ask the user to install Node.js/npm first.

Create the session folder:

```powershell
$ArtifactDir = Invoke-SkillScript $SessionTools new
Set-Location $ArtifactDir
```

## Standard Verification Loop

1. Resolve the target URL by following `references/workflows.md`.
2. Create a session folder under `output/browser-check/<session>/` and run browser commands from there.
3. Open the page in headed mode.
4. If minimizing is likely to help and does not break inspection, try `Invoke-SkillScript $WindowState -Action minimize`. If that fails or hurts capture quality, use `Invoke-SkillScript $WindowState -Action compact`.
5. Run the desktop baseline passes in this order: `1440x900`, `1280x800`, `1024x768`.
6. Run the desktop resize sweep in this order: `1440 -> 1366 -> 1280 -> 1152 -> 1024 -> 1152 -> 1280 -> 1440`.
7. Run the window state checks in this order: `maximize -> restore -> minimize attempt -> restore or compact fallback`.
8. Run the mobile confirmation pass at `390x844`.
9. Run `snapshot` before using any element ref and again after navigation or any substantial DOM change.
10. Click each meaningful visible button, link, tab, or toggle that is in scope at least once. If the UI exposes a genuine drag interaction, use a real drag attempt. If no drag target exists, report `Drag target: not applicable` instead of treating that as a failure.
11. After each state worth checking, run `screenshot`, rename the newest file to an ordered descriptive name such as `01-desktop-home.png`, `02-after-click.png`, or `07-mobile-menu.png`, and inspect that image with `view_image`.
12. Report concrete observations: overlap, clipping, missing assets, wrong copy, broken spacing, disabled controls, unexpected empty states, resize instability, interaction regressions, or successful rendering.
13. Remove the session folder before finishing unless the user explicitly asked to keep artifacts.

Minimal loop:

```powershell
Invoke-SkillScript $PwCli open http://127.0.0.1:3000 --headed
Invoke-SkillScript $PwCli resize 1440 900
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "01-desktop-home.png"
Invoke-SkillScript $PwCli click e3
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "02-after-click.png"
Invoke-SkillScript $PwCli resize 390 844
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "03-mobile.png"
Invoke-SkillScript $SessionTools cleanup -Path $ArtifactDir
```

If the CLI prints only a filename, resolve it against the current working directory before calling `view_image`.
If the screenshot path is unclear, run `Invoke-SkillScript $SessionTools latest-shot -Path $ArtifactDir` and inspect that file.

## Inspection Rules

- Treat screenshots as the source of truth for visual claims.
- Describe only what is visible or directly inferable from the screenshot.
- Compare consecutive screenshots when checking whether an interaction changed the UI as expected.
- Treat desktop screenshots as the primary basis for pass or fail. Use mobile screenshots to confirm there is no secondary layout breakage that contradicts the desktop signoff.
- Prefer short factual findings over design commentary.
- Report findings first. Include: `Validated states`, `Findings`, `Repro steps`, `Verified good paths`, and `Unverified areas`.
- When no issue is visible, say so explicitly and mention what was verified.

## Fallbacks

- If a ref is stale or missing, run `snapshot` again instead of guessing.
- If Playwright cannot reproduce the current browser state, capture the active browser window with the repo-local or global screenshot flow and inspect that image instead.
- If the page opens blank, clipped, or obviously mis-sized, keep the browser headed and retry after resizing or reopening.
- If minimizing fails, report the failure and continue with `compact`.
- If window control targets the wrong browser, close the session and reopen the page so the Playwright browser is once again the newest headed browser window before retrying.
- If cleanup fails, report the remaining path or paths explicitly instead of claiming the workspace is clean.
- If you need Bash- or macOS/Linux-specific Playwright guidance, open the global `playwright` skill if available. This skill stays Windows-first.

## References

- Open `references/workflows.md` for URL discovery order, ordered desktop and mobile passes, resize sweep commands, interaction coverage, cleanup commands, fallback commands, and prompt examples.
