$ErrorActionPreference = 'Continue'
Write-Output "=== Config dir structure ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved\Config' -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, Length | Format-Table -AutoSize

Write-Output "=== Try launch via cmd /c with redirect ==="
$cmd = 'cmd /c ""D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe" TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?MaxPlayers=70?SessionName=test -server -log > C:\temp\ark_cmd_out.txt 2>&1"'
Write-Output ("CMD: " + $cmd)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$result = cmd /c $cmd
$sw.Stop()
Write-Output ("Exit code: {0} (after {1:N1}s)" -f $LASTEXITCODE, $sw.Elapsed.TotalSeconds)

Write-Output "=== CMD OUTPUT ==="
if (Test-Path 'C:\temp\ark_cmd_out.txt') {
  $c = Get-Content 'C:\temp\ark_cmd_out.txt' -Raw
  Write-Output ("len={0}" -f $c.Length)
  if ($c.Length -gt 0) { Get-Content 'C:\temp\ark_cmd_out.txt' -Tail 50 } else { Write-Output "(empty)" }
} else { Write-Output "(no file)" }

Write-Output "=== Application errors (faulting modules) ==="
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Application Error'} -MaxEvents 8 -ErrorAction SilentlyContinue | ForEach-Object {
  $m = $_.Message
  if ($m -match 'ShooterGame|ArkAscended|Faulting') {
    Write-Output ("[{0}] {1}" -f $_.TimeCreated, ($m -split "`n" | Select-Object -First 8 | Out-String))
  }
}
