# Samples T+5, T+10, T+15, T+30 after T0. Writes JSON files then exits.
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\HP\OneDrive\Desktop\expo_app\backend"
$samples = @(
  @{ name = "T5"; sleepSec = 300 },
  @{ name = "T10"; sleepSec = 300 },
  @{ name = "T15"; sleepSec = 300 },
  @{ name = "T30"; sleepSec = 900 }
)
foreach ($s in $samples) {
  Write-Output "SLEEP $($s.sleepSec) for $($s.name)"
  Start-Sleep -Seconds $s.sleepSec
  Write-Output "CAPTURE $($s.name) $(Get-Date -Format o)"
  npx tsx scripts/audit-disk-io-snapshot.ts | Out-File -Encoding utf8 "scripts\io-samples\$($s.name).json"
  Write-Output "DONE $($s.name)"
}
Write-Output "ALL_SAMPLES_DONE"
