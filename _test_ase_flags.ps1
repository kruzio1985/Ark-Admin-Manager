$ErrorActionPreference = 'Continue'

function Test-Flags($label, $flags) {
  Write-Output "=== TEST: $label ==="
  $exe = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'
  $workDir = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64'
  $map = 'TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?MaxPlayers=70?SessionName=arkevolvedserver'
  $fullArgs = "$map $flags"
  $p = Start-Process -FilePath $exe -ArgumentList $fullArgs -WorkingDirectory $workDir -PassThru
  Write-Output ("PID={0}" -f $p.Id)
  Start-Sleep -Seconds 15
  $alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if ($alive) {
    Write-Output "RESULT: RUNNING OK"
    Stop-Process -Id $p.Id -Force
  } else {
    Write-Output ("RESULT: EXITED code={0}" -f $p.ExitCode)
  }
  # show log tail
  $log = 'D:\arkevolvedserver\ShooterGame\Saved\Logs\ShooterGame.log'
  if (Test-Path $log) {
    $c = Get-Content $log -Raw -ErrorAction SilentlyContinue
    if ($c.Length -gt 0) { Get-Content $log -Tail 15 }
  }
  Write-Output ""
}

# Kill any existing
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Test-Flags 'ASE: -server -log (BEZ nullrhi)' '-server -log'
