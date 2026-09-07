$ErrorActionPreference = 'SilentlyContinue'
Write-Output "=== INSTANCJE APLIKACJI ==="
Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue | Select-Object Id,StartTime | Format-Table -AutoSize
Write-Output "=== DB PLIK ==="
$db = "$env:APPDATA\ArkAdminManager\ark_admin.db"
if (Test-Path $db) { $f = Get-Item $db; Write-Output "Rozmiar: $($f.Length) bytes, Ostatni zapis: $($f.LastWriteTime)" } else { Write-Output "BRAK DB" }
Write-Output "=== WEB servers:list ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/invoke' -Method Post -ContentType 'application/json' -Body '{"channel":"servers:list","args":[]}' -UseBasicParsing -TimeoutSec 10
  $j = $r.Content | ConvertFrom-Json
  if ($j.ok) { Write-Output "OK - liczba serwerów: $($j.result.Count)"; $j.result | ForEach-Object { Write-Output "  id=$($_.id) name=$($_.name) game=$($_.game_type) port=$($_.port)" } }
  else { Write-Output "ERR: $($j.error)" }
} catch { Write-Output "EXC: $($_.Exception.Message)" }
