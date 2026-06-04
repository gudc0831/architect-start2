param(
  [string]$Origin = "http://localhost:3000",
  [string]$TaskId = "task_3bogoi8b",
  [string]$Question = "공동주택 단지내 도로 경사도 검토: 주택건설기준 등에 관한 규칙 제6조의2 기준으로 확인"
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param([string]$Path, [string]$Method = "GET", [object]$Body = $null)
  $headers = @{ Accept = "application/json" }
  if ($Method -ne "GET") {
    $headers["Origin"] = $Origin
    $headers["Content-Type"] = "application/json"
  }
  $bodyJson = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 20 } else { $null }
  $request = @{
    Uri = "$Origin$Path"
    Method = $Method
    Headers = $headers
    Body = $bodyJson
    UseBasicParsing = $true
    TimeoutSec = 30
  }
  if ((Get-Command Invoke-WebRequest).Parameters.ContainsKey("SkipHttpErrorCheck")) {
    $request["SkipHttpErrorCheck"] = $true
  }
  try {
    $response = Invoke-WebRequest @request
  } catch {
    if ($null -eq $_.Exception.Response) { throw }
    $response = $_.Exception.Response
    if ($response.Content -and $response.Content.GetType().FullName -eq "System.Net.Http.HttpContent") {
      $response | Add-Member -NotePropertyName Content -NotePropertyValue $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() -Force
    } else {
      $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
      $response | Add-Member -NotePropertyName Content -NotePropertyValue $reader.ReadToEnd() -Force
    }
  }
  $content = try {
    if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
  } catch {
    $null
  }
  return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Json = $content }
}

function Get-CandidateCount {
  $response = Invoke-Json -Path "/api/admin/knowledge/candidates"
  if ($response.StatusCode -eq 200) { return @($response.Json.data).Count }
  return $null
}

$auth = Invoke-Json -Path "/api/auth/me"
if ($auth.StatusCode -ne 200) { throw "auth expected 200, got $($auth.StatusCode)" }
$candidateCountBefore = Get-CandidateCount

$retrieve = Invoke-Json -Path "/api/assistant/retrieve" -Method "POST" -Body @{ taskId = $TaskId; question = $Question }
if ($retrieve.StatusCode -ne 200) { throw "retrieve expected 200, got $($retrieve.StatusCode)" }

$recordsBefore = Invoke-Json -Path "/api/assistant/records?taskId=$TaskId"
if ($recordsBefore.StatusCode -ne 200) { throw "records before expected 200, got $($recordsBefore.StatusCode)" }
$recordCountBefore = @($recordsBefore.Json.data).Count

$review = Invoke-Json -Path "/api/assistant/task-review" -Method "POST" -Body @{ taskId = $TaskId; question = $Question; mode = "preview" }
if ($review.StatusCode -notin @(200, 409)) { throw "task-review expected 200 or 409, got $($review.StatusCode)" }
if ($review.Json.data.wiki.approvalAttempted -ne $false) { throw "task-review must not attempt WIKI approval" }
if ($review.Json.data.wiki.candidateCreated -ne $false) { throw "task-review must not create a WIKI candidate during preview" }

$recordsAfter = Invoke-Json -Path "/api/assistant/records?taskId=$TaskId"
if ($recordsAfter.StatusCode -ne 200) { throw "records after expected 200, got $($recordsAfter.StatusCode)" }
$recordCountAfter = @($recordsAfter.Json.data).Count
if ($recordCountBefore -ne $recordCountAfter) {
  throw "record count changed from $recordCountBefore to $recordCountAfter during preview"
}

$candidateCountAfter = Get-CandidateCount
if ($null -ne $candidateCountBefore -and $null -ne $candidateCountAfter -and $candidateCountBefore -ne $candidateCountAfter) {
  throw "knowledge candidate count changed from $candidateCountBefore to $candidateCountAfter"
}

[pscustomobject]@{
  status = "passed"
  auth = $auth.StatusCode
  retrieveEvidenceCount = @($retrieve.Json.data.evidence).Count
  taskReviewStatusCode = $review.StatusCode
  taskReviewStatus = $review.Json.data.status
  taskReviewLawStatus = $review.Json.data.officialLawVerification.status
  approvalAttempted = $review.Json.data.wiki.approvalAttempted
  candidateCreated = $review.Json.data.wiki.candidateCreated
  recordCountBefore = $recordCountBefore
  recordCountAfter = $recordCountAfter
  candidateCountBefore = $candidateCountBefore
  candidateCountAfter = $candidateCountAfter
  adminCandidateCheck = if ($null -eq $candidateCountBefore -or $null -eq $candidateCountAfter) { "skipped" } else { "checked" }
} | ConvertTo-Json -Depth 8
