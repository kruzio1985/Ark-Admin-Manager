$ErrorActionPreference = 'Continue'

Write-Output "=== Internet check ==="
try {
  $r = Invoke-WebRequest -Uri 'https://download.microsoft.com' -Method Head -TimeoutSec 10 -UseBasicParsing
  Write-Output ("Internet OK: {0}" -f $r.StatusCode)
} catch {
  Write-Output ("Internet ERROR: {0}" -f $_.Exception.Message)
}

$url = 'https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe'
$dest = 'C:\temp\directx_Jun2010_redist.exe'

Write-Output "=== Download DirectX June 2010 redist ==="
if (-not (Test-Path $dest)) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 300
    Write-Output ("Downloaded: {0:N1} MB" -f ((Get-Item $dest).Length / 1MB))
  } catch {
    Write-Output ("Download ERROR: {0}" -f $_.Exception.Message)
    return
  }
} else {
  Write-Output ("Already exists: {0:N1} MB" -f ((Get-Item $dest).Length / 1MB))
}

Write-Output "=== Extract redist ==="
$extractDir = 'C:\temp\dxredist'
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
New-Item -ItemType Directory -Path $extractDir | Out-Null
Start-Process -FilePath $dest -ArgumentList "/Q /T:$extractDir" -Wait -NoNewWindow
Write-Output "Extracted to $extractDir"
Get-ChildItem $extractDir -Recurse -Filter 'DXSETUP.exe' -ErrorAction SilentlyContinue | Select-Object FullName

Write-Output "=== Run DXSETUP silent ==="
$dxsetup = Get-ChildItem $extractDir -Recurse -Filter 'DXSETUP.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($dxsetup) {
  $p = Start-Process -FilePath $dxsetup.FullName -ArgumentList '/silent' -Wait -PassThru -NoNewWindow
  Write-Output ("DXSETUP exit: {0}" -f $p.ExitCode)
} else {
  Write-Output "DXSETUP.exe not found"
}

Write-Output "=== Verify DLLs ==="
Start-Sleep -Seconds 3
foreach ($dll in @('X3DAudio1_7.dll','XAPOFX1_5.dll','XAudio2_7.dll','d3dx9_43.dll','D3DCompiler_43.dll')) {
  $p = Join-Path 'C:\Windows\System32' $dll
  Write-Output ("{0} => {1}" -f $dll, (Test-Path $p))
}
