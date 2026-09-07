$ErrorActionPreference = 'Continue'
Write-Output "=== VC++ 2013 DLLs (needed by ASE) ==="
Get-ChildItem 'C:\Windows\System32' -Filter 'msvcp120*.dll' -ErrorAction SilentlyContinue | Select-Object Name, Length
Get-ChildItem 'C:\Windows\System32' -Filter 'msvcr120*.dll' -ErrorAction SilentlyContinue | Select-Object Name, Length
Get-ChildItem 'C:\Windows\System32' -Filter 'vcomp120*.dll' -ErrorAction SilentlyContinue | Select-Object Name, Length

Write-Output "=== VC++ 2015-2022 DLLs (needed by ASA) ==="
Get-ChildItem 'C:\Windows\System32' -Filter 'msvcp140*.dll' -ErrorAction SilentlyContinue | Select-Object Name, Length
Get-ChildItem 'C:\Windows\System32' -Filter 'vcruntime140*.dll' -ErrorAction SilentlyContinue | Select-Object Name, Length

Write-Output "=== DirectX d3dx9 ==="
Get-ChildItem 'C:\Windows\System32' -Filter 'd3dx9_*.dll' -ErrorAction SilentlyContinue | Select-Object Name

Write-Output "=== Latest Application Error (0xc0000135 / ShooterGame) ==="
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Application Error'} -MaxEvents 20 -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'ShooterGame|ArkAscended|0xc0000135|0xc000007b' } | ForEach-Object {
  Write-Output ("[{0}]" -f $_.TimeCreated)
  Write-Output ($_.Message -split "`n" | Select-Object -First 10 | Out-String)
}

Write-Output "=== Installed VC++ redist (registry) ==="
$regPaths = @(
  'HKLM:\SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x64',
  'HKLM:\SOFTWARE\Microsoft\VisualStudio\12.0\VC\Runtimes\x64',
  'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\11.0\VC\Runtimes\x64',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\12.0\VC\Runtimes\x64'
)
foreach ($rp in $regPaths) {
  $v = Get-ItemProperty $rp -ErrorAction SilentlyContinue
  if ($v) { Write-Output ("{0} => v{1} installed={2}" -f $rp, $v.Version, $v.Installed) }
  else { Write-Output ("{0} => NOT FOUND" -f $rp) }
}
