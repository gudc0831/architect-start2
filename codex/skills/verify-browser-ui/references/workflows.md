# Verify Browser UI Workflows

Use this reference when you need a repeatable, screenshot-driven browser QA loop on Windows.

## URL Discovery Order

Resolve the target URL in this order and stop as soon as one source is reliable:

1. Use the URL the user already gave you.
2. Check the current terminal output for a running dev server URL.
3. Check likely local log files such as `.dev.log`, `.local-test.out.log`, or similar repo-local server logs.
4. Inspect `package.json` for the standard `dev` script and infer the default local URL only if the framework makes it obvious.
5. Ask the user only when the URL is still ambiguous.

If you need to start a local server, use the repo's existing dev command instead of inventing one.

## Standard Artifact Layout

Always keep captures in the repo:

```text
output/
  browser-check/
    20260317-143000-home/
      01-home.png
      02-after-click.png
      03-modal-open.png
```

Use an ordered prefix so the review sequence is obvious.

## Windows Setup

```powershell
if (-not $env:CODEX_HOME) {
  $env:CODEX_HOME = Join-Path $HOME ".codex"
}
$SkillRoot = Join-Path $env:CODEX_HOME "skills\\verify-browser-ui"
$PwCli = Join-Path $SkillRoot "scripts\\playwright_cli.ps1"
$Session = Get-Date -Format "yyyyMMdd-HHmmss"
$ArtifactDir = Join-Path (Get-Location) "output\\browser-check\\$Session"
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
Set-Location $ArtifactDir
```

## Step-by-Step QA Loop

1. Open the page headed.

```powershell
& $PwCli open http://127.0.0.1:3000 --headed
```

2. Snapshot before interacting.

```powershell
& $PwCli snapshot
```

3. Capture the initial state.

```powershell
& $PwCli screenshot
Rename-Item (Get-ChildItem *.png | Sort-Object LastWriteTime | Select-Object -Last 1) "01-home.png"
```

4. Inspect the image with `view_image` and write down what is visibly true.
5. Interact with one UI step.

```powershell
& $PwCli click e3
& $PwCli snapshot
& $PwCli screenshot
Rename-Item (Get-ChildItem *.png | Sort-Object LastWriteTime | Select-Object -Last 1) "02-after-click.png"
```

6. Inspect again with `view_image`.
7. Repeat until the requested flow is covered.

Use descriptive names when the state is clear, for example `02-after-login.png` or `03-settings-open.png`.

## Inspection Checklist

Check for:

- missing or unstyled content
- clipped text or controls
- overlapping sections
- broken alignment or spacing
- unexpected empty, error, or loading states
- wrong copy or missing labels
- interactions that fail to change the UI

When the UI looks correct, say what you validated instead of merely saying "looks fine."

## Failure Handling

- Stale element refs: run `& $PwCli snapshot` again, then retry.
- Playwright cannot reach the needed state: switch to the active browser window capture flow if available in the current environment.
- Blank or cropped capture: keep the browser headed, reopen the page, resize if needed, and capture again.
- Login or permission wall: stop and ask the user for credentials, access, or a pre-authenticated path.

## Prompt Examples

Korean:

- `Use $verify-browser-ui to open the local app, click through the onboarding flow, inspect each screenshot yourself, and tell me what looks broken.`
- `Use $verify-browser-ui to verify the localhost login page visually and report any clipped or overlapping UI.`

English:

- `Use $verify-browser-ui to inspect the local dashboard step by step and report visible layout or styling issues.`
- `Use $verify-browser-ui to open the preview URL, capture each major state, inspect the screenshots yourself, and summarize concrete UI findings.`