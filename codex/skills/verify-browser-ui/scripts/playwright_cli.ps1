[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PlaywrightArgs
)

$ErrorActionPreference = "Stop"

$npxCommand = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCommand) {
    Write-Error "npx is required but was not found on PATH."
    exit 1
}

$hasSessionFlag = $false
foreach ($arg in $PlaywrightArgs) {
    if ($arg -eq "--session" -or $arg.StartsWith("--session=")) {
        $hasSessionFlag = $true
        break
    }
}

$commandArgs = @(
    "--yes"
    "--package"
    "@playwright/cli"
    "playwright-cli"
)

if (-not $hasSessionFlag -and $env:PLAYWRIGHT_CLI_SESSION) {
    $commandArgs += @("--session", $env:PLAYWRIGHT_CLI_SESSION)
}

$commandArgs += $PlaywrightArgs

& $npxCommand.Source @commandArgs
exit $LASTEXITCODE