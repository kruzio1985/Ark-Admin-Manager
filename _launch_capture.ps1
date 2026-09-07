$ErrorActionPreference = 'Continue'
$workDir = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64'
$exe = Join-Path $workDir 'ShooterGameServer.exe'
$outFile = 'C:\temp\ark_launch_stdout.txt'
$errFile = 'C:\temp\ark_launch_stderr.txt'
Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

$args = 'TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?MaxPlayers=70?SessionName=test -server -log'

Write-Output "=== Launching with output capture ==="
$p = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $workDir -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
Write-Output ("PID={0}" -f $p.Id)
Start-Sleep -Seconds 12

$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output "STILL RUNNING after 12s"
  Stop-Process -Id $p.Id -Force
  Write-Output "Killed"
} else {
  Write-Output "EXITED early (exit code: $($p.ExitCode))"
}

Write-Output "=== STDOUT ==="
if (Test-Path $outFile) { Get-Content $outFile -Tail 40 } else { Write-Output "(no stdout)" }
Write-Output "=== STDERR ==="
if (Test-Path $errFile) { Get-Content $errFile -Tail 40 } else { Write-Output "(no stderr)" }

Write-Output "=== VC++ Redist check ==="
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue | Select-Object Version, Installed
Get-ChildItem 'C:\Windows\System32' -Filter 'vcruntime140*.dll' -ErrorAction SilentlyContinue | Select-Object Name
Get-ChildItem 'C:\Windows\System32' -Filter 'msvcp140*.dll' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== Logs dir (after run) ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Logs' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
