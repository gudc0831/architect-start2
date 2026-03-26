param(
  [switch]$Watch
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutputDir = Join-Path $Root 'output/ui-copy'
$BuildOutputRoot = '.next-build'
$CommandResultsPath = Join-Path $OutputDir 'validator-command-results.json'
$ValidatorScript = Join-Path $Root 'scripts/ui-copy-validator.ts'
$ReportScript = Join-Path $Root 'scripts/ui-copy-report.ts'
$WatchTargets = @(
  'src/components',
  'src/app',
  'src/providers',
  'src/lib/ui-copy',
  'src/lib/preview',
  'src/lib/api',
  'src/lib/auth'
)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Set-Location $Root
$PowerShellExecutable = (Get-Command powershell.exe | Select-Object -ExpandProperty Source)
$NodeExecutable = (Get-Command node | Select-Object -ExpandProperty Source)

function ConvertTo-ProcessArguments {
  param([string[]]$Arguments = @())

  return ($Arguments | ForEach-Object {
    if ($null -eq $_) {
      '""'
      return
    }

    if ($_ -notmatch '[\s"]') {
      $_
      return
    }

    '"' + ($_ -replace '(\\*)"', '$1$1\\"' -replace '(\\+)$', '$1$1') + '"'
  }) -join ' '
}

function Get-OutputSummary {
  param([string]$Stdout, [string]$Stderr, [string]$Prefix = '')

  $segments = @()
  if ($Prefix) {
    $segments += $Prefix.Trim()
  }

  $combined = @($Stdout, $Stderr) -join "`n"
  $lines = ($combined -split "`r?`n") | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ -ne '' }
  if ($lines.Count -gt 0) {
    $segments += ($lines | Select-Object -Last 40) -join "`n"
  }

  if ($segments.Count -eq 0) {
    return ''
  }

  return ($segments -join "`n").Trim()
}

function Normalize-NextTypeArtifacts {
  $tsconfigPath = Join-Path $Root 'tsconfig.json'
  if (Test-Path $tsconfigPath) {
    try {
      $tsconfig = Get-Content -Raw $tsconfigPath | ConvertFrom-Json
      if ($tsconfig.include) {
        $normalizedIncludes = New-Object System.Collections.Generic.List[string]
        foreach ($include in $tsconfig.include) {
          if ($include -match '^\.next-build/run-[^/]+/(dev/)?types/\*\*/\*\.ts$') {
            continue
          }
          $includeValue = [string]$include
          if (-not $normalizedIncludes.Contains($includeValue)) {
            [void]$normalizedIncludes.Add($includeValue)
          }
        }

        foreach ($stableInclude in @('.next-build/types/**/*.ts', '.next-build/dev/types/**/*.ts')) {
          if (-not $normalizedIncludes.Contains($stableInclude)) {
            [void]$normalizedIncludes.Add($stableInclude)
          }
        }

        $tsconfig.include = @($normalizedIncludes)
        $tsconfig | ConvertTo-Json -Depth 20 | Set-Content -Path $tsconfigPath -Encoding utf8
      }
    } catch {
      Write-Warning "[ui-copy-validate] failed to normalize tsconfig.json: $($_.Exception.Message)"
    }
  }

  $nextEnvPath = Join-Path $Root 'next-env.d.ts'
  if (Test-Path $nextEnvPath) {
    @(
      '/// <reference types="next" />',
      '/// <reference types="next/image-types/global" />',
      '',
      '// NOTE: This file should not be edited',
      '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.'
    ) | Set-Content -Path $nextEnvPath -Encoding utf8
  }
}

function Invoke-StructuredProcess {
  param(
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [hashtable]$EnvironmentOverrides = @{},
    [string]$SummaryPrefix = ''
  )

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.Arguments = ConvertTo-ProcessArguments -Arguments $Arguments

  foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
    if ($null -eq $entry.Value) {
      [void]$psi.Environment.Remove($entry.Key)
      continue
    }
    $psi.Environment[$entry.Key] = [string]$entry.Value
  }

  try {
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()
  } catch {
    $stopwatch.Stop()
    return [ordered]@{
      ok = $false
      exitCode = 1
      durationMs = [int][Math]::Round($stopwatch.Elapsed.TotalMilliseconds)
      summary = "Failed to start ${FilePath}: $($_.Exception.Message)"
    }
  }

  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $stopwatch.Stop()

  if ($stdout) {
    [Console]::Out.Write($stdout)
  }
  if ($stderr) {
    [Console]::Error.Write($stderr)
  }

  return [ordered]@{
    ok = ($process.ExitCode -eq 0)
    exitCode = $process.ExitCode
    durationMs = [int][Math]::Round($stopwatch.Elapsed.TotalMilliseconds)
    summary = (Get-OutputSummary -Stdout $stdout -Stderr $stderr -Prefix $SummaryPrefix)
  }
}

