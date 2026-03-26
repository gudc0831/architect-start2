[CmdletBinding()]
param(
    [string[]]$SkillName,
    [switch]$List,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot "codex\skills"

if (-not (Test-Path $sourceRoot)) {
    Write-Error "Project skill source folder was not found: $sourceRoot"
    exit 1
}

$availableSkills = Get-ChildItem -Path $sourceRoot -Directory | Sort-Object Name

if ($List) {
    $availableSkills | ForEach-Object { Write-Output $_.Name }
    exit 0
}

if (-not $env:CODEX_HOME) {
    $env:CODEX_HOME = Join-Path $HOME ".codex"
}

$targetRoot = Join-Path $env:CODEX_HOME "skills"
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

$selectedSkills = if ($SkillName -and $SkillName.Count -gt 0) {
    foreach ($name in $SkillName) {
        $match = $availableSkills | Where-Object Name -eq $name
        if (-not $match) {
            Write-Error "Unknown project skill: $name"
            exit 1
        }
        $match
    }
} else {
    $availableSkills
}

foreach ($skill in $selectedSkills) {
    $destination = Join-Path $targetRoot $skill.Name
    if ($DryRun) {
        Write-Output "DRY-RUN $($skill.FullName) -> $destination"
        continue
    }

    if (Test-Path $destination) {
        Remove-Item -Path $destination -Recurse -Force
    }

    Copy-Item -Path $skill.FullName -Destination $destination -Recurse -Force
    Write-Output "Synced $($skill.Name) -> $destination"
}

exit 0