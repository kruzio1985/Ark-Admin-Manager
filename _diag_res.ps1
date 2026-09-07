$ErrorActionPreference = 'Continue'
Write-Output "=== VIDEO CONTROLLER ==="
Get-CimInstance Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution, VideoModeDescription | Format-List

Write-Output "=== DESKTOP MONITOR ==="
Get-CimInstance Win32_DesktopMonitor -ErrorAction SilentlyContinue | Select-Object ScreenWidth, ScreenHeight | Format-List

Write-Output "=== RDP SESSION RESOLUTION ==="
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
[System.Windows.Forms.SystemInformation]::VirtualScreen | Format-List

Write-Output "=== ASE _server_2.bat ==="
Get-Content 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\_server_2.bat' -ErrorAction SilentlyContinue

Write-Output "=== ASA _server_1.bat ==="
Get-Content 'D:\arkascendedserver\ShooterGame\Binaries\Win64\_server_1.bat' -ErrorAction SilentlyContinue

Write-Output "=== ARK processes ==="
$p = Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }
if ($p) { $p | Select-Object Name, Id | Format-Table -AutoSize } else { Write-Output "(none)" }

Write-Output "=== ASA log tail ==="
$log2 = Get-ChildItem 'D:\arkascendedserver\ShooterGame\Saved\Logs' -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log2) { Get-Content $log2.FullName -Tail 25 } else { Write-Output "(no log)" }
