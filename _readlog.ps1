$ErrorActionPreference = 'Continue'
Write-Output "=== LOG FILES ==="
$dirs = @(
  'C:\Users\Administrator\AppData\Roaming\ArkAdminManager\logs',
  'C:\Users\Administrator\AppData\Roaming\ARK Admin Manager\logs'
)
foreach ($d in $dirs) {
  Write-Output "--- DIR: $d"
  if (Test-Path $d) {
    Get-ChildItem $d -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
  } else {
    Write-Output "  (not found)"
  }
}

Write-Output "=== STARTUP.LOG TAIL ==="
$log = 'C:\Users\Administrator\AppData\Roaming\ArkAdminManager\logs\startup.log'
if (Test-Path $log) {
  Get-Content $log -Tail 40
} else {
  Write-Output "  (no startup.log)"
}
