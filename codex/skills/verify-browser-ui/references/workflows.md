# Verify Browser UI Workflows

Use this reference when you need a repeatable, desktop-first, screenshot-driven browser QA loop on Windows.

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
      02-desktop-1280-nav-open.png
      03-desktop-1024-after-toggle.png
```

Use ordered names so the review sequence is obvious. Delete the session folder at the end.

## Standard Desktop-First QA Loop

1. Open the target page headed.
2. Try the minimized window state only when it does not interfere with inspection. If minimizing fails or the browser becomes unusable for capture, switch to compact mode.
3. Run the desktop baseline sizes in this order:
   - `1440x900`
   - `1280x800`
   - `1024x768`
4. At each baseline size:
   - run `snapshot`
   - capture a screenshot
   - rename the latest screenshot
   - inspect it with `view_image`
   - click each meaningful visible control in scope at least once
5. Run the desktop resize sweep in this order:
   - `1440`
   - `1366`
   - `1280`
   - `1152`
   - `1024`
   - `1152`
   - `1280`
   - `1440`
6. During the sweep, capture screenshots at:
   - the initial desktop state
   - every baseline width
   - any width where the layout visibly changes
   - every post-interaction state worth reporting
7. Run the window state checks:
   - maximize
   - restore
   - minimize attempt
   - restore if minimize succeeded
   - compact fallback if minimize failed or became impractical
8. Run the mobile confirmation pass at `390x844`.
9. Clean up the session folder before finishing.

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

Additional desktop baselines:

```powershell
Invoke-SkillScript $PwCli resize 1280 800
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "02-desktop-1280.png"

Invoke-SkillScript $PwCli resize 1024 768
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "03-desktop-1024.png"
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

Final cleanup:

```powershell
Invoke-SkillScript $SessionTools cleanup -Path $ArtifactDir
```

If cleanup fails, include the remaining path or paths in the response.

## Interaction Coverage

For each state in scope, exercise real user interactions instead of relying only on snapshots:

- Click each meaningful visible button, link, tab, and toggle at least once.
- Use `hover` when the UI reveals state only on hover.
- Use `dblclick` when the control is explicitly double-click driven.
- If the page exposes a genuine drag interaction, prefer `drag`.
- If `drag` is not enough for the specific interaction, use `mousemove`, `mousedown`, and `mouseup`.
- If no drag target exists, report `Drag target: not applicable`.

Basic interaction examples:

```powershell
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli click e3
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "04-after-click.png"

Invoke-SkillScript $PwCli drag e7 e9
Invoke-SkillScript $PwCli snapshot
Invoke-SkillScript $PwCli screenshot
Invoke-SkillScript $SessionTools rename-latest-shot -Path $ArtifactDir -Name "05-after-drag.png"
```

Fallback drag example:

```powershell
Invoke-SkillScript $PwCli mousemove 420 320
Invoke-SkillScript $PwCli mousedown left
Invoke-SkillScript $PwCli mousemove 720 320
Invoke-SkillScript $PwCli mouseup left
Invoke-SkillScript $PwCli snapshot
```

## Inspection Checklist

Check for:

- clipped text or controls
- overlap after resize
- unstable layout during repeated desktop width changes
- missing or unstyled content
- broken alignment or spacing
- interactions that fail to change the UI
- controls that become unreachable at narrower desktop widths
- drag handles or draggable surfaces that do not move as expected
- mobile-only clipping that contradicts the desktop signoff

When the UI looks correct, say what you validated instead of merely saying "looks fine."

## Findings Format

Report findings first and keep them factual.

- `Validated states`: list desktop baselines, resize sweep, window-state checks, mobile confirmation, and notable interaction states.
- `Findings`: list the visible failures in severity order.
- `Repro steps`: list the shortest reliable steps to reproduce each issue.
- `Verified good paths`: list the important controls or layouts that were explicitly verified without issue.
- `Unverified areas`: list login-blocked or ambiguous areas, or say none.

If drag is not applicable, state `Drag target: not applicable`.

## Failure Handling

- Stale element refs: run `Invoke-SkillScript $PwCli snapshot` again, then retry.
- Wrong browser window targeted by `window_state.ps1`: close the session and reopen the Playwright browser so it is the newest headed browser window before retrying.
- Playwright cannot reach the needed state: switch to the active browser window capture flow if available in the current environment.
- Blank or cropped capture: keep the browser headed, reopen the page, resize if needed, and capture again.
- Minimize fails or breaks inspection: report that and continue with compact mode.
- Cleanup fails: report the remaining path or paths explicitly.

## Prompt Examples

- `Use $verify-browser-ui to inspect the preview URL desktop-first, run the desktop resize sweep, verify real interactions, and delete the session artifacts before finishing.`
- `Use $verify-browser-ui to open the local app, validate desktop breakpoints plus a mobile confirmation pass, try drag interactions if present, and summarize concrete visual findings.`
