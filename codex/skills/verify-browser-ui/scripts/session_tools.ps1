[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("new", "rename-latest-shot", "latest-shot", "cleanup")]
    [string]$Command,

    [string]$Root = (Join-Path (Get-Location) "output\browser-check"),

    [string]$Path,

    [string]$Name,

    [string]$Session
)

$ErrorActionPreference = "Stop"

function Resolve-TargetPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Candidate
    )

    $resolved = Resolve-Path -LiteralPath $Candidate -ErrorAction Stop
    return $resolved.Path
}

function Get-LatestShot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $resolvedPath = Resolve-TargetPath -Candidate $DirectoryPath
    $latest = Get-ChildItem -LiteralPath $resolvedPath -File -Filter *.png |
        Sort-Object LastWriteTimeUtc, Name |
        Select-Object -Last 1

    if (-not $latest) {
        throw "No PNG screenshots were found in '$resolvedPath'."
    }

    return $latest.FullName
}

function Assert-SafeCleanupPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $resolvedPath = Resolve-TargetPath -Candidate $DirectoryPath
    $leaf = Split-Path -Leaf $resolvedPath

    if ([string]::IsNullOrWhiteSpace($leaf)) {
        throw "Refusing to clean up an empty path."
    }

    if ($leaf -ieq "browser-check") {
        throw "Refusing to remove the browser-check root. Pass a session directory instead."
    }

    if ($resolvedPath -notmatch "[\\/]browser-check[\\/]") {
        throw "Refusing to clean up '$resolvedPath' because it is outside a browser-check session folder."
    }

    return $resolvedPath
}

switch ($Command) {
    "new" {
        if (-not $Session) {
            $Session = Get-Date -Format "yyyyMMdd-HHmmss"
        }

        $rootPath = [System.IO.Path]::GetFullPath($Root)
        $sessionPath = Join-Path $rootPath $Session
        New-Item -ItemType Directory -Force -Path $sessionPath | Out-Null
        Write-Output $sessionPath
    }

    "latest-shot" {
        if (-not $Path) {
            throw "-Path is required for latest-shot."
        }

        Write-Output (Get-LatestShot -DirectoryPath $Path)
    }

    "rename-latest-shot" {
        if (-not $Path) {
            throw "-Path is required for rename-latest-shot."
        }

        if (-not $Name) {
            throw "-Name is required for rename-latest-shot."
        }

        $resolvedPath = Resolve-TargetPath -Candidate $Path
        $latestShot = Get-LatestShot -DirectoryPath $resolvedPath
        $destination = Join-Path $resolvedPath $Name

        Move-Item -LiteralPath $latestShot -Destination $destination -Force
        Write-Output $destination
    }

    "cleanup" {
        if (-not $Path) {
            throw "-Path is required for cleanup."
        }

        $resolvedPath = Assert-SafeCleanupPath -DirectoryPath $Path
        Remove-Item -LiteralPath $resolvedPath -Recurse -Force -ErrorAction Stop

        if (Test-Path -LiteralPath $resolvedPath) {
            $remaining = Get-ChildItem -LiteralPath $resolvedPath -Recurse -Force -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty FullName
            if (-not $remaining) {
                $remaining = @($resolvedPath)
            }

            Write-Error ("Cleanup failed. Remaining paths: {0}" -f ($remaining -join ", "))
            exit 1
        }

        Write-Output $resolvedPath
    }
}
