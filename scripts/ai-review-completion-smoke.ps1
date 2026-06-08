param(
  [string]$Origin = "http://localhost:3000",
  [string]$Cookie = $env:ARCHITECT_SMOKE_COOKIE,
  [string]$WorkType = $env:ARCHITECT_SMOKE_WORK_TYPE,
  [string]$Question = "AI review completion smoke: task sync, legal evidence, and WIKI candidate boundary",
  [switch]$Cleanup
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param([string]$Path, [string]$Method = "GET", [object]$Body = $null)

  $bodyJson = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 30 -Compress } else { $null }
  $responseBodyPath = [System.IO.Path]::GetTempFileName()
  $requestBodyPath = if ($null -ne $bodyJson) { [System.IO.Path]::GetTempFileName() } else { $null }
  if ($requestBodyPath) {
    Set-Content -LiteralPath $requestBodyPath -Value $bodyJson -Encoding UTF8
  }
  $curlArgs = @(
    "-sS",
    "-o", $responseBodyPath,
    "-w", "%{http_code}",
    "-X", $Method,
    "-H", "Accept: application/json"
  )
  if ($Cookie) {
    $curlArgs += @("-H", "Cookie: $Cookie")
  }
  if ($Method -ne "GET") {
    $curlArgs += @("-H", "Origin: $Origin")
  }
  if ($null -ne $bodyJson) {
    $curlArgs += @("-H", "Content-Type: application/json", "--data-binary", "@$requestBodyPath")
  }
  $curlArgs += "$Origin$Path"

  $statusText = & curl.exe @curlArgs
  $curlExit = $LASTEXITCODE
  $contentText = if (Test-Path $responseBodyPath) { Get-Content -Raw -Encoding UTF8 -LiteralPath $responseBodyPath } else { "" }
  Remove-Item -LiteralPath $responseBodyPath -Force -ErrorAction SilentlyContinue
  if ($requestBodyPath) {
    Remove-Item -LiteralPath $requestBodyPath -Force -ErrorAction SilentlyContinue
  }
  if ($curlExit -ne 0) {
    throw "curl request failed for $Method $Path with exit code $curlExit"
  }
  $json = try {
    if ($contentText) { $contentText | ConvertFrom-Json } else { $null }
  } catch {
    $null
  }

  return [pscustomobject]@{ StatusCode = [int]$statusText; Json = $json; Text = $contentText }
}

function Assert-Status {
  param([string]$Label, [object]$Response, [int[]]$Expected)
  if ($Response.StatusCode -notin $Expected) {
    throw "$Label expected HTTP $($Expected -join '/'), got $($Response.StatusCode): $($Response.Text)"
  }
}

function Get-Data {
  param([object]$Response)
  if ($null -eq $Response.Json) { return $null }
  return $Response.Json.data
}

function ConvertTo-ItemArray {
  param([object]$Value)
  if ($null -eq $Value) {
    return @()
  }
  if ($Value -is [System.Array]) {
    return @($Value)
  }
  return @($Value)
}

function Find-Task {
  param([object]$Tasks, [string]$TaskId)
  return @(ConvertTo-ItemArray $Tasks | Where-Object { $_.id -eq $TaskId } | Select-Object -First 1)[0]
}

function Read-TaskTitle {
  param([object]$Task)
  if ($Task.PSObject.Properties.Name -contains "issueTitle") {
    return [string]$Task.issueTitle
  }
  if ($Task.PSObject.Properties.Name -contains "title") {
    return [string]$Task.title
  }
  return ""
}

function Read-TaskNote {
  param([object]$Task)
  if ($Task.PSObject.Properties.Name -contains "issueDetailNote") {
    return [string]$Task.issueDetailNote
  }
  if ($Task.PSObject.Properties.Name -contains "description") {
    return [string]$Task.description
  }
  return ""
}

