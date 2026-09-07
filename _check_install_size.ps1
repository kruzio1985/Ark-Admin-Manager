$ErrorActionPreference = 'Continue'
Write-Output "=== ARK folder sizes ==="
Get-ChildItem 'D:\' -Directory | Where-Object { $_.Name -like '*ark*' } | ForEach-Object {
  $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  Write-Output ("{0}: {1:N2} GB" -f $_.Name, ($size / 1GB))
}

Write-Output "=== ASE Content folder ==="
Test-Path 'D:\arkevolvedserver\ShooterGame\Content'
if (Test-Path 'D:\arkevolvedserver\ShooterGame\Content') {
  $c = (Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Content' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  Write-Output ("Content size: {0:N2} GB" -f ($c / 1GB))
  Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Content' -Directory -ErrorAction SilentlyContinue | Select-Object -First 10 -ExpandProperty Name
}

Write-Output "=== ASA Content folder ==="
Test-Path 'D:\arkascendedserver\ShooterGame\Content'
if (Test-Path 'D:\arkascendedserver\ShooterGame\Content') {
  $c = (Get-ChildItem 'D:\arkascendedserver\ShooterGame\Content' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  Write-Output ("Content size: {0:N2} GB" -f ($c / 1GB))
}

Write-Output "=== Application crash events (last 10) ==="
Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2} -MaxEvents 10 -ErrorAction SilentlyContinue | Where-Object { $_.Message -like '*ShooterGame*' -or $_.Message -like '*ArkAscended*' } | Select-Object TimeCreated, Id, ProviderName | Format-Table -AutoSize
Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, ProviderName | Format-Table -AutoSize
