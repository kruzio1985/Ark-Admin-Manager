$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'

function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== START ASE (id=2) ==="
$r1 = Invoke-Api 'servers:start' @(2)
Write-Output ("RESP: " + ($r1 | ConvertTo-Json -Depth 3 -Compress))
Write-Output "waiting 25s..."
Start-Sleep -Seconds 25

Write-Output "=== ARK processes after ASE start ==="
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id, StartTime | Format-Table -AutoSize

Write-Output "=== START ASA (id=1) ==="
$r2 = Invoke-Api 'servers:start' @(1)
Write-Output ("RESP: " + ($r2 | ConvertTo-Json -Depth 3 -Compress))
Write-Output "waiting 25s..."
Start-Sleep -Seconds 25

Write-Output "=== ARK processes after ASA start ==="
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id, StartTime | Format-Table -AutoSize

Write-Output "=== servers:list status ==="
$r3 = Invoke-Api 'servers:list' @()
$list = @($r3.result)
$list | ForEach-Object { "id=$($_.id) name=$($_.name) status=$($_.status)" }
