$ErrorActionPreference = 'Continue'

# Kill existing
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$exe = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'
$workDir = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64'
$launchArgs = 'TheIsland?listen?Port=7790?QueryPort=27017?MaxPlayers=70?SessionName=test -server -log'

Write-Output "=== Launch ASE direct (proper flags) ==="
$p = Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory $workDir -PassThru
Write-Output ("PID={0}" -f $p.Id)

Write-Output "Waiting 35s for server to load..."
Start-Sleep -Seconds 35

$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output "RESULT: RUNNING after 35s (server started OK!)"
} else {
  Write-Output ("RESULT: EXITED code={0}" -f $p.ExitCode)
}

Write-Output "=== ShooterGame.log FULL ==="
$log = 'D:\arkevolvedserver\ShooterGame\Saved\Logs\ShooterGame.log'
if (Test-Path $log) {
  $c = Get-Content $log -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content $log } else { Write-Output "(EMPTY)" }
} else { Write-Output "(no log)" }
