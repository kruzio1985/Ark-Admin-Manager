$ErrorActionPreference = 'Continue'
Write-Output "=== ARK processes ==="
$p = Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id, StartTime | Format-Table -AutoSize } else { Write-Output "(none running)" }

Write-Output "=== ASE Log dir ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== ASE Log tail ==="
$log = Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log) {
  Write-Output ("Log: " + $log.FullName)
  Get-Content $log.FullName -Tail 50
} else { Write-Output "(no log)" }

Write-Output "=== ASA Log dir ==="
Get-ChildItem 'D:\arkascendedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== ASA Log tail ==="
$log2 = Get-ChildItem 'D:\arkascendedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log2) {
  Write-Output ("Log: " + $log2.FullName)
  Get-Content $log2.FullName -Tail 50
} else { Write-Output "(no log)" }
