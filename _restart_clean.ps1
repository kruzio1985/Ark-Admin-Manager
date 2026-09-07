$ErrorActionPreference = 'Continue'
Write-Output "=== KILL ALL INSTANCES ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
$left = Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue
Write-Output ("After kill, running: {0}" -f @($left).Count)

Write-Output "=== START SINGLE INSTANCE (interactive task) ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 10

$procs = @(Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue)
Write-Output ("Running processes: {0}" -f $procs.Count)
$procs | ForEach-Object { "  PID=$($_.Id) SessionId=$($_.SessionId)" }

Write-Output "=== WEB HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("HTTP {0}: {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}
