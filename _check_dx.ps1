$ErrorActionPreference = 'Continue'
$dest = 'C:\temp\directx_Jun2010_redist.exe'
if (Test-Path $dest) {
  Write-Output ("File: {0:N1} MB" -f ((Get-Item $dest).Length / 1MB))
} else {
  Write-Output "not downloaded yet"
}
Write-Output "=== powershell/dxsetup processes ==="
Get-Process | Where-Object { $_.Name -like '*dxsetup*' -or $_.Name -like '*powershell*' } | Select-Object Name, Id | Format-Table -AutoSize
Write-Output "=== DLL check ==="
foreach ($dll in @('X3DAudio1_7.dll','XAPOFX1_5.dll')) {
  $p = Join-Path 'C:\Windows\System32' $dll
  Write-Output ("{0} => {1}" -f $dll, (Test-Path $p))
}