function Read-TaskWithRetry {
  param([string]$TaskId, [string]$ExpectedNote = "")

  for ($attempt = 1; $attempt -le 15; $attempt += 1) {
    $response = Invoke-Json -Path "/api/tasks"
    Assert-Status -Label "tasks readback attempt $attempt" -Response $response -Expected @(200)
    $task = Find-Task -Tasks (Get-Data $response) -TaskId $TaskId
    if ($task -and (-not $ExpectedNote -or (Read-TaskNote -Task $task) -eq $ExpectedNote)) {
      return $task
    }
    Start-Sleep -Milliseconds 1000
  }

  return $null
}

function New-SmokeTask {
  param([int]$Index, [string]$Stamp, [string]$ResolvedWorkType)
  $title = "AI review completion smoke $Stamp row $Index"
  $create = Invoke-Json -Path "/api/tasks" -Method "POST" -Body @{
    workType = $ResolvedWorkType
    issueTitle = $title
    issueDetailNote = "completion smoke create row $Index"
    isDaily = $true
    status = "todo"
  }
  Assert-Status -Label "task create $Index" -Response $create -Expected @(201)
  $task = Get-Data $create
  if (-not $task.id) { throw "created task $Index id missing" }

  return [pscustomobject]@{
    id = [string]$task.id
    title = $title
  }
}

$auth = Invoke-Json -Path "/api/auth/me"
Assert-Status -Label "auth" -Response $auth -Expected @(200)

