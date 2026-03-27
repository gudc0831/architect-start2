[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("minimize", "maximize", "restore", "compact")]
    [string]$Action
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$null = Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace VerifyBrowserUi {
    public static class NativeMethods {
        [DllImport("user32.dll")]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int X,
            int Y,
            int cx,
            int cy,
            uint uFlags
        );

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsZoomed(IntPtr hWnd);
    }
}
"@

$ShowMinimized = 6
$ShowMaximized = 3
$ShowRestore = 9
$SwpNoZOrder = 0x0004
$SwpShowWindow = 0x0040

function Get-BrowserWindow {
    $preferredNames = @()

    if ($env:PLAYWRIGHT_WINDOW_PROCESS_NAME) {
        $preferredNames += $env:PLAYWRIGHT_WINDOW_PROCESS_NAME
    }

    $preferredNames += @("chrome", "msedge", "firefox", "MiniBrowser", "playwright")

    $candidates = foreach ($name in ($preferredNames | Select-Object -Unique)) {
        Get-Process -Name $name -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) }
    }

    if ($env:PLAYWRIGHT_WINDOW_TITLE_PATTERN) {
        $pattern = $env:PLAYWRIGHT_WINDOW_TITLE_PATTERN
        $candidates = $candidates | Where-Object { $_.MainWindowTitle -like "*$pattern*" }
    }

    $window = $candidates |
        Sort-Object StartTime -Descending |
        Select-Object -First 1

    if (-not $window) {
        throw "Could not find a headed Playwright browser window. Reopen the browser headed and try again."
    }

    return $window
}

function Invoke-ShowWindow {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process,

        [Parameter(Mandatory = $true)]
        [int]$ShowCode
    )

    [VerifyBrowserUi.NativeMethods]::ShowWindowAsync($Process.MainWindowHandle, $ShowCode) | Out-Null
    Start-Sleep -Milliseconds 250
}

$window = Get-BrowserWindow

switch ($Action) {
    "minimize" {
        Invoke-ShowWindow -Process $window -ShowCode $ShowMinimized
        if (-not [VerifyBrowserUi.NativeMethods]::IsIconic($window.MainWindowHandle)) {
            Write-Error ("Minimize failed for process {0} ({1})." -f $window.ProcessName, $window.Id)
            exit 1
        }

        Write-Output ("Minimized {0} ({1})." -f $window.ProcessName, $window.Id)
    }

    "maximize" {
        Invoke-ShowWindow -Process $window -ShowCode $ShowMaximized
        if (-not [VerifyBrowserUi.NativeMethods]::IsZoomed($window.MainWindowHandle)) {
            Write-Error ("Maximize failed for process {0} ({1})." -f $window.ProcessName, $window.Id)
            exit 1
        }

        Write-Output ("Maximized {0} ({1})." -f $window.ProcessName, $window.Id)
    }

    "restore" {
        Invoke-ShowWindow -Process $window -ShowCode $ShowRestore
        if ([VerifyBrowserUi.NativeMethods]::IsIconic($window.MainWindowHandle)) {
            Write-Error ("Restore failed for process {0} ({1})." -f $window.ProcessName, $window.Id)
            exit 1
        }

        Write-Output ("Restored {0} ({1})." -f $window.ProcessName, $window.Id)
    }

    "compact" {
        Invoke-ShowWindow -Process $window -ShowCode $ShowRestore

        $workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
        $width = 560
        $height = [Math]::Min(720, $workArea.Height - 40)
        $x = [Math]::Max($workArea.X, $workArea.Right - $width - 16)
        $y = [Math]::Max($workArea.Y, $workArea.Y + 16)

        $moved = [VerifyBrowserUi.NativeMethods]::SetWindowPos(
            $window.MainWindowHandle,
            [IntPtr]::Zero,
            $x,
            $y,
            $width,
            $height,
            $SwpNoZOrder -bor $SwpShowWindow
        )

        if (-not $moved) {
            Write-Error ("Compact mode failed for process {0} ({1})." -f $window.ProcessName, $window.Id)
            exit 1
        }

        Write-Output ("Compacted {0} ({1}) to {2}x{3} at {4},{5}." -f $window.ProcessName, $window.Id, $width, $height, $x, $y)
    }
}
