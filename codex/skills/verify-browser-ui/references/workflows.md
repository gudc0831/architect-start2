# Verify Browser UI Workflows

Use this reference when you need a repeatable, desktop-first, screenshot-driven browser QA loop on Windows that verifies user journeys, not just layouts.

## URL Discovery Order

Resolve the target URL in this order and stop as soon as one source is reliable:

1. Use the URL the user already gave you.
2. Check the current terminal output for a running dev server URL.
3. Check likely local log files such as `.dev.log`, `.local-test.out.log`, or similar repo-local server logs.
4. Inspect `package.json` for the standard `dev` script and infer the default local URL only if the framework makes it obvious.
5. Ask the user only when the URL is still ambiguous.

If you need to start a local server, use the repo's existing dev command instead of inventing one.

## Session and Helper Setup

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

$ArtifactDir = Invoke-SkillScript $SessionTools new
Set-Location $ArtifactDir
```

Use the session folder only while verification is in progress. Remove it before finishing unless the user explicitly wants to keep artifacts.

## Artifact Layout While Running

Artifacts live under the repo only during the active verification session:

```text
output/
  browser-check/
    20260327-143000/
      01-desktop-1440-home.png
      02-nav-project-detail.png
      03-edit-drawer-open.png
      04-after-drag.png
```

Use ordered names so the review sequence is obvious. Delete the session folder at the end.

## Safe Mutation Rules

- Prefer local, preview, sandbox, or clearly reversible interactions.
- Prefer filters, search boxes, accordions, toggles, tabs, drawers, modal open-close flows, sort order changes, and disposable draft edits over irreversible writes.
- Stop and ask before actions that would delete data, send messages, trigger payments, modify shared external systems, or save irreversible production data.
- When save is safely in scope, verify both the success state and the return or cancel path.

## UX Flow Planning

Before interacting, map the highest-value flows in scope:

1. Entry screen or baseline state
2. Primary navigation path to another view, tab, drawer, or detail screen
3. Edit, input, or selection flow
4. Drag, reorder, resize, or scroll-dependent flow if present
5. Return path such as close, cancel, go-back, or go-forward

Keep scope to the 1-3 most valuable flows if the app is large. For each step, define the expected postcondition before clicking:

- visible route or title change
- modal or drawer open or closed
- focused field or changed input value
- checked state, selected option, or active tab
- reordered item, dragged panel, or changed layout
- restored prior screen after cancel or history traversal

## Standard Desktop-First QA Loop

1. Open the target page headed.
2. Try the minimized window state only when it does not interfere with inspection. If minimizing fails or the browser becomes unusable for capture, switch to compact mode.
3. Capture the initial desktop baseline at `1440x900`.
4. At the initial baseline:
   - run `snapshot`
   - capture a screenshot
   - rename the latest screenshot
   - inspect it with `view_image`
   - identify the key visible navigation, edit, drag, and overlay targets in scope
5. Verify at least one navigation flow end-to-end:
   - click into another screen, tab, drawer, or detail view
   - confirm the destination really changed
   - capture the result
   - use `go-back` or the UI's own back or close path when it matters
6. Verify at least one edit or input flow if the page has editable UI:
   - use `fill`, `type`, `select`, `check`, or `uncheck`
   - confirm the changed value or state is visible
   - if save is safe, verify the saved state
   - if save is not safe, use cancel or a reversible field and report the limit explicitly
7. Verify any drag, reorder, resize, or scroll-driven flow if present:
   - use `drag` first
   - fall back to mouse events when needed
   - confirm the moved state or newly reachable content is visible
8. Run the additional desktop baseline sizes in this order:
   - `1280x800`
   - `1024x768`
9. At each additional desktop baseline:
   - run `snapshot`
   - capture a screenshot
   - rename the latest screenshot
   - inspect it with `view_image`
   - re-check the most important control or flow fragment that could break at narrower widths
10. Run the desktop resize sweep in this order:
   - `1440`
   - `1366`
   - `1280`
   - `1152`
   - `1024`
   - `1152`
   - `1280`
   - `1440`
11. During the sweep, capture screenshots at:
   - the initial desktop state
   - every baseline width
   - any width where the layout visibly changes
   - every post-interaction state worth reporting
12. Run the window state checks:
   - maximize
   - restore
   - minimize attempt
   - restore if minimize succeeded
   - compact fallback if minimize failed or became impractical
13. Run the mobile confirmation pass at `390x844`, then reopen any crucial mobile-only menu, drawer, or route that matters to the task.
14. Check `console` after suspicious or stateful interactions when the UI appears broken but the screenshot alone is not enough to explain why.
15. Clean up the session folder before finishing.

## Command Sequence

Desktop baseline open:

```powershell
Invoke-SkillScript $PwCli open http://127.0.0.1:3000 --headed
Invoke-SkillScript $WindowState -Action compact
Invoke-SkillScript $PwCli resize 1440 900
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "01-desktop-1440-home.png"
```

Navigation verification:

```powershell
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli click e3
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "02-nav-target.png"

Invoke-SkillScript $PwCli go-back
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "03-after-go-back.png"

Invoke-SkillScript $PwCli go-forward
Invoke-SkillScript $PwCli snapshot
```

Edit verification:

```powershell
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli fill e8 "Codex test"
Invoke-SkillScript $PwCli select e10 "in-progress"
Invoke-SkillScript $PwCli check e11
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "04-edit-state.png"
```

Additional desktop baselines:

```powershell
Invoke-SkillScript $PwCli resize 1280 800
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "05-desktop-1280.png"

