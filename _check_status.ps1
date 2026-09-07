$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'
function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== PROCESSES ==="
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Select-Object Name, Id, @{N='Path';E={$_.Path}} | Format-Table -AutoSize

Write-Output "=== servers:list (status) ==="
$r = Invoke-Api 'servers:list' @()
@($r.result) | ForEach-Object { "id=$($_.id) name=$($_.name) game=$($_.game_type) status=$($_.status) install=$($_.install_path)" }

Write-Output "=== syncLiveStatus trigger ==="
$r2 = Invoke-Api 'app:getInfo' @()
Write-Output ("app info: " + ($r2.result | ConvertTo-Json -Compress))
