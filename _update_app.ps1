$ErrorActionPreference = 'Continue'

# ─── ARK Admin Manager — update/install script ───────────────────────────────
# Jezeli aplikacja NIE jest zainstalowana → instaluje od zera.
# Jezeli jest → aktualizuje (NSIS robi to sam) i NIGDY nie traci danych (DB).
# Dane sa w: C:\Users\Administrator\AppData\Roaming\ArkAdminManager\ark_admin.db

$dbPath = 'C:\Users\Administrator\AppData\Roaming\ArkAdminManager\ark_admin.db'
$dbDir  = Split-Path $dbPath
$backup = 'C:\temp\ark_admin_db_backup.db'
$installer = 'C:\temp\ArkAdminSetup.exe'

Write-Output "=== 1. BACKUP DB ==="
if (Test-Path $dbPath) {
  Copy-Item $dbPath $backup -Force
  Write-Output ("  OK, backup: {0:N0} KB" -f ((Get-Item $dbPath).Length/1KB))
} else {
  Write-Output "  No DB yet (fresh install)"
}

Write-Output "=== 2. STOP APP ==="
$app = Get-Process -Name 'ARK Admin Manager' -ErrorAction SilentlyContinue
if ($app) { $app | Stop-Process -Force; Start-Sleep -Seconds 3; Write-Output "  App stopped" }
else { Write-Output "  App not running" }

Write-Output "=== 3. INSTALL / UPDATE ==="
if (-not (Test-Path $installer)) {
  Write-Output "  ERROR: installer not found: $installer"
  exit 1
}
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
Write-Output ("  Install exit: {0}" -f $p.ExitCode)

Write-Output "=== 4. RESTORE DB IF LOST ==="
if (-not (Test-Path $dbPath) -and (Test-Path $backup)) {
  if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Path $dbDir -Force | Out-Null }
  Copy-Item $backup $dbPath -Force
  Write-Output "  DB RESTORED from backup"
} elseif (Test-Path $dbPath) {
  Write-Output "  DB OK (nie ruszona)"
}

Write-Output "=== 5. START APP ==="
schtasks /run /tn ARKAdminManager | Out-Null
Start-Sleep -Seconds 8
Write-Output "  started"

Write-Output "=== 6. HEALTH ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("  {0}" -f $r.Content)
} catch {
  Write-Output ("  ERROR: {0}" -f $_.Exception.Message)
}
