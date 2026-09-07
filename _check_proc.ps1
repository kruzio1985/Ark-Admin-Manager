$ErrorActionPreference = 'Continue'
Write-Output "=== ARK processes ==="
$p = Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id, StartTime, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB,0)}} | Format-Table -AutoSize } else { Write-Output "(none)" }
Write-Output "=== Port 7790 (ASE game) ==="
Get-NetUDPEndpoint -LocalPort 7790 -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess | Format-Table -AutoSize
Write-Output "=== Logs ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
