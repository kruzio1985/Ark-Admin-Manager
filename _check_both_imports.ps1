$ErrorActionPreference = 'Continue'

Write-Output "=== Kill ARK server processes ==="
Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Output ("Running now: {0}" -f @(Get-Process | Where-Object { $_.Name -like '*ShooterGame*' -or $_.Name -like '*ArkAscended*' }).Count)

# PE import checker
function Get-Imports([string]$exe) {
  if (-not (Test-Path $exe)) { return @() }
  $fs = [System.IO.File]::OpenRead($exe)
  $br = New-Object System.IO.BinaryReader($fs)
  $fs.Position = 0x3C
  $e_lfanew = $br.ReadInt32()
  $fs.Position = $e_lfanew
  $null = $br.ReadUInt32()
  $null = $br.ReadUInt16()
  $numSections = $br.ReadUInt16()
  $null = $br.ReadUInt32(); $null = $br.ReadUInt32(); $null = $br.ReadUInt32()
  $sizeOfOptionalHeader = $br.ReadUInt16()
  $null = $br.ReadUInt16()
  $optStart = $fs.Position
  $magic = $br.ReadUInt16()
  $is64 = ($magic -eq 0x20B)
  $ddOffset = if ($is64) { 112 } else { 96 }
  $fs.Position = $optStart + $ddOffset + 8
  $importRVA = $br.ReadUInt32()
  $null = $br.ReadUInt32()
  $sectionTableOff = $optStart + $sizeOfOptionalHeader
  $sections = @()
  $fs.Position = $sectionTableOff
  for ($i=0; $i -lt $numSections; $i++) {
    $null = [System.Text.Encoding]::ASCII.GetString($br.ReadBytes(8))
    $null = $br.ReadUInt32()
    $virtAddr = $br.ReadUInt32()
    $rawSize = $br.ReadUInt32()
    $rawOff = $br.ReadUInt32()
    $null = $br.ReadBytes(16)
    $sections += [PSCustomObject]@{ VA=$virtAddr; RawOff=$rawOff; RawSize=$rawSize }
  }
  function RvaToOffset($rva) {
    foreach ($s in $sections) {
      if ($rva -ge $s.VA -and $rva -lt ($s.VA + $s.RawSize)) { return $rva - $s.VA + $s.RawOff }
    }
    return $rva
  }
  $result = @()
  $descOff = RvaToOffset $importRVA
  while ($true) {
    $fs.Position = $descOff
    $null = $br.ReadUInt32(); $null = $br.ReadUInt32(); $null = $br.ReadUInt32()
    $nameRVA = $br.ReadUInt32()
    $null = $br.ReadUInt32()
    if ($nameRVA -eq 0) { break }
    $fs.Position = RvaToOffset $nameRVA
    $dllName = ""
    while ($true) { $c = $br.ReadByte(); if ($c -eq 0) { break }; $dllName += [char]$c }
    $result += $dllName
    $descOff += 20
  }
  $fs.Close()
  return $result
}

$dirs = @{
  'ASE (ShooterGameServer)' = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'
  'ASA (ArkAscendedServer)' = 'D:\arkascendedserver\ShooterGame\Binaries\Win64\ArkAscendedServer.exe'
}

foreach ($k in $dirs.Keys) {
  $exe = $dirs[$k]
  $serverDir = Split-Path $exe -Parent
  Write-Output ("=== {0} imports ===" -f $k)
  $imports = Get-Imports $exe
  $missing = @()
  foreach ($dll in $imports) {
    $inServer = Test-Path (Join-Path $serverDir $dll)
    $inSys = Test-Path (Join-Path 'C:\Windows\System32' $dll)
    if (-not $inServer -and -not $inSys) {
      $missing += $dll
      Write-Output ("  MISSING: {0}" -f $dll)
    }
  }
  if ($missing.Count -eq 0) { Write-Output "  (all DLLs present)" }
  Write-Output ("  total imports: {0}" -f $imports.Count)
}
