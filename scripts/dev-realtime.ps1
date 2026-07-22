# Start ws-gateway for local dispatch realtime (run backend separately in another terminal).
# From repo root: npm run dev:realtime
#
# Prerequisites:
#   1. npm run setup:ws-env   (once — syncs JWT + REDIS_URL from backend/.env.local)
#   2. Redis reachable at REDIS_URL
#   3. Restart backend after setup:ws-env so dispatch events publish to Redis

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$wsEnv = Join-Path $root "services\ws-gateway\.env"
if (-not (Test-Path $wsEnv)) {
  Write-Host "Missing services/ws-gateway/.env — running setup:ws-env..." -ForegroundColor Yellow
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\setup-ws-gateway-env.ps1")
}

Write-Host ""
Write-Host "Starting ws-gateway on :4100 (Ctrl+C to stop)..." -ForegroundColor Cyan
Write-Host "Also run in another terminal: npm run dev:backend" -ForegroundColor Cyan
Write-Host "Rider/customer apps need EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000" -ForegroundColor Cyan
Write-Host ""

npm run dev:ws-gateway
