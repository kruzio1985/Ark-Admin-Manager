$ErrorActionPreference = 'Continue'
Write-Output "=== ARK processes ==="
$p = Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id, StartTime | Format-Table -AutoSize } else { Write-Output "(none)" }

Write-Output "=== ASE log files ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== ASE ShooterGame.log tail ==="
$log = 'D:\arkevolvedserver\ShooterGame\Saved\Logs\ShooterGame.log'
if (Test-Path $log) {
  $c = Get-Content $log -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content $log -Tail 60 } else { Write-Output "(EMPTY log)" }
} else { Write-Output "(no ShooterGame.log)" }

Write-Output "=== ASE GameUserSettings.ini ==="
Get-Content 'D:\arkevolvedserver\ShooterGame\Saved\Config\WindowsServer\GameUserSettings.ini' -ErrorAction SilentlyContinue

Write-Output "=== ASE Game.ini ==="
Get-Content 'D:\arkevolvedserver\ShooterGame\Saved\Config\WindowsServer\Game.ini' -ErrorAction SilentlyContinue

Write-Output "=== Port check (7790/27017/32330) ==="
Get-NetTCPConnection -LocalPort 7790,27017,32330 -ErrorAction SilentlyContinue | Select-Object LocalPort, State, OwningProcess | Format-Table -AutoSize
Get-NetUDPEndpoint -LocalPort 7790,27017,32330 -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess | Format-Table -AutoSize
