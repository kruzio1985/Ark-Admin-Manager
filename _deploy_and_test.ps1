$ErrorActionPreference = 'Continue'
Write-Output "=== KILL ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Write-Output ("Running after kill: {0}" -f @(Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue).Count)

Write-Output "=== INSTALL ==="
$p = Start-Process -FilePath 'C:\temp\ArkAdminSetup.exe' -ArgumentList '/S' -Wait -PassThru
Write-Output ("Install exit: {0}" -f $p.ExitCode)

Write-Output "=== START ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 10
Write-Output ("Running after start: {0}" -f @(Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue).Count)

Write-Output "=== HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("HTTP {0}: {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}

Write-Output "=== TRIGGER UPDATE (to capture stack) ==="
$body = @{ channel = 'servers:update'; args = @(1, @{ port = 7850; query_port = 27050; rcon_port = 32400 }) } | ConvertTo-Json -Depth 8 -Compress
try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/api/invoke' -Method Post -ContentType 'application/json' -Body $body
  Write-Output ("UPDATE RESPONSE: " + ($r | ConvertTo-Json -Depth 3 -Compress))
} catch {
  Write-Output ("UPDATE ERROR: {0}" -f $_.Exception.Message)
}
