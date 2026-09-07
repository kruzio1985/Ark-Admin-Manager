$ErrorActionPreference = 'Continue'

Write-Output "=== Download usbmmidd_v2 ==="
$zip = 'C:\temp\usbmmidd_v2.zip'
$dest = 'C:\temp\usbmmidd'
if (-not (Test-Path $zip)) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://www.amyuni.com/downloads/usbmmidd_v2.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 120
    Write-Output ("Downloaded: {0:N1} KB" -f ((Get-Item $zip).Length / 1KB))
  } catch {
    Write-Output ("Download ERROR: {0}" -f $_.Exception.Message)
    exit 1
  }
} else {
  Write-Output ("Already downloaded: {0:N1} KB" -f ((Get-Item $zip).Length / 1KB))
}

Write-Output "=== Extract ==="
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $dest -Force
Get-ChildItem $dest -Recurse | Select-Object FullName | Format-Table -AutoSize

Write-Output "=== Enable virtual display ==="
$devInstaller = Get-ChildItem $dest -Recurse -Filter 'deviceinstaller64.exe' | Select-Object -First 1
if ($devInstaller) {
  Write-Output ("Installer: " + $devInstaller.FullName)
  $p = Start-Process -FilePath $devInstaller.FullName -ArgumentList 'enable 0' -Wait -PassThru -WorkingDirectory $devInstaller.DirectoryName
  Write-Output ("enable exit: {0}" -f $p.ExitCode)
} else {
  Write-Output "deviceinstaller64.exe NOT FOUND in archive"
}

Start-Sleep -Seconds 3
Write-Output "=== Resolution after ==="
Get-CimInstance Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution | Format-Table -AutoSize
