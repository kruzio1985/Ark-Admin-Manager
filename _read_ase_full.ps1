$ErrorActionPreference = 'Continue'
Write-Output "=== Log files ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== ShooterGame.log FULL ==="
$log = 'D:\arkevolvedserver\ShooterGame\Saved\Logs\ShooterGame.log'
if (Test-Path $log) {
  $c = Get-Content $log -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content $log } else { Write-Output "(EMPTY)" }
} else { Write-Output "(no log)" }

Write-Output "=== newest backup log FULL ==="
$b = Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -Filter 'ShooterGame-backup-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($b) {
  Write-Output ("File: " + $b.Name)
  Get-Content $b.FullName
}

Write-Output "=== ShooterGame\Saved dirs ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== Content\Maps check (TheIsland) ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Content\Maps' -Directory -ErrorAction SilentlyContinue | Select-Object Name
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Content\Maps\TheIslandSubmaps' -ErrorAction SilentlyContinue | Select-Object Name, Length | Select-Object -First 10
