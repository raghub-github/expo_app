# Install Redis-compatible server on Windows (Memurai) and start service.
# Run PowerShell as Administrator: 
#   powershell -ExecutionPolicy Bypass -File scripts/install-redis-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "Installing Memurai Developer (Redis-compatible, port 6379)..." -ForegroundColor Cyan
winget install --id Memurai.MemuraiDeveloper -e --accept-package-agreements --accept-source-agreements

if ($LASTEXITCODE -ne 0) {
  Write-Host "Install failed or was cancelled. Alternatives:" -ForegroundColor Yellow
  Write-Host "  1. Re-run this script in an Administrator PowerShell window"
  Write-Host "  2. WSL: sudo apt install redis-server && sudo service redis-server start"
  Write-Host "  3. Free cloud: add REDIS_URL to backend/.env.local and services/ws-gateway/.env"
  exit $LASTEXITCODE
}

Start-Sleep -Seconds 3
$svc = Get-Service -Name "Memurai" -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne "Running") { Start-Service Memurai }
  Write-Host "Memurai service: $($svc.Status)" -ForegroundColor Green
}

$ping = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -WarningAction SilentlyContinue
if ($ping.TcpTestSucceeded) {
  Write-Host "Redis port 6379 is reachable." -ForegroundColor Green
} else {
  Write-Host "Port 6379 not open yet — reboot or start Memurai from Services.msc" -ForegroundColor Yellow
}
