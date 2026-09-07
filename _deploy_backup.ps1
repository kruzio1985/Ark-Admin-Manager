$ErrorActionPreference = 'Continue'

$dbPath = 'C:\Users\Administrator\AppData\Roaming\ArkAdminManager\ark_admin.db'
$backupPath = "C:\temp\ark_admin_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"

Write-Output "=== BACKUP DB ==="
if (Test-Path $dbPath) {
  Copy-Item $dbPath $backupPath -Force
  Write-Output ("Backup: {0} ({1:N0} KB)" -f $backupPath, ((Get-Item $dbPath).Length/1KB))
} else {
  Write-Output "WARNING: no DB in AppData"
}

Write-Output "=== KILL ONLY APP ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

Write-Output "=== INSTALL 1.0.10 ==="
$p = Start-Process -FilePath 'C:\temp\ArkAdminSetup.exe' -ArgumentList '/S' -Wait -PassThru
Write-Output ("Install exit: {0}" -f $p.ExitCode)

Write-Output "=== START APP ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 10

Write-Output "=== VERIFY DATA ==="
$base = 'http://127.0.0.1:8090/api'
function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}
try {
  $r = Invoke-Api 'servers:list' @()
  Write-Output ("Servers: {0}" -f @($r.result).Count)
  @($r.result) | ForEach-Object { "  id=$($_.id) name=$($_.name) map=$($_.map_name) status=$($_.status)" }
  $c = Invoke-Api 'clusters:list' @()
  Write-Output ("Clusters: {0}" -f @($c.result).Count)
  @($c.result) | ForEach-Object { "  id=$($_.id) name=$($_.name) game=$($_.game_type) cluster_id=$($_.cluster_id) servers=$($_.serverCount)" }
} catch {
  Write-Output ("VERIFY ERROR: {0}" -f $_.Exception.Message)
}
