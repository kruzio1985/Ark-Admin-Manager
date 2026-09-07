$ErrorActionPreference = 'Continue'
Write-Output "=== ARK processes ==="
Get-Process | Where-Object { $_.Name -like '*Shooter*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id, StartTime | Format-Table -AutoSize

Write-Output "=== Log files (ASE) ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== Log tail ==="
$log = Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log) {
  Write-Output ("Log: " + $log.FullName)
  Get-Content $log.FullName -Tail 50
} else {
  Write-Output "(no log files)"
}

Write-Output "=== Saved dirs ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved' -ErrorAction SilentlyContinue | Select-Object Name