function Invoke-NpmScript {
  param([string]$ScriptName)

  $environmentOverrides = @{}
  $summaryPrefix = ''
  $commandText = 'npm run ' + $ScriptName + '; exit $LASTEXITCODE'
  if ($ScriptName -eq 'build') {
    $buildRunDir = $BuildOutputRoot + '/run-' + [Guid]::NewGuid().ToString('N')
    $summaryPrefix = "NEXT_DIST_DIR=$buildRunDir"
    $environmentOverrides['NEXT_DIST_DIR'] = $buildRunDir
    $commandText = 'npm run build; exit $LASTEXITCODE'
  }

  return Invoke-StructuredProcess -FilePath $PowerShellExecutable -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandText) -EnvironmentOverrides $environmentOverrides -SummaryPrefix $summaryPrefix
}

function Invoke-NodeScript {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments = @()
  )

  return Invoke-StructuredProcess -FilePath $NodeExecutable -Arguments (@('--experimental-strip-types', $ScriptPath) + $Arguments)
}

function Invoke-UiCopyValidation {
  param([string[]]$ChangedPaths = @())

  $results = [ordered]@{
    typecheck = Invoke-NpmScript 'typecheck'
    lint = Invoke-NpmScript 'lint'
    build = $null
    lastChangedPaths = $ChangedPaths
  }

  if ($results.typecheck.ok -and $results.lint.ok) {
    if ($Watch) {
      Start-Sleep -Seconds 3
    }
    $results.build = Invoke-NpmScript 'build'
    Normalize-NextTypeArtifacts
  }

  $results | ConvertTo-Json -Depth 6 | Set-Content -Path $CommandResultsPath -Encoding utf8

  $validatorArgs = @('--command-results', $CommandResultsPath)
  if ($Watch) {
    $validatorArgs += '--watch'
  }

  $validatorResult = Invoke-NodeScript -ScriptPath $ValidatorScript -Arguments $validatorArgs
  $reportResult = Invoke-NodeScript -ScriptPath $ReportScript

  if (-not $validatorResult.ok) {
    return [int]$validatorResult.exitCode
  }

  if (-not $reportResult.ok) {
    return [int]$reportResult.exitCode
  }

  return 0
}

if (-not $Watch) {
  $exitCode = Invoke-UiCopyValidation
  exit ([int]$exitCode)
}

$watchers = @()
$subscriptions = @()
$pending = New-Object System.Collections.Generic.HashSet[string]
$lastEventAt = Get-Date
$hasPending = $false

foreach ($target in $WatchTargets) {
  $absolute = Join-Path $Root $target
  if (-not (Test-Path $absolute)) {
    continue
  }

  $watcher = New-Object System.IO.FileSystemWatcher $absolute, '*'
  $watcher.IncludeSubdirectories = $true
  $watcher.EnableRaisingEvents = $true
  $watchers += $watcher

  $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier "ui-copy-changed-$target"
  $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier "ui-copy-created-$target"
  $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier "ui-copy-deleted-$target"
  $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier "ui-copy-renamed-$target"
}

try {
  $null = Invoke-UiCopyValidation
  Write-Host '[ui-copy-watch] watching for changes...'

  while ($true) {
    $event = Wait-Event -Timeout 1
    if ($event) {
      $pathValue = $null
      if ($event.SourceEventArgs -and $event.SourceEventArgs.FullPath) {
        $pathValue = $event.SourceEventArgs.FullPath
      }
      if ($pathValue) {
        $relative = [System.IO.Path]::GetRelativePath($Root, $pathValue).Replace('\\', '/')
        $pending.Add($relative) | Out-Null
      }
      $lastEventAt = Get-Date
      $hasPending = $true
      Remove-Event -EventIdentifier $event.EventIdentifier | Out-Null
      continue
    }

    if ($hasPending -and ((Get-Date) - $lastEventAt).TotalSeconds -ge 1) {
      $changed = @($pending)
      $pending.Clear()
      $hasPending = $false
      $null = Invoke-UiCopyValidation -ChangedPaths $changed
    }
  }
} finally {
  foreach ($subscription in $subscriptions) {
    Unregister-Event -SourceIdentifier $subscription.Name -ErrorAction SilentlyContinue
    $subscription | Remove-Job -Force -ErrorAction SilentlyContinue
  }
  foreach ($watcher in $watchers) {
    $watcher.Dispose()
  }
}