Invoke-SkillScript $PwCli resize 1024 768
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "06-desktop-1024.png"
```

Scroll and overlay verification:

```powershell
Invoke-SkillScript $PwCli mousewheel 0 700
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "07-after-scroll.png"
```

Drag verification:

```powershell
Invoke-SkillScript $PwCli drag e7 e9
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "08-after-drag.png"
```

Fallback drag example:

```powershell
Invoke-SkillScript $PwCli mousemove 420 320
Invoke-SkillScript $PwCli mousedown left
Invoke-SkillScript $PwCli mousemove 720 320
Invoke-SkillScript $PwCli mouseup left
Invoke-SkillScript $PwCli snapshot
```

Desktop resize sweep:

```powershell
$SweepWidths = 1440, 1366, 1280, 1152, 1024, 1152, 1280, 1440

foreach ($Width in $SweepWidths) {
  Invoke-SkillScript $PwCli resize $Width 900
  Invoke-SkillScript $PwCli snapshot
}
```

Window state checks:

```powershell
Invoke-SkillScript $WindowState -Action maximize
Invoke-SkillScript $PwCli snapshot

Invoke-SkillScript $WindowState -Action restore
Invoke-SkillScript $PwCli snapshot

try {
  Invoke-SkillScript $WindowState -Action minimize
  Invoke-SkillScript $WindowState -Action restore
} catch {
  Write-Warning "Minimize failed; using compact fallback."
  Invoke-SkillScript $WindowState -Action compact
}

Invoke-SkillScript $PwCli snapshot
```

Mobile confirmation:

```powershell
Invoke-SkillScript $PwCli resize 390 844
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "09-mobile-390.png"
```

Console check:

```powershell
Invoke-SkillScript $PwCli console warn
```

Final cleanup:

```powershell
Invoke-SkillScript $SessionTools cleanup -Path $ArtifactDir
```

If cleanup fails, include the remaining path or paths in the response.

## Interaction Assertions

For each state in scope, exercise real user interactions instead of relying only on snapshots. Treat an interaction as verified only when the expected postcondition is visible or otherwise grounded:

- Navigation: a different screen, route, detail pane, drawer, or active tab becomes visible, and `go-back` or `go-forward` restores the expected prior state when relevant.
- Edit or input: typed or selected values remain visible, focus lands where expected, validation or save feedback appears, or cancel restores the prior state.
- Dialog or overlay: the modal, popover, or drawer appears and can be dismissed without trapping the user.
- Toggle or selection: the checked state, active styling, or selected row changes visibly.
- Drag or reorder: the element position, drop target state, or related content changes visibly.
- Scroll: lower content or previously blocked controls become reachable, and sticky surfaces do not cover the main action.
- Click each meaningful visible button, link, tab, and toggle that is in scope at least once.
- Use `hover` when the UI reveals state only on hover.
- Use `dblclick` when the control is explicitly double-click driven.
- If the page exposes a genuine drag interaction, prefer `drag`.
- If `drag` is not enough for the specific interaction, use `mousemove`, `mousedown`, and `mouseup`.
- If no drag target exists, report `Drag target: not applicable`.

## Inspection Checklist

Check for:

- clipped text or controls
- overlap after resize
- unstable layout during repeated desktop width changes
- missing or unstyled content
- broken alignment or spacing
- clicks that fire but do not move to the expected screen or open the expected UI
- back or close paths that fail to return the user cleanly
- inputs that accept typing but do not display, validate, save, or cancel as expected
- modals, drawers, or menus that open but cannot be dismissed cleanly
- scroll regions or sticky surfaces that hide the primary action
- interactions that fail to change the UI
- controls that become unreachable at narrower desktop widths
- drag handles or draggable surfaces that do not move as expected
- mobile-only clipping that contradicts the desktop signoff
- console errors or visible loading states that appear only after an interaction, when checked

When the UI looks correct, say what you validated instead of merely saying "looks fine."

## Findings Format

Report findings first and keep them factual.

- `Validated states and flows`: list desktop baselines, resize sweep, window-state checks, mobile confirmation, and notable interaction paths.
- `Findings`: list the visible failures in severity order.
- `Repro steps`: list the shortest reliable steps to reproduce each issue.
- `Verified good paths`: list the important controls or layouts that were explicitly verified without issue.
- `Unverified or risky areas`: list login-blocked, destructive, or ambiguous areas, or say none.

If drag is not applicable, state `Drag target: not applicable`.

## Failure Handling

- Stale element refs: run `Invoke-SkillScript $PwCli snapshot` again, then retry.
- Wrong browser window targeted by `window_state.ps1`: close the session and reopen the Playwright browser so it is the newest headed browser window before retrying.
- Click landed but destination is unclear: inspect the next snapshot, check the visible title or panel state, and use `go-back` or `go-forward` before concluding.
- Playwright cannot reach the needed state: switch to the active browser window capture flow if available in the current environment.
- Blank or cropped capture: keep the browser headed, reopen the page, resize if needed, and capture again.
- Minimize fails or breaks inspection: report that and continue with compact mode.
- Cleanup fails: report the remaining path or paths explicitly.

## Prompt Examples

- `Use $verify-browser-ui to inspect the preview URL desktop-first, click through the main navigation, confirm the destination screens really open, verify back and close paths, and delete the session artifacts before finishing.`
- `Use $verify-browser-ui to open the local app, validate desktop breakpoints plus a mobile confirmation pass, test a safe edit flow and drag interaction if present, and summarize concrete visual and UX findings.`
