$ErrorActionPreference = 'Continue'
Write-Output "=== ARK processes ==="
$p = Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id, StartTime | Format-Table -AutoSize } else { Write-Output "(none)" }

Write-Output "=== Generated BAT files ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Binaries\Win64' -Filter '_*.bat' -ErrorAction SilentlyContinue | Select-Object Name, LastWriteTime
Get-ChildItem 'D:\arkascendedserver\ShooterGame\Binaries\Win64' -Filter '_*.bat' -ErrorAction SilentlyContinue | Select-Object Name, LastWriteTime

Write-Output "=== ASE _server_2.bat content ==="
Get-Content 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\_server_2.bat' -ErrorAction SilentlyContinue

Write-Output "=== ASA _server_1.bat content ==="
Get-Content 'D:\arkascendedserver\ShooterGame\Binaries\Win64\_server_1.bat' -ErrorAction SilentlyContinue

Write-Output "=== ASE log tail ==="
$log = Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log) { Write-Output ("Log: " + $log.FullName); Get-Content $log.FullName -Tail 30 } else { Write-Output "(no log)" }

Write-Output "=== ASA log tail ==="
$log2 = Get-ChildItem 'D:\arkascendedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log2) { Write-Output ("Log: " + $log2.FullName); Get-Content $log2.FullName -Tail 30 } else { Write-Output "(no log)" }
