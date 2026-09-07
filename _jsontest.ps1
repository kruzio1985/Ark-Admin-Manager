$body = @{ channel = 'servers:update'; args = @(1, @{ port = 7850; query_port = 27050; rcon_port = 32400 }) } | ConvertTo-Json -Depth 8 -Compress
Write-Output "BODY: $body"
$parsed = $body | ConvertFrom-Json
Write-Output "args type: $($parsed.args.GetType().FullName)"
Write-Output "args count: $($parsed.args.Count)"
Write-Output "args[0]: $($parsed.args[0])"
Write-Output "args[1]: $($parsed.args[1] | ConvertTo-Json -Compress)"
