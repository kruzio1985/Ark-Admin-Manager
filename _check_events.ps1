$ErrorActionPreference = 'Continue'
Write-Output "=== SideBySide events (recent) ==="
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='SideBySide'} -MaxEvents 10 -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("[{0}]" -f $_.TimeCreated)
  Write-Output ($_.Message -split "`n" | Select-Object -First 8 | Out-String)
}

Write-Output "=== Windows Error Reporting (recent) ==="
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Windows Error Reporting'} -MaxEvents 6 -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("[{0}]" -f $_.TimeCreated)
  Write-Output ($_.Message -split "`n" | Select-Object -First 12 | Out-String)
}

Write-Output "=== Check steam_api / steamclient DLLs in server dir ==="
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Binaries\Win64' -Filter '*.dll' -ErrorAction SilentlyContinue | Select-Object Name | Sort-Object Name | Format-Wide -Column 3

Write-Output "=== Check root of server dir for dll ==="
Get-ChildItem 'D:\arkevolvedserver' -Filter '*.dll' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== _CommonRedist ==="
Get-ChildItem 'D:\arkevolvedserver' -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*CommonRedist*' -or $_.Name -like '*Redist*' } | Select-Object FullName
