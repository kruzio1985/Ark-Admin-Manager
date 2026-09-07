$ErrorActionPreference = 'Continue'
Write-Output "=== D:\asmdata ==="
Get-ChildItem 'D:\asmdata' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== D:\asmdata\Profiles ==="
Get-ChildItem 'D:\asmdata\Profiles' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "=== Profile files content ==="
Get-ChildItem 'D:\asmdata\Profiles' -File -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("--- {0} ---" -f $_.Name)
  Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
  Write-Output ""
}
