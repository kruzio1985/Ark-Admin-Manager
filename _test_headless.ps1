$ErrorActionPreference = 'Continue'

# Kill existing ARK processes
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

function Test-Launch($name, $exe, $workDir, $launchArgs) {
  Write-Output "=== Testing $name ==="
  $p = Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory $workDir -PassThru
  Write-Output ("PID={0}" -f $p.Id)
  Start-Sleep -Seconds 20
  $alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if ($alive) {
    Write-Output "RESULT: RUNNING (OK) after 20s"
    Stop-Process -Id $p.Id -Force
    Write-Output "  (stopped test instance)"
  } else {
    Write-Output "RESULT: EXITED (FAIL) - exit code: $($p.ExitCode)"
  }
  Write-Output ""
}

$aseExe = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'
$aseDir = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64'
$aseArgs = 'TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?MaxPlayers=70?SessionName=arkevolvedserver -server -log -servergamelog -NoSound -nullrhi'

$asaExe = 'D:\arkascendedserver\ShooterGame\Binaries\Win64\ArkAscendedServer.exe'
$asaDir = 'D:\arkascendedserver\ShooterGame\Binaries\Win64'
$asaArgs = 'TheIsland_WP?listen?Port=7850?QueryPort=27050?RCONPort=32400?MaxPlayers=70?SessionName=arkascendedserver -WinLiveMaxPlayers=70 -server -log -servergamelog -NoSound -nullrhi'

Test-Launch 'ASE (stary)' $aseExe $aseDir $aseArgs
Test-Launch 'ASA (nowy)' $asaExe $asaDir $asaArgs
