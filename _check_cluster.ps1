$ErrorActionPreference = 'Continue'
Write-Output "=== cluster_bio folders ==="
Get-ChildItem 'D:\' -Directory -Filter '*cluster*' -ErrorAction SilentlyContinue | Select-Object FullName
Get-ChildItem 'D:\arkevolvedserver' -Directory -Filter '*cluster*' -ErrorAction SilentlyContinue | Select-Object FullName
Get-ChildItem 'D:\arkevolvedserver\ShooterGame' -Directory -Filter '*cluster*' -ErrorAction SilentlyContinue | Select-Object FullName
Get-ChildItem 'D:\arkevolvedserver\ShooterGame\Binaries\Win64' -Directory -Filter '*cluster*' -ErrorAction SilentlyContinue | Select-Object FullName

Write-Output "=== BAT cluster args ==="
Select-String -Path 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\_server_*.bat' -Pattern 'ClusterDirOverride' -ErrorAction SilentlyContinue | ForEach-Object { $_.Line.Trim() }
Select-String -Path 'D:\evolved2\ShooterGame\Binaries\Win64\_server_*.bat' -Pattern 'ClusterDirOverride' -ErrorAction SilentlyContinue | ForEach-Object { $_.Line.Trim() }

Write-Output "=== evolved2 install path ==="
Get-ChildItem 'D:\' -Directory | Where-Object { $_.Name -like '*evolved*' -or $_.Name -like '*ragnarok*' } | Select-Object Name

Write-Output "=== server install paths + cluster_id (from app) ==="
$base = 'http://127.0.0.1:8090/api'
$body = @{ channel = 'servers:list'; args = @() } | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Uri "$base/invoke" -Method Post -ContentType 'application/json' -Body $body
@($r.result) | ForEach-Object { "id=$($_.id) name=$($_.name) map=$($_.map_name) install=$($_.install_path) cluster_id=$($_.cluster_id)" }
