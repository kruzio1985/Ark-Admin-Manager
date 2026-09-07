$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'
function Invoke-Api($channel, $args) {
  $body = @{ channel = $channel; args = $args } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}
$r = Invoke-Api 'servers:list' @()
$list = @($r.result)
Write-Output ("RAW ok={0}" -f $r.ok)
if ($r.error) { Write-Output ("ERROR: " + $r.error) }
$list | ForEach-Object {
  "id=$($_.id) name=$($_.name) game=$($_.game_type) port=$($_.port) query=$($_.query_port) rcon=$($_.rcon_port)"
}
