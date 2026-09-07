$ErrorActionPreference = 'Continue'
$procs = @(Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue)
Write-Output ("Running: {0}" -f $procs.Count)
$procs | ForEach-Object { "  PID=$($_.Id) SessionId=$($_.SessionId)" }
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("WEB: HTTP {0} - {1}" -f $r.StatusCode, $r.Content)
} catch {
  Write-Output ("WEB ERROR: {0}" -f $_.Exception.Message)
}
