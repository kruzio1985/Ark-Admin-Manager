$ErrorActionPreference = 'Continue'

Write-Output "=== AnyDesk / TeamViewer installed? ==="
Get-Process | Where-Object { $_.Name -like '*AnyDesk*' -or $_.Name -like '*TeamViewer*' -or $_.Name -like '*vnc*' } | Select-Object Name, Id, SessionId | Format-Table -AutoSize

Write-Output "=== AnyDesk service ==="
Get-Service | Where-Object { $_.Name -like '*AnyDesk*' -or $_.Name -like '*TeamViewer*' } | Select-Object Name, Status, StartType | Format-Table -AutoSize

Write-Output "=== AnyDesk installed files ==="
Get-ChildItem 'C:\Program Files (x86)\AnyDesk' -ErrorAction SilentlyContinue | Select-Object Name
Get-ChildItem 'C:\Program Files\AnyDesk' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== Display drivers (video controllers) ==="
Get-CimInstance Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution, PNPDeviceID | Format-List

Write-Output "=== Sessions (quser) ==="
quser 2>$null
if ($LASTEXITCODE -ne 0) { Write-Output "(quser failed)" }

Write-Output "=== AnyDesk virtual display driver (PnP) ==="
Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*AnyDesk*' -or $_.Name -like '*Display*' -or $_.Name -like '*Virtual*Monitor*' } | Select-Object Name, Status | Format-Table -AutoSize

Write-Output "=== Non-PnP display drivers ==="
Get-CimInstance Win32_SystemDriver -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*display*' -or $_.DisplayName -like '*AnyDesk*' -or $_.DisplayName -like '*TeamViewer*' -or $_.DisplayName -like '*vga*' } | Select-Object Name, State, StartMode | Format-Table -AutoSize
