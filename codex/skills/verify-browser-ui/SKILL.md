---
name: verify-browser-ui
description: "Standardize desktop-first browser-based UX verification on Windows. Use when Codex should open a page itself, verify desktop and mobile layouts, click through real navigation, confirm screen transitions, exercise edit and drag interactions, inspect screenshots with `view_image`, and report concrete UI or UX failures on local dev servers, localhost URLs, preview builds, and step-by-step browser QA."
---

# Verify Browser UI

## Overview

Use this skill as the default workflow for desktop-first browser QA when Codex must verify actual user behavior from real screenshots and browser state, not assume the UI is correct from code alone.

Treat it as user-journey verification. The goal is to confirm that a user can enter the screen, move to the next screen, interact with edit surfaces, drag or reorder when applicable, dismiss overlays, use history, and still see a stable layout.

## Default Behavior

- Act autonomously by default. Do not pause for approval between ordinary browser steps.
- Ask the user only when one of these blockers applies: login is required, permissions block access, the target URL is still unknown after local discovery, or the expected state is ambiguous enough that visual findings would be guesswork.
- Prefer a headed browser so the visual state matches what you are verifying.
- Treat desktop verification as the primary signoff surface. Use mobile verification as a secondary confirmation pass.
- Before interacting, identify the 1-3 highest-value flows in scope: navigation, edit or create, drag or reorder, dialog or drawer, and return path.
- Treat a click as verified only when the expected postcondition is visible: route or screen change, modal or drawer open, selection or focus change, value update, toast, row move, or another visible state transition.
- Prefer real user interactions over passive inspection. Use `click`, `dblclick`, `hover`, `fill`, `type`, `select`, `check`, `uncheck`, `mousewheel`, `drag`, `go-back`, `go-forward`, and dialog commands when the flow calls for them.
- For edit or save verification, prefer reversible or dummy changes. If an interaction would write destructive or external data, stop and ask first.
- Prefer a minimized window only when the browser state remains observable and the captures stay reliable. If minimizing is unstable or interferes with inspection, switch to the compact fallback window state instead of guessing.
- Save artifacts under `output/browser-check/<session>/` inside the current repo while the workflow is running, then remove screenshots, logs, traces, and the session folder before finishing unless the user explicitly asks to keep them.
- After every meaningful state change, capture a screenshot, inspect it with `view_image`, and use `snapshot`, history commands, or console output when screenshots alone are not enough to prove the interaction result.

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
5. Capture the initial desktop baseline at `1440x900`, then run `snapshot` to map interactive refs.
6. Exercise the highest-value flows end-to-end. Prefer navigation to another screen, an edit or input flow, a dialog or drawer flow, a drag or reorder flow, and a return path if the UI supports them.
7. After each interaction, verify the visible postcondition instead of assuming the command succeeded.
8. Run the additional desktop baseline passes in this order: `1280x800`, `1024x768`. Re-check the highest-risk control or flow fragment at each width.
9. Run the desktop resize sweep in this order: `1440 -> 1366 -> 1280 -> 1152 -> 1024 -> 1152 -> 1280 -> 1440`.
10. Run the window state checks in this order: `maximize -> restore -> minimize attempt -> restore or compact fallback`.
11. Run the mobile confirmation pass at `390x844`, then reopen any crucial menu, drawer, or navigation path that only appears on narrow widths.
12. Run `snapshot` before using any element ref and again after navigation or any substantial DOM change.
13. After each state worth checking, run `screenshot`, rename the newest file to an ordered descriptive name such as `01-desktop-home.png`, `02-nav-target.png`, or `08-mobile-menu.png`, and inspect that image with `view_image`.
14. Report concrete observations: overlap, clipping, missing assets, wrong copy, broken spacing, failed route changes, edit-state regressions, drag failures, scroll traps, modal dismissal problems, resize instability, or successful rendering.
15. Remove the session folder before finishing unless the user explicitly asked to keep artifacts.

If the CLI prints only a filename, resolve it against the current working directory before calling `view_image`.
If the screenshot path is unclear, run `Invoke-SkillScript $SessionTools latest-shot -Path $ArtifactDir` and inspect that file.

## Inspection Rules

- Treat screenshots as the source of truth for visual claims.
- Describe only what is visible or directly inferable from the screenshot.
- Use `snapshot`, history commands, and browser state when screenshots alone are not enough to prove the interaction result, such as route changes, field values, dialogs, focus changes, tab switches, or restored history state.
- Compare consecutive screenshots when checking whether an interaction changed the UI as expected.
- Fail the flow if an interaction appears to fire but the expected screen, modal, value, movement, or navigation result never materializes.
- Treat desktop screenshots as the primary basis for pass or fail. Use mobile screenshots to confirm there is no secondary layout breakage that contradicts the desktop signoff.
- Prefer short factual findings over design commentary.
- Report findings first. Include: `Validated states and flows`, `Findings`, `Repro steps`, `Verified good paths`, and `Unverified or risky areas`.
- When no issue is visible, say so explicitly and mention what was verified.

## Fallbacks

- If a ref is stale or missing, run `snapshot` again instead of guessing.
- If a click lands but the expected destination is unclear, inspect the next snapshot, use `go-back` or `go-forward` if helpful, and verify the route or visible title before concluding anything.
- If Playwright cannot reproduce the current browser state, capture the active browser window with the repo-local or global screenshot flow and inspect that image instead.
- If the page opens blank, clipped, or obviously mis-sized, keep the browser headed and retry after resizing or reopening.
- If minimizing fails, report the failure and continue with `compact`.
- If window control targets the wrong browser, close the session and reopen the page so the Playwright browser is once again the newest headed browser window before retrying.
- If cleanup fails, report the remaining path or paths explicitly instead of claiming the workspace is clean.
- If you need Bash- or macOS/Linux-specific Playwright guidance, open the global `playwright` skill if available. This skill stays Windows-first.

## References

- Open `references/workflows.md` for URL discovery order, safe mutation rules, UX flow planning, ordered desktop and mobile passes, interaction commands, cleanup commands, fallback commands, and prompt examples.
