# Sync ws-gateway + backend Redis env from backend/.env and backend/.env.local
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/setup-ws-gateway-env.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Read-EnvFile($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '^([^=]+)=(.*)$') { return }
    $map[$matches[1].Trim()] = $matches[2].Trim()
  }
  $map
}

$backendEnv = Join-Path $root "backend\.env"
$backendLocal = Join-Path $root "backend\.env.local"
$vars = @{}
foreach ($f in @($backendEnv, $backendLocal)) {
  foreach ($k in (Read-EnvFile $f).Keys) {
    $vars[$k] = (Read-EnvFile $f)[$k]
  }
}

$jwt = $vars["SUPABASE_JWT_SECRET"]
if (-not $jwt) { $jwt = $vars["JWT_SECRET"] }
if (-not $jwt) {
  Write-Host "ERROR: Set SUPABASE_JWT_SECRET in backend/.env or backend/.env.local first." -ForegroundColor Red
  exit 1
}

$redis = $vars["REDIS_URL"]
if (-not $redis) { $redis = "redis://127.0.0.1:6379" }

$wsEnvDir = Join-Path $root "services\ws-gateway"
$wsEnvPath = Join-Path $wsEnvDir ".env"
$lines = @(
  "PORT=4100",
  "JWT_SECRET=$jwt",
  "REDIS_URL=$redis"
)
if ($vars["SUPABASE_JWT_SECRET_PREVIOUS"]) {
  $lines += "JWT_SECRET_PREVIOUS=$($vars['SUPABASE_JWT_SECRET_PREVIOUS'])"
}
$lines | Set-Content $wsEnvPath -Encoding utf8
Write-Host "OK: wrote $wsEnvPath (JWT_SECRET from backend SUPABASE_JWT_SECRET)" -ForegroundColor Green

# Ensure backend has REDIS_URL for publishOrderEvent / dispatch realtime
$needsRedis = $true
if (Test-Path $backendLocal) {
  $localContent = Get-Content $backendLocal -Raw
  if ($localContent -match '(?m)^REDIS_URL=') { $needsRedis = $false }
}
if ($needsRedis) {
  Add-Content -Path $backendLocal -Value "`n# Realtime (ws-gateway pub/sub)`nREDIS_URL=$redis`n"
  Write-Host "OK: appended REDIS_URL to backend/.env.local" -ForegroundColor Green
} else {
  Write-Host "OK: backend/.env.local already has REDIS_URL" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next: start Redis on $redis then: npm run dev:ws-gateway" -ForegroundColor Cyan
