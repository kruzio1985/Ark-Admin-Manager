$ErrorActionPreference = 'Continue'
Write-Output "=== APP PATH CHECK ==="
$paths = @(
  'C:\Program Files\ARK Admin Manager\ARK Admin Manager.exe',
  'C:\Program Files (x86)\ARK Admin Manager\ARK Admin Manager.exe',
  'C:\ARK Admin Manager\ARK Admin Manager.exe'
)
foreach ($p in $paths) {
  Write-Output ("{0} => {1}" -f $p, (Test-Path $p))
}

Write-Output "=== SEARCH ARK EXE ==="
Get-ChildItem 'C:\','D:\' -Recurse -Filter 'ARK Admin Manager.exe' -ErrorAction SilentlyContinue -Depth 4 | Select-Object -ExpandProperty FullName

Write-Output "=== RUNNING PROCESSES ==="
Get-Process | Where-Object { $_.Name -like '*ARK*' } | Select-Object Name, Id, Path | Format-List
