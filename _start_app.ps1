$ErrorActionPreference = 'Continue'
Write-Output "=== APPDATA FILES ==="
$ad = Join-Path $env:APPDATA 'ARK Admin Manager'
if (Test-Path $ad) {
  Get-ChildItem $ad -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
} else {
  Write-Output "NO APPDATA DIR: $ad"
}

Write-Output "=== START APP ==="
$p = Start-Process -FilePath 'C:\Program Files\ARK Admin Manager\ARK Admin Manager.exe' -PassThru
Write-Output ("Started PID={0}" -f $p.Id)
Start-Sleep -Seconds 8
$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output "APP IS RUNNING"
} else {
  Write-Output "APP EXITED"
}

Write-Output "=== ARK PROCESSES ==="
Get-Process | Where-Object { $_.Name -like '*ARK*' } | Select-Object Name, Id, Path | Format-List

Write-Output "=== WEB HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("HTTP {0}: {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}
