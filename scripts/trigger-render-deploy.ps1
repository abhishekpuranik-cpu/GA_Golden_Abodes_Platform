<#
.SYNOPSIS
  Triggers Render deploys via API (no secrets in repo).

.EXAMPLE
  $env:RENDER_API_KEY = '<dashboard_api_key>'
  $env:RENDER_SERVICE_PLATFORM = 'srv-xxxxx'   # ga-golden-abodes-platform
  $env:RENDER_SERVICE_CONSTRUCTION = 'srv-yyyyy'  # constructionanalytics (optional)
  .\scripts\trigger-render-deploy.ps1
#>
param(
  [switch]$PlatformOnly
)

$ErrorActionPreference = 'Stop'
$key = $env:RENDER_API_KEY
if (-not $key) {
  Write-Error 'Set RENDER_API_KEY (Render Dashboard → Account → API Keys).'
}

function Invoke-RenderDeploy([string]$ServiceId) {
  if (-not $ServiceId) { return }
  $uri = "https://api.render.com/v1/services/$ServiceId/deploys"
  $headers = @{
    Authorization = "Bearer $key"
    'Content-Type'  = 'application/json'
  }
  $body = '{}'
  Write-Host "POST deploy: $ServiceId"
  $r = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body
  return $r
}

$sp = $env:RENDER_SERVICE_PLATFORM
if (-not $sp) { $sp = $env:RENDER_SERVICE_GA_GOLDEN_ABODES }
if (-not $sp) { Write-Error 'Set RENDER_SERVICE_PLATFORM to your ga-golden-abodes-platform service id (srv-...).' }

Invoke-RenderDeploy $sp

if (-not $PlatformOnly) {
  $sc = $env:RENDER_SERVICE_CONSTRUCTION
  if (-not $sc) { $sc = $env:RENDER_SERVICE_CONSTRUCTIONANALYTICS }
  if ($sc) { Invoke-RenderDeploy $sc }
  else { Write-Host 'RENDER_SERVICE_CONSTRUCTION not set — skipped second service.' }
}

Write-Host 'Done. Check Render → service → Events for build progress.'
