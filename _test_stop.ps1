$ErrorActionPreference = 'Continue'

function Show-Processes {
  Get-CimInstance Win32_Process -Filter "Name='ShooterGameServer.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    "  PID=$($_.ProcessId) path=$($_.ExecutablePath)"
  }
}

Write-Output "=== BEFORE stop (id=2) ==="
Show-Processes

$base = 'http://127.0.0.1:8090/api'
$body = @{ channel = 'servers:stop'; args = @(2) } | ConvertTo-Json -Depth 8 -Compress
Write-Output "=== STOP id=2 ==="
$r = Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body
Write-Output ("RESP: " + ($r | ConvertTo-Json -Depth 3 -Compress))

Start-Sleep -Seconds 8
Write-Output "=== AFTER stop (id=2) ==="
Show-Processes
