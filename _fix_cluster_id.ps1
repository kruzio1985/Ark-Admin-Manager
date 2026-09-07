$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:8090/api'
function Invoke-Api([string]$channel, [object[]]$argList) {
  $body = @{ channel = $channel; args = $argList } | ConvertTo-Json -Depth 8 -Compress
  return (Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body)
}

Write-Output "=== Set cluster_id to full path D:\cluster_bio ==="
$r1 = Invoke-Api 'servers:update' @(2, @{ cluster_id = 'D:\cluster_bio' })
Write-Output ("id=2: cluster_id=" + $r1.result.cluster_id)
$r2 = Invoke-Api 'servers:update' @(9, @{ cluster_id = 'D:\cluster_bio' })
Write-Output ("id=9: cluster_id=" + $r2.result.cluster_id)

Write-Output "=== Verify ==="
$r3 = Invoke-Api 'servers:list' @()
@($r3.result) | ForEach-Object { "id=$($_.id) name=$($_.name) cluster_id=$($_.cluster_id)" }
