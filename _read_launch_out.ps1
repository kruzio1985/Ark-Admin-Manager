$ErrorActionPreference = 'Continue'
Write-Output "=== STDOUT ==="
if (Test-Path 'C:\temp\ark_launch_stdout.txt') {
  $c = Get-Content 'C:\temp\ark_launch_stdout.txt' -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content 'C:\temp\ark_launch_stdout.txt' -Tail 40 } else { Write-Output "(empty)" }
} else { Write-Output "(no file)" }

Write-Output "=== STDERR ==="
if (Test-Path 'C:\temp\ark_launch_stderr.txt') {
  $c = Get-Content 'C:\temp\ark_launch_stderr.txt' -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content 'C:\temp\ark_launch_stderr.txt' -Tail 40 } else { Write-Output "(empty)" }
} else { Write-Output "(no file)" }

Write-Output "=== PROCESSES ==="
$p = Get-Process | Where-Object { $_.Name -like '*Shooter*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id | Format-Table -AutoSize } else { Write-Output "(none running)" }

Write-Output "=== LOGS DIR ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
if (-not (Test-Path 'D:\arkevolvedserver\ShooterGame\Saved\Logs')) { Write-Output "(no Logs dir)" }

Write-Output "=== VC++ RUNTIME ==="
$vc = Get-ChildItem 'C:\Windows\System32' -Filter 'vcruntime140*.dll' -ErrorAction SilentlyContinue
$cp = Get-ChildItem 'C:\Windows\System32' -Filter 'msvcp140*.dll' -ErrorAction SilentlyContinue
Write-Output ("vcruntime140: {0}" -f @($vc).Count)
Write-Output ("msvcp140: {0}" -f @($cp).Count)
