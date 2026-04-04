# Сканирует указанный каталог LM Studio, находит .gguf и регистрирует каждый в Ollama через `ollama create`.
param(
    [string]$LmStudioHome = 'D:\lmstudio-home',
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

$ggufFiles = Get-ChildItem -LiteralPath $LmStudioHome -Recurse -Filter '*.gguf' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike 'mmproj-*' }

if (-not $ggufFiles -or $ggufFiles.Count -eq 0) {
    Write-Host "No .gguf files found in $LmStudioHome" -ForegroundColor Red
    exit 1
}

Write-Host "Found $($ggufFiles.Count) model files" -ForegroundColor Cyan
Write-Host ''

$usedNames = @{}
$ok = 0
$fail = 0

foreach ($file in $ggufFiles) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $name = $base.ToLowerInvariant() -replace '[^a-z0-9._-]', '-' -replace '-+', '-' -replace '^-|-$', ''
    if (-not $name) { $name = 'imported' }

    $original = $name
    $n = 2
    while ($usedNames.ContainsKey($name)) {
        $name = $original + '-' + $n
        $n++
    }
    $usedNames[$name] = $true

    $ggufPath = $file.FullName -replace '\\', '/'

    if ($DryRun) {
        Write-Host "  SKIP $name" -ForegroundColor Yellow -NoNewline
        Write-Host "  <-  $($file.FullName)"
        continue
    }

    $modelfilePath = Join-Path $env:TEMP ('mf-' + $name + '.txt')
    Set-Content -LiteralPath $modelfilePath -Value "FROM $ggufPath" -Encoding utf8

    Write-Host "  Creating: $name ... " -NoNewline
    $output = & ollama create $name -f $modelfilePath 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'OK' -ForegroundColor Green
        $ok++
    } else {
        Write-Host 'FAIL' -ForegroundColor Red
        Write-Host "    $output" -ForegroundColor DarkRed
        $fail++
    }
    Remove-Item -LiteralPath $modelfilePath -ErrorAction SilentlyContinue
}

Write-Host ''
if (-not $DryRun) {
    Write-Host "Done: $ok OK, $fail failed" -ForegroundColor Cyan
    Write-Host ''
    & ollama list
}