$initialTasksResponse = Invoke-Json -Path "/api/tasks"
Assert-Status -Label "initial tasks" -Response $initialTasksResponse -Expected @(200)
$initialTasks = @(Get-Data $initialTasksResponse)
$resolvedWorkType = if ($WorkType) {
  $WorkType
} else {
  $first = @($initialTasks | Where-Object { $_.workType } | Select-Object -First 1)[0]
  if ($first -and $first.workType) { $first.workType } else { "coordination" }
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$createdTasks = @(1..3 | ForEach-Object { New-SmokeTask -Index $_ -Stamp $stamp -ResolvedWorkType $resolvedWorkType })
$taskId = [string]$createdTasks[0].id
foreach ($createdTask in $createdTasks) {
  $serverCreated = Read-TaskWithRetry -TaskId $createdTask.id
  if (-not $serverCreated -or (Read-TaskTitle -Task $serverCreated) -ne $createdTask.title) {
    throw "created task $($createdTask.id) was not visible from server readback"
  }
}

$editProof = @()
for ($index = 1; $index -le 3; $index += 1) {
  $currentTaskId = [string]$createdTasks[$index - 1].id
  $current = Read-TaskWithRetry -TaskId $currentTaskId
  if (-not $current) {
    throw "task edit $index target missing from create readback"
  }
  $note = "completion smoke edit $index $stamp"
  $patch = Invoke-Json -Path "/api/tasks/$([uri]::EscapeDataString($currentTaskId))" -Method "PATCH" -Body @{
    version = $current.version
    issueDetailNote = $note
  }
  Assert-Status -Label "task edit $index" -Response $patch -Expected @(200)
  $patched = Get-Data $patch
  if ((Read-TaskNote -Task $patched) -ne $note) {
    throw "task edit $index response did not contain updated note"
  }

  $current = Read-TaskWithRetry -TaskId $currentTaskId -ExpectedNote $note
  if (-not $current -or (Read-TaskNote -Task $current) -ne $note) {
    throw "task edit $index was not visible from server readback"
  }
  $editProof += [pscustomobject]@{
    index = $index
    taskId = $currentTaskId
    version = $current.version
    serverReadback = $true
  }
}

$retrieve = Invoke-Json -Path "/api/assistant/retrieve" -Method "POST" -Body @{
  taskId = $taskId
  question = $Question
}
Assert-Status -Label "assistant retrieve" -Response $retrieve -Expected @(200)
$retrieval = Get-Data $retrieve

$taskReview = Invoke-Json -Path "/api/assistant/task-review" -Method "POST" -Body @{
  taskId = $taskId
  question = $Question
  mode = "preview"
}
Assert-Status -Label "task-review preview" -Response $taskReview -Expected @(200)
$reviewData = Get-Data $taskReview
if (-not $reviewData -or -not $reviewData.wiki) {
  throw "task-review preview response did not include WIKI boundary metadata"
}
if ($reviewData.wiki.approvalAttempted -ne $false -or $reviewData.wiki.candidateCreated -ne $false) {
  throw "task-review preview must not create or approve WIKI candidates"
}

$record = Invoke-Json -Path "/api/assistant/records" -Method "POST" -Body @{
  taskId = $taskId
  question = $Question
  answer = "Synthetic completion smoke record for candidate-queue verification. Browser GPT/native bridge execution must be verified separately in the runbook."
  evidence = @($reviewData.evidence)
  confidenceScore = 72
  confidenceReason = "Completion smoke verifies the saved assistant record enters the WIKI candidate queue."
  executionMode = "local-chatgpt-codex"
  runtimeMode = "extension-native-bridge-in-page"
  draftSummary = @{
    conclusion = "Completion smoke record created."
    tags = @("completion-smoke", "ai-review")
    scope = $taskId
    followUpAction = "Review this candidate before WIKI approval."
  }
}
Assert-Status -Label "assistant record save" -Response $record -Expected @(201)
$savedRecord = Get-Data $record
if ($savedRecord.candidateState -ne "candidate") {
  throw "saved assistant record expected WIKI candidate state candidate, got $($savedRecord.candidateState)"
}

$candidateCheck = "record-candidate-state"
$adminCandidates = Invoke-Json -Path "/api/admin/knowledge/candidates"
if ($adminCandidates.StatusCode -eq 200) {
  $candidate = @((Get-Data $adminCandidates) | Where-Object { $_.id -eq $savedRecord.id } | Select-Object -First 1)[0]
  if (-not $candidate -or $candidate.state -ne "candidate") {
    throw "saved assistant record was not visible in admin WIKI candidate queue"
  }
  $candidateCheck = "admin-candidate-queue"
} elseif ($adminCandidates.StatusCode -notin @(401, 403)) {
  throw "admin candidate check expected 200/401/403, got $($adminCandidates.StatusCode)"
}

if ($Cleanup) {
  foreach ($createdTask in $createdTasks) {
    $cleanupTaskId = [string]$createdTask.id
    $trash = Invoke-Json -Path "/api/tasks/$([uri]::EscapeDataString($cleanupTaskId))/trash" -Method "POST"
    if ($trash.StatusCode -notin @(200, 404)) {
      throw "cleanup trash expected 200/404, got $($trash.StatusCode)"
    }
    $delete = Invoke-Json -Path "/api/tasks/$([uri]::EscapeDataString($cleanupTaskId))" -Method "DELETE"
    if ($delete.StatusCode -notin @(200, 204, 404)) {
      throw "cleanup delete expected 200/204/404, got $($delete.StatusCode)"
    }
  }
}

[pscustomobject]@{
  status = "passed"
  origin = $Origin
  taskId = $taskId
  createdTaskIds = @($createdTasks | ForEach-Object { $_.id })
  auth = $auth.StatusCode
  createVisibleOnServerReadback = $true
  editProof = $editProof
  retrieveEvidenceCount = @($retrieval.evidence).Count
  projectContextChunkCount = @($retrieval.projectContextChunks).Count
  readinessWarningCount = @($retrieval.evidenceReadinessWarnings).Count
  taskReviewStatusCode = $taskReview.StatusCode
  taskReviewPreviewWikiApprovalAttempted = if ($reviewData -and $reviewData.wiki) { $reviewData.wiki.approvalAttempted } else { $null }
  taskReviewPreviewCandidateCreated = if ($reviewData -and $reviewData.wiki) { $reviewData.wiki.candidateCreated } else { $null }
  savedAssistantRecordId = $savedRecord.id
  savedAssistantExecutionMode = $savedRecord.executionMode
  savedAssistantRuntimeMode = $savedRecord.runtimeMode
  savedAssistantRecordIsSynthetic = $true
  wikiCandidateState = $savedRecord.candidateState
  wikiCandidateCheck = $candidateCheck
  cleanup = [bool]$Cleanup
} | ConvertTo-Json -Depth 12
