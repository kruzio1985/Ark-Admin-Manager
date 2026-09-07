$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'

function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  Write-Output ("BODY: " + $body)
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== LIST BEFORE ==="
$r1 = Invoke-Api 'servers:list' @()
$s1 = @($r1.result)
$s1 | ForEach-Object { "id=$($_.id) game=$($_.game_type) port=$($_.port) query=$($_.query_port) rcon=$($_.rcon_port)" }

Write-Output "=== UPDATE ASA (id=1) ==="
$r2 = Invoke-Api 'servers:update' @(1, @{ port = 7850; query_port = 27050; rcon_port = 32400 })
Write-Output ("RESP: " + ($r2 | ConvertTo-Json -Depth 3 -Compress))

Write-Output "=== VERIFY ==="
$r3 = Invoke-Api 'servers:list' @()
$s3 = @($r3.result)
$s3 | ForEach-Object { "id=$($_.id) game=$($_.game_type) port=$($_.port) query=$($_.query_port) rcon=$($_.rcon_port)" }
