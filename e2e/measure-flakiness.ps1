# Measures pass rate for excluded e2e specs (5 runs each). Writes results to e2e/flakiness-results.txt
$ErrorActionPreference = "Continue"
$specs = @(
  "web-chat-history",
  "web-concurrent-chats",
  "web-offline-recovery",
  "web-error-recovery",
  "web-happy-path",
  "web-preview-refresh"
)
$out = Join-Path $PSScriptRoot "flakiness-results.txt"
"Flakiness measurement $(Get-Date -Format o)" | Out-File $out -Encoding utf8
foreach ($spec in $specs) {
  $pass = 0
  for ($i = 1; $i -le 5; $i++) {
    Write-Host "[$spec] run $i/5..."
    npm run test:e2e:web -- "e2e/$spec.spec.ts" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $pass++ }
  }
  $line = "RESULT $spec : $pass/5"
  Write-Host $line
  $line | Out-File $out -Append -Encoding utf8
}
"Done $(Get-Date -Format o)" | Out-File $out -Append -Encoding utf8
