$ErrorActionPreference = 'Continue'
$workDir = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64'
$exe = Join-Path $workDir 'ShooterGameServer.exe'

Write-Output "=== Launch test: ASE ==="
Set-Location $workDir
$args = 'TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?RCONServerGameLogBuffer=600?MaxPlayers=70?SessionName=arkevolvedserver -server -log -servergamelog'

$p = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $workDir -PassThru -NoNewWindow
Write-Output ("PID={0}" -f $p.Id)
Start-Sleep -Seconds 15

$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output "PROCESS ALIVE (running OK)"
} else {
  Write-Output "PROCESS EXITED (crashed)"
}

Write-Output "=== ARK processes ==="
Get-Process | Where-Object { $_.Name -like '*Shooter*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id | Format-Table -AutoSize

Write-Output "=== Log files ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== Log tail ==="
$log = Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log) {
  Write-Output ("Log: " + $log.FullName)
  Get-Content $log.FullName -Tail 40
} else {
  Write-Output "(no log files)"
}

Write-Output "=== Saved dirs ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved' -ErrorAction SilentlyContinue | Select-Object Name
