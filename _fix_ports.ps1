$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'

function Invoke-Api($channel, $args) {
  $body = @{ channel = $channel; args = $args } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== LIST SERVERS ==="
$r1 = Invoke-Api 'servers:list' @()
Write-Output ("RAW: " + ($r1 | ConvertTo-Json -Depth 4 -Compress))
$servers = $r1.result
$servers = @($servers)
$servers | ForEach-Object {
  "id=$($_.id) name=$($_.name) game=$($_.game_type) port=$($_.port) query=$($_.query_port) rcon=$($_.rcon_port)"
}

Write-Output "=== FIX ASA PORTS (id=1) ==="
$r2 = Invoke-Api 'servers:update' @(1, @{ port = 7850; query_port = 27050; rcon_port = 32400 })
Write-Output ("RAW UPDATE: " + ($r2 | ConvertTo-Json -Depth 4 -Compress))
$u = $r2.result
"updated: id=$($u.id) port=$($u.port) query=$($u.query_port) rcon=$($u.rcon_port)"

Write-Output "=== VERIFY ==="
$r3 = Invoke-Api 'servers:list' @()
$s3 = $r3.result
$s3 = @($s3)
$s3 | ForEach-Object {
  "id=$($_.id) name=$($_.name) game=$($_.game_type) port=$($_.port) query=$($_.query_port) rcon=$($_.rcon_port)"
}
