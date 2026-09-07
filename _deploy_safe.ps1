$ErrorActionPreference = 'Continue'
Write-Output "=== KILL ONLY APP (nie ruszam ARK/SteamCMD) ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

Write-Output "=== INSTALL 1.0.9 ==="
$p = Start-Process -FilePath 'C:\temp\ArkAdminSetup.exe' -ArgumentList '/S' -Wait -PassThru
Write-Output ("Install exit: {0}" -f $p.ExitCode)

Write-Output "=== START APP ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 8

Write-Output "=== HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("HTTP {0}: {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}
