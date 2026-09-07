$ErrorActionPreference = 'Continue'
Write-Output "=== KILL APP + ARK servers ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Output "=== INSTALL 1.0.4 ==="
$p = Start-Process -FilePath 'C:\temp\ArkAdminSetup.exe' -ArgumentList '/S' -Wait -PassThru
Write-Output ("Install exit: {0}" -f $p.ExitCode)

Write-Output "=== START APP (interactive task) ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 10

Write-Output "=== HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("HTTP {0}: {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}

Write-Output "=== APP PROCESS ==="
@(Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue) | ForEach-Object { "PID=$($_.Id) Session=$($_.SessionId)" }
