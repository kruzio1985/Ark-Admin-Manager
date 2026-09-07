$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'

function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== START ASE (id=2) ==="
$r1 = Invoke-Api 'servers:start' @(2)
Write-Output ("RESP: " + ($r1 | ConvertTo-Json -Depth 2 -Compress))
Write-Output "waiting 45s..."
Start-Sleep -Seconds 45

Write-Output "=== ASE process after 45s ==="
$ase = Get-Process -Name 'ShooterGameServer' -ErrorAction SilentlyContinue
if ($ase) { $ase | Select-Object Name, Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB,0)}} | Format-Table -AutoSize } else { Write-Output "(ASE NOT running)" }

Write-Output "=== START ASA (id=1) ==="
$r2 = Invoke-Api 'servers:start' @(1)
Write-Output ("RESP: " + ($r2 | ConvertTo-Json -Depth 2 -Compress))
Write-Output "waiting 45s..."
Start-Sleep -Seconds 45

Write-Output "=== BOTH processes after ==="
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB,0)}} | Format-Table -AutoSize

Write-Output "=== servers:list ==="
$r3 = Invoke-Api 'servers:list' @()
@($r3.result) | ForEach-Object { "id=$($_.id) name=$($_.name) status=$($_.status)" }

Write-Output "=== BAT flags check (ASE) ==="
Get-Content 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\_server_2.bat' -ErrorAction SilentlyContinue | Select-Object -Last 2
