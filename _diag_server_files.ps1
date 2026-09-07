$ErrorActionPreference = 'Continue'
Write-Output "=== D:\ root (ARK folders) ==="
Get-ChildItem 'D:\' -Directory | Where-Object { $_.Name -like '*ark*' } | Select-Object Name, FullName

Write-Output "=== ASE exe ==="
$ase = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'
Write-Output ("{0} => {1}" -f $ase, (Test-Path $ase))

Write-Output "=== ASA exe ==="
$asa = 'D:\arkascendedserver\ShooterGame\Binaries\Win64\ArkAscendedServer.exe'
Write-Output ("{0} => {1}" -f $asa, (Test-Path $asa))

Write-Output "=== ShooterGame\Binaries tree (ASE) ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Binaries' -Recurse -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName

Write-Output "=== ShooterGame\Binaries tree (ASA) ==="
Get-ChildItem 'D:\arkascendedserver\ShooterGame\Binaries' -Recurse -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName

Write-Output "=== Running ARK processes ==="
Get-Process | Where-Object { $_.Name -like '*Shooter*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id | Format-Table -AutoSize

Write-Output "=== Saved dirs (ASE) ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Saved' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== Generated BAT files ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Binaries\Win64' -Filter '_*.bat' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
Get-ChildItem 'D:\arkascendedserver\ShooterGame\Binaries\Win64' -Filter '_*.bat' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
