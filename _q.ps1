$base = "http://IP_SERWERA:8090"
function R($ch, $argsJson) {
  $body = '{"channel":"' + $ch + '","args":' + $argsJson + '}'
  try {
    $r = Invoke-WebRequest -Uri "$base/api/invoke" -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10
    $j = $r.Content | ConvertFrom-Json
    if ($j.ok) { return "OK: " + ($j.result | ConvertTo-Json -Compress -Depth 4) } else { return "ERR: " + $j.error }
  } catch { return "EXC: $($_.Exception.Message)" }
}
Write-Output "servers:list => $(R 'servers:list' '[]')"
Write-Output "settings:getAll => $(R 'settings:getAll' '[]')"
